import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { decodeCursor, encodeCursor, isSafeJson, isSafeProjectId, ownerId, parseBody, validateSafePath } from '../lambda/validation.js';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

test('sync cursor preserves PostgreSQL microsecond timestamp precision', () => {
  const cursor = { updatedAt: '2026-10-03 12:00:00.123456+00', type: 'chats', id: 'chat-1' };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
});

test('sync cursor rejects unknown record type and malformed value', () => {
  const invalid = Buffer.from(JSON.stringify({ updatedAt: '2026-01-01T00:00:00Z', type: 'secrets', id: 'x' })).toString('base64url');
  assert.throws(() => decodeCursor(invalid), /Invalid sync cursor/);
  assert.throws(() => decodeCursor('not a cursor'), /Invalid sync cursor/);
});

test('credential-shaped settings are blocked recursively before sync', () => {
  assert.equal(isSafeJson({ theme: 'dark', nested: [{ fontSize: 14 }] }), true);
  assert.equal(isSafeJson({ nested: { apiKey: 'private' } }), false);
  assert.equal(isSafeJson({ provider: { refresh_token: 'private' } }), false);
  assert.equal(isSafeJson({ password: 'private' }), false);
});

test('file paths stay relative and reject traversal, absolute paths, and drive paths', () => {
  assert.equal(validateSafePath('src\\main.tsx', 'File path'), 'src/main.tsx');
  for (const unsafe of ['../outside', '/etc/passwd', 'C:\\Users\\secret', 'src/../../private', 'src//file']) {
    assert.throws(() => validateSafePath(unsafe, 'File path'));
  }
  assert.equal(isSafeProjectId('chat-123'), true);
  assert.equal(isSafeProjectId('../other-user'), false);
});

test('request body limits and verified Cognito subject are enforced', () => {
  const event = {
    body: JSON.stringify({ value: 'ok' }),
    isBase64Encoded: false,
    requestContext: { authorizer: { jwt: { claims: { sub: 'cognito-user-123' } } } },
  } as APIGatewayProxyEventV2WithJWTAuthorizer;
  assert.deepEqual(parseBody(event, 100), { value: 'ok' });
  assert.equal(ownerId(event), 'cognito-user-123');
  assert.equal(ownerId({ requestContext: { authorizer: { jwt: { claims: { sub: 'bad user' } } } } } as APIGatewayProxyEventV2WithJWTAuthorizer), undefined);
  assert.throws(() => parseBody({ ...event, body: 'x'.repeat(101) }, 100), /exceeds 256 KiB limit/);
});

test('API tenant row security is enabled and forced for every synced table', async () => {
  const schema = await readFile(new URL('../lambda/schema.sql', import.meta.url), 'utf8');
  for (const table of ['sync_records', 'sync_mutations', 'file_uploads', 'user_storage']) {
    assert.match(schema, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, 'i'));
    assert.match(schema, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`, 'i'));
    assert.match(schema, new RegExp(`CREATE POLICY ${table}_tenant[\\s\\S]*?current_setting\\('hedes.user_id', true\\)`, 'i'));
  }
});
