import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeCursor, encodeCursor, isSafeJson, isSafeProjectId, ownerId, parseBody, validateSafePath } from '../lambda/validation.js';
import { tenantPartitionKey } from '../lambda/api-dynamodb.js';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

test('sync cursor preserves DynamoDB pagination key across devices', () => {
  const cursor = { updatedAt: '2026-10-03T12:00:00.123Z', type: 'chats', id: 'chat-1', key: { PK: 'USER#user-1', SK: 'RECORD#chats#chat-1', GSI1PK: 'USER#user-1', GSI1SK: '2026-10-03T12:00:00.123Z#chats#chat-1' } };
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

test('DynamoDB tenant partition keys derive only from the verified Cognito subject', () => {
  const event = { requestContext: { authorizer: { jwt: { claims: { sub: 'cognito-user-123' } } } } } as APIGatewayProxyEventV2WithJWTAuthorizer;
  const verifiedOwner = ownerId(event);
  assert.equal(verifiedOwner, 'cognito-user-123');
  assert.equal(tenantPartitionKey(verifiedOwner!), 'USER#cognito-user-123');
  assert.notEqual(tenantPartitionKey(verifiedOwner!), tenantPartitionKey('cognito-user-456'));
});
