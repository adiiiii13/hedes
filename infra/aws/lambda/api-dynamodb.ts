import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { decodeCursor, encodeCursor, isSafeJson, isSafeProjectId, ownerId, parseBody, recordTypes, validateSafePath } from './validation.js';

const maxBodyBytes = Number(process.env.MAX_SYNC_BYTES ?? 262_144);
const maxFileBytes = Number(process.env.MAX_FILE_BYTES ?? 26_214_400);
const maxFileStorageBytes = Number(process.env.MAX_FILE_STORAGE_BYTES ?? 536_870_912);
const maxSyncStorageBytes = Number(process.env.MAX_SYNC_STORAGE_BYTES ?? 104_857_600);
const tableName = process.env.DATA_TABLE ?? '';
export const tenantPartitionKey = (userId: string) => `USER#${userId}`;
const userPk = tenantPartitionKey;
const recordSk = (type: string, id: string) => `RECORD#${type}#${id}`;
const fileSk = (id: string) => `FILE#${id}`;
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

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

function requireTable() {
  if (!tableName) throw new Error('Cloud storage is not configured');
  return tableName;
}

function key(userId: string, sk: string) { return { PK: userPk(userId), SK: sk }; }

async function getItem(userId: string, sk: string) {
  const result = await ddb.send(new GetCommand({ TableName: requireTable(), Key: key(userId, sk), ConsistentRead: true }));
  return result.Item;
}

function isTransactionCancelled(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'TransactionCanceledException';
}

async function handlePull(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const query = event.queryStringParameters ?? {};
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '100', 10) || 100));
  const cursor = decodeCursor(query.cursor);
  const startKey = cursor?.key;
  if (startKey && (startKey.PK !== userPk(userId) || typeof startKey.SK !== 'string' || typeof startKey.GSI1SK !== 'string')) {
    return json(400, { error: 'Invalid sync cursor' });
  }
  const result = await ddb.send(new QueryCommand({
    TableName: requireTable(), IndexName: 'SyncByUpdate',
    KeyConditionExpression: 'GSI1PK = :pk' + (startKey ? ' AND GSI1SK > :cursor' : ''),
    ExpressionAttributeValues: { ':pk': userPk(userId), ...(startKey ? { ':cursor': startKey.GSI1SK } : {}) },
    ExclusiveStartKey: startKey,
    Limit: limit + 1,
    ScanIndexForward: true,
  }));
  const rows = result.Items ?? [];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return json(200, {
    records: page.map((row) => ({
      type: row.recordType,
      id: row.recordId,
      payload: row.payload,
      revision: row.revision,
      clientUpdatedAt: row.clientUpdatedAt,
      updatedAt: row.updatedAt,
      deleted: row.deleted,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor({ updatedAt: last.updatedAt, type: last.recordType, id: last.recordId, key: { PK: last.PK, SK: last.SK, GSI1PK: last.GSI1PK, GSI1SK: last.GSI1SK } }) : null,
  });
}

async function readCurrentRecords(userId: string, records: Array<z.infer<typeof pushSchema>['records'][number]>) {
  return Promise.all(records.map((record) => getItem(userId, recordSk(record.type, record.id))));
}

async function handlePush(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const input = pushSchema.safeParse(parseBody(event, maxBodyBytes));
  if (!input.success) return json(400, { error: 'Invalid sync batch', issues: input.error.issues.map((issue) => issue.message) });
  const table = requireTable();
  const mutationKey = key(userId, `MUTATION#${input.data.mutationId}`);
  const prior = await getItem(userId, mutationKey.SK);
  if (prior?.response) return json(200, prior.response);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentRecords = await readCurrentRecords(userId, input.data.records);
    const accepted: Array<{ type: string; id: string; revision: number }> = [];
    const conflicts: Array<{ type: string; id: string; currentRevision: number }> = [];
    const writes: Array<Record<string, unknown>> = [];
    let syncByteDelta = 0;
    for (let index = 0; index < input.data.records.length; index += 1) {
      const record = input.data.records[index];
      const current = currentRecords[index];
      const revision = Number(current?.revision ?? 0);
      if (revision !== record.baseRevision) {
        conflicts.push({ type: record.type, id: record.id, currentRevision: revision });
        continue;
      }
      const itemBytes = Buffer.byteLength(JSON.stringify(record.payload), 'utf8');
      syncByteDelta += itemBytes - Number(current?.itemBytes ?? 0);
      const now = new Date().toISOString();
      const nextRevision = revision + 1;
      writes.push({
        Update: {
          TableName: table,
          Key: key(userId, recordSk(record.type, record.id)),
          ConditionExpression: revision === 0 ? 'attribute_not_exists(PK)' : 'revision = :baseRevision',
          UpdateExpression: 'SET recordType = :type, recordId = :id, payload = :payload, revision = :nextRevision, clientUpdatedAt = :clientUpdatedAt, updatedAt = :updatedAt, deleted = :deleted, mutationId = :mutationId, itemBytes = :itemBytes, GSI1PK = :gsiPk, GSI1SK = :gsiSk',
          ExpressionAttributeValues: {
            ...(revision === 0 ? {} : { ':baseRevision': revision }),
            ':type': record.type,
            ':id': record.id,
            ':payload': record.payload,
            ':nextRevision': nextRevision,
            ':clientUpdatedAt': record.clientUpdatedAt,
            ':updatedAt': now,
            ':deleted': record.deleted,
            ':mutationId': input.data.mutationId,
            ':itemBytes': itemBytes,
            ':gsiPk': userPk(userId),
            ':gsiSk': `${now}#${record.type}#${record.id}`,
          },
        },
      });
      accepted.push({ type: record.type, id: record.id, revision: nextRevision });
    }

    const response = { accepted, conflicts };
    if (writes.length) {
      const storageKey = key(userId, 'STORAGE');
      writes.push({
        Update: {
          TableName: table,
          Key: storageKey,
          ConditionExpression: '(attribute_not_exists(syncBytes) OR syncBytes + :delta <= :limit) AND (attribute_not_exists(syncBytes) OR syncBytes + :delta >= :zero)',
          UpdateExpression: 'SET syncBytes = if_not_exists(syncBytes, :zero) + :delta',
          ExpressionAttributeValues: { ':delta': syncByteDelta, ':limit': maxSyncStorageBytes, ':zero': 0 },
        },
      });
    }
    writes.push({ Put: {
      TableName: table,
      Item: { ...mutationKey, response, expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 },
      ConditionExpression: 'attribute_not_exists(PK)',
    } });

    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: writes as never[] }));
      return json(200, response);
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      const repeated = await getItem(userId, mutationKey.SK);
      if (repeated?.response) return json(200, repeated.response);
      if (attempt === 2) return json(409, { error: 'Sync changed on another device. Pull again and retry.' });
      const usage = await getItem(userId, 'STORAGE');
      if (Number(usage?.syncBytes ?? 0) + syncByteDelta > maxSyncStorageBytes) {
        return json(413, { error: 'Account sync history limit of 100 MiB exceeded' });
      }
    }
  }
  return json(409, { error: 'Could not commit sync batch' });
}

async function handleUpload(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const body = parseBody(event, maxBodyBytes);
  const projectId = String(body.projectId ?? '');
  if (!isSafeProjectId(projectId)) return json(400, { error: 'Project ID is invalid' });
  const filePath = validateSafePath(String(body.path ?? ''), 'File path');
  const bytes = Number(body.bytes);
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxFileBytes) return json(400, { error: 'File size must be between 1 byte and 25 MiB' });
  const contentType = typeof body.contentType === 'string' && /^[\w.+-]+\/[\w.+-]+(?:;[\w=.+-]+)?$/.test(body.contentType)
    ? body.contentType.slice(0, 128) : 'application/octet-stream';
  const bucket = process.env.FILES_BUCKET;
  if (!bucket) throw new Error('File storage is not configured');
  const fileId = globalThis.crypto.randomUUID();
  const objectKey = `users/${userId}/${projectId}/${fileId}`;
  const pending = await ddb.send(new QueryCommand({
    TableName: requireTable(), KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    FilterExpression: '#status = :pending', ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':pk': userPk(userId), ':prefix': 'FILE#', ':pending': 'pending' },
    Limit: 20,
  }));
  if ((pending.Items ?? []).length >= 5) return json(429, { error: 'Too many pending file uploads. Finish or retry an existing upload.' });

  const now = new Date().toISOString();
  await ddb.send(new PutCommand({
    TableName: requireTable(),
    Item: { ...key(userId, fileSk(fileId)), entity: 'file', fileId, projectId, filePath, objectKey, declaredBytes: bytes, contentType, status: 'pending', createdAt: now, expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60 },
    ConditionExpression: 'attribute_not_exists(PK)',
  }));
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: bucket, Key: objectKey, ContentLength: bytes, ContentType: contentType,
    Tagging: 'hedes-state=pending', Metadata: { 'hedes-owner': userId, 'hedes-file-id': fileId },
  }), { expiresIn: 300 });
  return json(200, {
    fileId, path: filePath, uploadUrl,
    requiredHeaders: { 'content-type': contentType, 'x-amz-tagging': 'hedes-state=pending', 'x-amz-meta-hedes-owner': userId, 'x-amz-meta-hedes-file-id': fileId },
    expiresIn: 300,
  });
}

async function handleUploadComplete(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const body = parseBody(event, maxBodyBytes);
  const parsedFileId = z.string().uuid().safeParse(body.fileId);
  if (!parsedFileId.success) return json(400, { error: 'File ID must be a UUID' });
  const bucket = process.env.FILES_BUCKET;
  if (!bucket) throw new Error('File storage is not configured');
  const fileId = parsedFileId.data;
  const file = await getItem(userId, fileSk(fileId));
  if (!file) return json(404, { error: 'Pending upload not found' });
  if (file.status === 'deleted' || file.status === 'rejected') return json(404, { error: 'Pending upload not found' });
  let object;
  try { object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file.objectKey })); }
  catch (error) {
    if (typeof error === 'object' && error !== null && '$metadata' in error && Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode) === 404) {
      return json(400, { error: 'Uploaded file was not found. Start upload again.' });
    }
    throw error;
  }
  const actualBytes = Number(object.ContentLength ?? 0);
  if (object.Metadata?.['hedes-owner'] !== userId || object.Metadata?.['hedes-file-id'] !== fileId || actualBytes !== Number(file.declaredBytes) || actualBytes <= 0 || actualBytes > maxFileBytes) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.objectKey }));
    await ddb.send(new UpdateCommand({ TableName: requireTable(), Key: key(userId, fileSk(fileId)), UpdateExpression: 'SET #status = :rejected', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':rejected': 'rejected', ':pending': 'pending' }, ConditionExpression: '#status = :pending' })).catch(() => undefined);
    return json(400, { error: 'Uploaded file failed validation' });
  }

  const now = new Date().toISOString();
  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: [
      { Update: {
        TableName: requireTable(), Key: key(userId, fileSk(fileId)),
        UpdateExpression: 'SET #status = :complete, completedAt = :now, GSI2PK = :gsiPk, GSI2SK = :gsiSk REMOVE expiresAt',
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':complete': 'complete', ':pending': 'pending', ':now': now, ':gsiPk': userPk(userId), ':gsiSk': `PROJECT#${file.projectId}#${now}#${fileId}` },
      } },
      { Update: {
        TableName: requireTable(), Key: key(userId, 'STORAGE'),
        UpdateExpression: 'SET fileBytes = if_not_exists(fileBytes, :zero) + :bytes',
        ConditionExpression: '(attribute_not_exists(fileBytes) OR fileBytes + :bytes <= :limit) AND (attribute_not_exists(fileBytes) OR fileBytes + :bytes >= :bytes)',
        ExpressionAttributeValues: { ':zero': 0, ':bytes': actualBytes, ':limit': maxFileStorageBytes },
      } },
    ] }));
  } catch (error) {
    const latest = await getItem(userId, fileSk(fileId));
    if (latest?.status === 'complete') {
      await s3.send(new PutObjectTaggingCommand({ Bucket: bucket, Key: file.objectKey, Tagging: { TagSet: [{ Key: 'hedes-state', Value: 'complete' }] } }));
      return json(200, { fileId, bytes: actualBytes, status: 'complete' });
    }
    if (!isTransactionCancelled(error)) throw error;
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.objectKey }));
    await ddb.send(new UpdateCommand({ TableName: requireTable(), Key: key(userId, fileSk(fileId)), UpdateExpression: 'SET #status = :rejected REMOVE expiresAt', ConditionExpression: '#status = :pending', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':status': 'pending', ':pending': 'pending', ':rejected': 'rejected' } })).catch(() => undefined);
    return json(413, { error: 'Account file storage limit of 512 MiB exceeded' });
  }
  await s3.send(new PutObjectTaggingCommand({ Bucket: bucket, Key: file.objectKey, Tagging: { TagSet: [{ Key: 'hedes-state', Value: 'complete' }] } }));
  return json(200, { fileId, bytes: actualBytes, status: 'complete' });
}

async function handleDeleteFile(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const body = parseBody(event, maxBodyBytes);
  const parsedFileId = z.string().uuid().safeParse(body.fileId);
  if (!parsedFileId.success) return json(400, { error: 'File ID must be a UUID' });
  const fileId = parsedFileId.data;
  const bucket = process.env.FILES_BUCKET;
  if (!bucket) throw new Error('File storage is not configured');
  let file = await getItem(userId, fileSk(fileId));
  if (!file || file.status === 'deleted' || file.status === 'rejected') return json(404, { error: 'File not found' });
  if (file.status === 'complete') {
    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: [
        { Update: { TableName: requireTable(), Key: key(userId, fileSk(fileId)), UpdateExpression: 'SET #status = :deleting REMOVE GSI2PK, GSI2SK', ConditionExpression: '#status = :complete', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':deleting': 'deleting', ':complete': 'complete' } } },
        { Update: { TableName: requireTable(), Key: key(userId, 'STORAGE'), UpdateExpression: 'SET fileBytes = fileBytes - :bytes', ConditionExpression: 'fileBytes >= :bytes', ExpressionAttributeValues: { ':bytes': Number(file.declaredBytes) } } },
      ] }));
      file = { ...file, status: 'deleting' };
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      file = await getItem(userId, fileSk(fileId));
      if (file?.status !== 'deleting') return json(409, { error: 'File changed during deletion. Retry.' });
    }
  } else if (file.status === 'pending') {
    await ddb.send(new UpdateCommand({ TableName: requireTable(), Key: key(userId, fileSk(fileId)), UpdateExpression: 'SET #status = :deleting REMOVE expiresAt', ConditionExpression: '#status = :pending', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':deleting': 'deleting', ':pending': 'pending' } }));
  }
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.objectKey }));
  await ddb.send(new UpdateCommand({ TableName: requireTable(), Key: key(userId, fileSk(fileId)), UpdateExpression: 'SET #status = :deleted, expiresAt = :expires REMOVE GSI2PK, GSI2SK', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':deleted': 'deleted', ':expires': Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, ':deleting': 'deleting' }, ConditionExpression: '#status = :deleting' }));
  return json(200, { fileId, deleted: true });
}

async function handleDownload(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const body = parseBody(event, maxBodyBytes);
  const parsedFileId = z.string().uuid().safeParse(body.fileId);
  if (!parsedFileId.success) return json(400, { error: 'File ID must be a UUID' });
  const file = await getItem(userId, fileSk(parsedFileId.data));
  if (!file || file.status !== 'complete') return json(404, { error: 'File not found' });
  const bucket = process.env.FILES_BUCKET;
  if (!bucket) throw new Error('File storage is not configured');
  const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: file.objectKey, ResponseContentDisposition: 'attachment' }), { expiresIn: 300 });
  return json(200, { path: file.filePath, contentType: file.contentType, downloadUrl, expiresIn: 300 });
}

async function handleListFiles(event: APIGatewayProxyEventV2WithJWTAuthorizer, userId: string) {
  const query = event.queryStringParameters ?? {};
  const projectId = String(query.projectId ?? '');
  if (!isSafeProjectId(projectId)) return json(400, { error: 'Project ID is invalid' });
  const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit ?? '100', 10) || 100));
  let startKey: Record<string, unknown> | undefined;
  if (query.cursor) {
    try {
      startKey = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
      if (startKey.PK !== userPk(userId) || typeof startKey.SK !== 'string' || typeof startKey.GSI2SK !== 'string' || !startKey.GSI2SK.startsWith(`PROJECT#${projectId}#`)) throw new Error('invalid');
    } catch { return json(400, { error: 'Invalid file cursor' }); }
  }
  const [files, usage] = await Promise.all([
    ddb.send(new QueryCommand({
      TableName: requireTable(), IndexName: 'FilesByProject',
      KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :project)',
      ExpressionAttributeValues: { ':pk': userPk(userId), ':project': `PROJECT#${projectId}#` },
      ExclusiveStartKey: startKey,
      Limit: limit + 1,
      ScanIndexForward: true,
    })),
    getItem(userId, 'STORAGE'),
  ]);
  const rows = files.Items ?? [];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return json(200, {
    files: page.map((file) => ({ fileId: file.fileId, path: file.filePath, bytes: file.declaredBytes, contentType: file.contentType, createdAt: file.createdAt })),
    usedBytes: Number(usage?.fileBytes ?? 0),
    quotaBytes: maxFileStorageBytes,
    nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ PK: last.PK, SK: last.SK, GSI2PK: last.GSI2PK, GSI2SK: last.GSI2SK })).toString('base64url') : null,
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
    const status = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
    console.error('HEDES cloud request failed', { status, name: error instanceof Error ? error.name : 'UnknownError' });
    return json(status >= 400 && status < 500 ? status : 500, { error: status >= 500 ? 'Internal server error' : error instanceof Error ? error.message : 'Invalid request' });
  }
}
