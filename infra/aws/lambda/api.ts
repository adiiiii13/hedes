import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, PutObjectTaggingCommand, S3Client, type HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Signer } from '@aws-sdk/rds-signer';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';
import rdsCaBundle from '../certs/ap-south-1-bundle.pem';
import { decodeCursor, encodeCursor, isSafeJson, isSafeProjectId, ownerId, parseBody, recordTypes, validateSafePath } from './validation.js';

const maxBodyBytes = Number(process.env.MAX_SYNC_BYTES ?? 262_144);
const maxFileBytes = Number(process.env.MAX_FILE_BYTES ?? 26_214_400);
const maxStorageBytes = 2 * 1024 * 1024 * 1024;
const jsonValue = z.unknown().refine((value) => value !== undefined && isSafeJson(value), 'Payload must be JSON and must not contain credential fields');
const pushSchema = z.object({
  mutationId: z.string().uuid(),
  records: z.array(z.object({
    type: z.enum(recordTypes),
    id: z.string().min(1).max(200),
    baseRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    clientUpdatedAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    deleted: z.boolean().default(false),
    payload: jsonValue,
  })).min(1).max(50),
}).strict();

let pool: Pool | undefined;
const s3 = new S3Client({});

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const host = process.env.DB_HOST;
  const region = process.env.AWS_REGION;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;
  if (!host || !region || !user || !database) throw new Error('Database configuration is incomplete');
  const signer = new Signer({ hostname: host, port: Number(process.env.DB_PORT ?? 5432), username: user, region });
  pool = new Pool({
    host,
    port: Number(process.env.DB_PORT ?? 5432),
    user,
    database,
    max: Number(process.env.DB_POOL_MAX ?? 4),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: { rejectUnauthorized: true, ca: rdsCaBundle },
    password: () => signer.getAuthToken(),
  });
  return pool;
}

async function withTenant<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('hedes.user_id', $1, true)", [userId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function handlePull(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const query = event.queryStringParameters ?? {};
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '100', 10) || 100));
  const cursor = decodeCursor(query.cursor);
  const records = await withTenant(userId, async (client) => {
    const rows = cursor
      ? await client.query(
        `SELECT record_type, record_id, payload, revision, client_updated_at, updated_at, updated_at::text AS cursor_time, deleted
         FROM sync_records
         WHERE user_id = $1 AND (updated_at, record_type, record_id) > ($2, $3, $4)
         ORDER BY updated_at, record_type, record_id LIMIT $5`,
        [userId, cursor.updatedAt, cursor.type, cursor.id, limit + 1],
      )
      : await client.query(
        `SELECT record_type, record_id, payload, revision, client_updated_at, updated_at, updated_at::text AS cursor_time, deleted
         FROM sync_records WHERE user_id = $1
         ORDER BY updated_at, record_type, record_id LIMIT $2`, [userId, limit + 1],
      );
    return rows.rows;
  });
  const hasMore = records.length > limit;
  const page = hasMore ? records.slice(0, limit) : records;
  const last = page.at(-1);
  return json(200, {
    records: page.map((row) => ({
      type: row.record_type,
      id: row.record_id,
      payload: row.payload,
      revision: Number(row.revision),
      clientUpdatedAt: new Date(row.client_updated_at).getTime(),
      updatedAt: new Date(row.updated_at).toISOString(),
      deleted: row.deleted,
    })),
    nextCursor: hasMore && last
      ? encodeCursor({ updatedAt: last.cursor_time, type: last.record_type, id: last.record_id })
      : null,
  });
}

async function handlePush(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const input = pushSchema.safeParse(parseBody(event, maxBodyBytes));
  if (!input.success) return json(400, { error: 'Invalid sync batch', issues: input.error.issues.map((issue) => issue.message) });
  const result = await withTenant(userId, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
    const prior = await client.query(
      'SELECT response FROM sync_mutations WHERE user_id = $1 AND mutation_id = $2',
      [userId, input.data.mutationId],
    );
    if (prior.rowCount) return prior.rows[0].response;

    const accepted: Array<{ type: string; id: string; revision: number }> = [];
    const conflicts: Array<{ type: string; id: string; currentRevision: number }> = [];
    for (const record of input.data.records) {
      const current = await client.query(
        'SELECT revision FROM sync_records WHERE user_id = $1 AND record_type = $2 AND record_id = $3 FOR UPDATE',
        [userId, record.type, record.id],
      );
      const revision = current.rowCount ? Number(current.rows[0].revision) : 0;
      if (revision !== record.baseRevision) {
        conflicts.push({ type: record.type, id: record.id, currentRevision: revision });
        continue;
      }
      const updated = await client.query(
        `INSERT INTO sync_records
          (user_id, record_type, record_id, payload, revision, client_updated_at, updated_at, deleted, mutation_id)
         VALUES ($1, $2, $3, $4::jsonb, 1, to_timestamp($5 / 1000.0), now(), $6, $7)
         ON CONFLICT (user_id, record_type, record_id) DO UPDATE SET
          payload = EXCLUDED.payload, revision = sync_records.revision + 1,
          client_updated_at = EXCLUDED.client_updated_at, updated_at = now(),
          deleted = EXCLUDED.deleted, mutation_id = EXCLUDED.mutation_id
         RETURNING revision`,
        [userId, record.type, record.id, JSON.stringify(record.payload), record.clientUpdatedAt, record.deleted, input.data.mutationId],
      );
      accepted.push({ type: record.type, id: record.id, revision: Number(updated.rows[0].revision) });
    }
    const response = { accepted, conflicts };
    await client.query(
      `INSERT INTO sync_mutations (user_id, mutation_id, response) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id, mutation_id) DO NOTHING`,
      [userId, input.data.mutationId, JSON.stringify(response)],
    );
    await client.query("DELETE FROM sync_mutations WHERE user_id = $1 AND created_at < now() - interval '30 days'", [userId]);
    return response;
  });
  return json(200, result);
}

async function handleUpload(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const body = parseBody(event, maxBodyBytes);
  const projectId = String(body.projectId ?? '');
  if (!isSafeProjectId(projectId)) {
    return json(400, { error: 'Project ID is invalid' });
  }
  const filePath = validateSafePath(String(body.path ?? ''), 'File path');
  const bytes = Number(body.bytes);
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxFileBytes) return json(400, { error: 'File size must be between 1 byte and 25 MiB' });
  const contentType = typeof body.contentType === 'string' && /^[\w.+-]+\/[\w.+-]+(?:;[\w=.+-]+)?$/.test(body.contentType)
    ? body.contentType.slice(0, 128) : 'application/octet-stream';
  const fileId = globalThis.crypto.randomUUID();
  const objectKey = `users/${userId}/${projectId}/${fileId}`;
  const storage = await withTenant(userId, async (client) => {
    await client.query(
      'INSERT INTO user_storage (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId],
    );
    const current = await client.query('SELECT used_bytes FROM user_storage WHERE user_id = $1 FOR UPDATE', [userId]);
    if (Number(current.rows[0].used_bytes) + bytes > maxStorageBytes) return false;
    const pending = await client.query(
      `SELECT count(*)::int AS count, COALESCE(sum(declared_bytes), 0)::bigint AS bytes
       FROM file_uploads WHERE user_id = $1 AND status = 'pending' AND created_at > now() - interval '1 day'`,
      [userId],
    );
    if (pending.rows[0].count >= 5 || Number(pending.rows[0].bytes) + bytes > 100 * 1024 * 1024) {
      return false;
    }
    await client.query("DELETE FROM file_uploads WHERE user_id = $1 AND status IN ('deleted', 'pending') AND created_at < now() - interval '30 days'", [userId]);
    await client.query(
      `INSERT INTO file_uploads (user_id, file_id, object_key, project_id, file_path, declared_bytes, content_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [userId, fileId, objectKey, projectId, filePath, bytes, contentType],
    );
    return true;
  });
  if (!storage) return json(413, { error: 'Account storage limit of 2 GiB or pending upload limit exceeded' });
  const bucket = process.env.FILES_BUCKET;
  if (!bucket) throw new Error('File storage is not configured');
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentLength: bytes,
    ContentType: contentType,
    Tagging: 'hedes-state=pending',
    Metadata: { 'hedes-owner': userId, 'hedes-file-id': fileId },
  }), { expiresIn: 300 });
  return json(200, {
    fileId,
    path: filePath,
    uploadUrl,
    requiredHeaders: {
      'content-type': contentType,
      'x-amz-tagging': 'hedes-state=pending',
      'x-amz-meta-hedes-owner': userId,
      'x-amz-meta-hedes-file-id': fileId,
    },
    expiresIn: 300,
  });
}

async function handleUploadComplete(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const body = parseBody(event, maxBodyBytes);
  const fileId = z.string().uuid().safeParse(body.fileId);
  if (!fileId.success) return json(400, { error: 'File ID must be a UUID' });
  const bucket = process.env.FILES_BUCKET;
  if (!bucket) throw new Error('File storage is not configured');
  const result = await withTenant(userId, async (client) => {
    const found = await client.query(
      `SELECT object_key, declared_bytes, status FROM file_uploads
       WHERE user_id = $1 AND file_id = $2 FOR UPDATE`, [userId, fileId.data],
    );
    if (!found.rowCount) return { status: 'missing' as const };
    const upload = found.rows[0];
    if (upload.status === 'complete') return { status: 'complete' as const, bytes: Number(upload.declared_bytes) };
    if (upload.status !== 'pending') return { status: 'missing' as const };
    let object: HeadObjectCommandOutput;
    try {
      object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: upload.object_key }));
    } catch (error) {
      if (typeof error === 'object' && error !== null && '$metadata' in error
        && Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode) === 404) {
        await client.query("UPDATE file_uploads SET status = 'deleted', updated_at = now() WHERE user_id = $1 AND file_id = $2", [userId, fileId.data]);
        return { status: 'invalid' as const, key: upload.object_key };
      }
      throw error;
    }
    const bytes = Number(object.ContentLength ?? 0);
    if (object.Metadata?.['hedes-owner'] !== userId || object.Metadata?.['hedes-file-id'] !== fileId.data
      || bytes !== Number(upload.declared_bytes) || bytes <= 0 || bytes > maxFileBytes) {
      await client.query("UPDATE file_uploads SET status = 'deleted', updated_at = now() WHERE user_id = $1 AND file_id = $2", [userId, fileId.data]);
      return { status: 'invalid' as const, key: upload.object_key };
    }
    await client.query('INSERT INTO user_storage (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const usage = await client.query('SELECT used_bytes FROM user_storage WHERE user_id = $1 FOR UPDATE', [userId]);
    if (Number(usage.rows[0].used_bytes) + bytes > maxStorageBytes) {
      await client.query("UPDATE file_uploads SET status = 'deleted', updated_at = now() WHERE user_id = $1 AND file_id = $2", [userId, fileId.data]);
      return { status: 'quota' as const, key: upload.object_key };
    }
    await s3.send(new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: upload.object_key,
      Tagging: { TagSet: [{ Key: 'hedes-state', Value: 'complete' }] },
    }));
    await client.query('UPDATE user_storage SET used_bytes = used_bytes + $2, updated_at = now() WHERE user_id = $1', [userId, bytes]);
    await client.query(
      "UPDATE file_uploads SET status = 'complete', object_version_id = $3, updated_at = now() WHERE user_id = $1 AND file_id = $2",
      [userId, fileId.data, object.VersionId ?? null],
    );
    return { status: 'complete' as const, bytes };
  });
  if (result.status === 'missing') return json(404, { error: 'Pending upload not found or already completed' });
  if (result.status === 'invalid' || result.status === 'quota') {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: result.key }));
    return json(result.status === 'quota' ? 413 : 400, {
      error: result.status === 'quota' ? 'Account storage limit of 2 GiB exceeded' : 'Uploaded file failed validation',
    });
  }
  return json(200, { fileId: fileId.data, bytes: result.bytes, status: 'complete' });
}

async function handleDeleteFile(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const body = parseBody(event, maxBodyBytes);
  const fileId = z.string().uuid().safeParse(body.fileId);
  if (!fileId.success) return json(400, { error: 'File ID must be a UUID' });
  const file = await withTenant(userId, async (client) => {
    const found = await client.query(
      'SELECT object_key, object_version_id, declared_bytes, status FROM file_uploads WHERE user_id = $1 AND file_id = $2 FOR UPDATE',
      [userId, fileId.data],
    );
    if (!found.rowCount || found.rows[0].status === 'deleted') return null;
    const row = found.rows[0];
    if (row.status === 'complete') {
      await client.query(
        'UPDATE user_storage SET used_bytes = GREATEST(0, used_bytes - $2), updated_at = now() WHERE user_id = $1',
        [userId, Number(row.declared_bytes)],
      );
    }
    await client.query("UPDATE file_uploads SET status = 'deleting', updated_at = now() WHERE user_id = $1 AND file_id = $2", [userId, fileId.data]);
    return { key: row.object_key, versionId: row.object_version_id as string | null };
  });
  if (!file) return json(404, { error: 'File not found' });
  const bucket = process.env.FILES_BUCKET;
  if (!bucket) throw new Error('File storage is not configured');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.key, VersionId: file.versionId ?? undefined }));
  await withTenant(userId, async (client) => {
    await client.query("UPDATE file_uploads SET status = 'deleted', updated_at = now() WHERE user_id = $1 AND file_id = $2 AND status = 'deleting'", [userId, fileId.data]);
  });
  return json(200, { fileId: fileId.data, deleted: true });
}

async function handleDownload(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const body = parseBody(event, maxBodyBytes);
  const fileId = z.string().uuid().safeParse(body.fileId);
  if (!fileId.success) return json(400, { error: 'File ID must be a UUID' });
  const file = await withTenant(userId, async (client) => client.query(
    `SELECT object_key, file_path, content_type FROM file_uploads
     WHERE user_id = $1 AND file_id = $2 AND status = 'complete'`, [userId, fileId.data],
  ));
  if (!file.rowCount) return json(404, { error: 'File not found' });
  const bucket = process.env.FILES_BUCKET;
  if (!bucket) throw new Error('File storage is not configured');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: bucket,
    Key: file.rows[0].object_key,
    ResponseContentDisposition: 'attachment',
  }), { expiresIn: 300 });
  return json(200, { path: file.rows[0].file_path, contentType: file.rows[0].content_type, downloadUrl, expiresIn: 300 });
}

async function handleListFiles(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const query = event.queryStringParameters ?? {};
  const projectId = String(query.projectId ?? '');
  if (!isSafeProjectId(projectId)) return json(400, { error: 'Project ID is invalid' });
  const limit = Math.min(500, Math.max(1, Number.parseInt(query.limit ?? '200', 10) || 200));
  let cursor: { createdAt: string; id: string } | null = null;
  if (query.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
      if (typeof parsed.createdAt !== 'string' || !Number.isFinite(Date.parse(parsed.createdAt))
        || typeof parsed.id !== 'string' || !z.string().uuid().safeParse(parsed.id).success) throw new Error('invalid');
      cursor = parsed as { createdAt: string; id: string };
    } catch {
      return json(400, { error: 'Invalid file cursor' });
    }
  }
  const result = await withTenant(userId, async (client) => {
    const usage = await client.query('SELECT used_bytes FROM user_storage WHERE user_id = $1', [userId]);
    const files = cursor
      ? await client.query(
        `SELECT file_id, file_path, declared_bytes, content_type, created_at, created_at::text AS cursor_time
         FROM file_uploads WHERE user_id = $1 AND project_id = $2 AND status = 'complete'
           AND (created_at, file_id) > ($3, $4)
         ORDER BY created_at, file_id LIMIT $5`, [userId, projectId, cursor.createdAt, cursor.id, limit + 1],
      )
      : await client.query(
        `SELECT file_id, file_path, declared_bytes, content_type, created_at, created_at::text AS cursor_time
         FROM file_uploads WHERE user_id = $1 AND project_id = $2 AND status = 'complete'
         ORDER BY created_at, file_id LIMIT $3`, [userId, projectId, limit + 1],
      );
    return { usedBytes: Number(usage.rows[0]?.used_bytes ?? 0), rows: files.rows };
  });
  const hasMore = result.rows.length > limit;
  const page = hasMore ? result.rows.slice(0, limit) : result.rows;
  const last = page.at(-1);
  return json(200, {
    files: page.map((file) => ({
      fileId: file.file_id,
      path: file.file_path,
      bytes: Number(file.declared_bytes),
      contentType: file.content_type,
      createdAt: new Date(file.created_at).toISOString(),
    })),
    usedBytes: result.usedBytes,
    quotaBytes: maxStorageBytes,
    nextCursor: hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.cursor_time, id: last.file_id })).toString('base64url')
      : null,
  });
}

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const userId = ownerId(event);
  if (!userId) return json(401, { error: 'Valid sign-in required' });
  try {
    const route = `${event.requestContext.http.method} ${event.rawPath}`;
    if (route === 'GET /v1/me') return json(200, { userId, stage: process.env.HEDES_STAGE ?? 'beta' });
    if (route === 'GET /v1/sync/pull') return handlePull(event, userId);
    if (route === 'POST /v1/sync/push') return handlePush(event, userId);
    if (route === 'POST /v1/files/upload') return handleUpload(event, userId);
    if (route === 'POST /v1/files/complete') return handleUploadComplete(event, userId);
    if (route === 'POST /v1/files/delete') return handleDeleteFile(event, userId);
    if (route === 'POST /v1/files/download') return handleDownload(event, userId);
    if (route === 'GET /v1/files/list') return handleListFiles(event, userId);
    return json(404, { error: 'Route not found' });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number(error.statusCode) : 500;
    console.error('HEDES cloud request failed', { status, name: error instanceof Error ? error.name : 'UnknownError' });
    return json(status >= 400 && status < 500 ? status : 500, {
      error: status >= 500 ? 'Internal server error' : error instanceof Error ? error.message : 'Invalid request',
    });
  }
}
