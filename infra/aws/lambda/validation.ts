import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export const recordTypes = ['chats', 'council_sessions', 'settings', 'memory', 'projects'] as const;

export function isSafeJson(value: unknown, depth = 0): boolean {
  if (depth > 30) return false;
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.length <= 10_000 && value.every((item) => isSafeJson(item, depth + 1));
  if (typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).every(([key, child]) =>
    !/(^|_)(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|credential)(_|$)/i.test(key)
    && isSafeJson(child, depth + 1));
}

export function ownerId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string | undefined {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  return typeof sub === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(sub) ? sub : undefined;
}

export function parseBody(event: APIGatewayProxyEventV2WithJWTAuthorizer, maxBytes: number): Record<string, unknown> {
  if (!event.body) throw Object.assign(new Error('Request body is required'), { statusCode: 400 });
  const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
  if (body.byteLength > maxBytes) throw Object.assign(new Error('Request body exceeds 256 KiB limit'), { statusCode: 413 });
  try {
    const value: unknown = JSON.parse(body.toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Body must be a JSON object');
    return value as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Request body must contain valid JSON'), { statusCode: 400 });
  }
}

export function encodeCursor(cursor: { updatedAt: string; type: string; id: string; key?: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(value: string | undefined): { updatedAt: string; type: string; id: string; key?: Record<string, unknown> } | null {
  if (!value) return null;
  if (value.length > 512) throw Object.assign(new Error('Invalid sync cursor'), { statusCode: 400 });
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof cursor.updatedAt !== 'string' || !Number.isFinite(Date.parse(cursor.updatedAt))
      || typeof cursor.type !== 'string' || !recordTypes.includes(cursor.type as typeof recordTypes[number])
      || typeof cursor.id !== 'string'
      || (cursor.key !== undefined && (!cursor.key || typeof cursor.key !== 'object' || Array.isArray(cursor.key)))) throw new Error('invalid');
    return cursor as { updatedAt: string; type: string; id: string; key?: Record<string, unknown> };
  } catch {
    throw Object.assign(new Error('Invalid sync cursor'), { statusCode: 400 });
  }
}

export function validateSafePath(value: string, label: string): string {
  if (value.startsWith('/') || /^[a-zA-Z]:/.test(value)) {
    throw Object.assign(new Error(`${label} must be a relative path`), { statusCode: 400 });
  }
  const normalized = value.replaceAll('\\', '/');
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')
    || normalized.length > 512 || /[\u0000-\u001f]/.test(normalized)) {
    throw Object.assign(new Error(`${label} is invalid`), { statusCode: 400 });
  }
  return normalized;
}

export function isSafeProjectId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) && value !== '.' && value !== '..';
}
