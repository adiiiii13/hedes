import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerSessionToken, verifyLocalSessionRequest, sanitizeErrorMessage } from '../app/utils/session-auth.server.ts';

test('server session token initializes securely', () => {
  const token = getServerSessionToken();
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 64); // 32 bytes hex
  // Consecutive calls return the same token
  assert.equal(getServerSessionToken(), token);
});

test('verifyLocalSessionRequest rejects non-loopback hosts', () => {
  const req = new Request('http://example.com/api/local/vault', {
    headers: {
      'X-Hedes-Session-Token': getServerSessionToken(),
    },
  });
  const res = verifyLocalSessionRequest(req);
  assert.ok(res !== null);
  assert.equal(res.status, 403);
});

test('verifyLocalSessionRequest rejects cross-site origins', () => {
  const req = new Request('http://localhost:5173/api/local/vault', {
    headers: {
      Origin: 'http://malicious-site.com',
      'X-Hedes-Session-Token': getServerSessionToken(),
    },
  });
  const res = verifyLocalSessionRequest(req);
  assert.ok(res !== null);
  assert.equal(res.status, 403);
});

test('verifyLocalSessionRequest rejects cross-site fetch site header', () => {
  const req = new Request('http://localhost:5173/api/local/vault', {
    headers: {
      'Sec-Fetch-Site': 'cross-site',
      'X-Hedes-Session-Token': getServerSessionToken(),
    },
  });
  const res = verifyLocalSessionRequest(req);
  assert.ok(res !== null);
  assert.equal(res.status, 403);
});

test('verifyLocalSessionRequest rejects missing session token', () => {
  const req = new Request('http://localhost:5173/api/local/vault', {
    headers: {},
  });
  const res = verifyLocalSessionRequest(req);
  assert.ok(res !== null);
  assert.equal(res.status, 401);
});

test('verifyLocalSessionRequest rejects invalid session token', () => {
  const req = new Request('http://localhost:5173/api/local/vault', {
    headers: {
      'X-Hedes-Session-Token': 'invalid-token-1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    },
  });
  const res = verifyLocalSessionRequest(req);
  assert.ok(res !== null);
  assert.equal(res.status, 401);
});

test('verifyLocalSessionRequest accepts loopback request with valid token', () => {
  const req = new Request('http://localhost:5173/api/local/vault', {
    headers: {
      'X-Hedes-Session-Token': getServerSessionToken(),
    },
  });
  const res = verifyLocalSessionRequest(req);
  assert.equal(res, null);
});

test('sanitizeErrorMessage strips absolute paths from error strings', () => {
  const winPath = 'Error reading file at C:\\Users\\adity\\AppData\\Roaming\\hedes\\secret.txt';
  const sanitized = sanitizeErrorMessage(new Error(winPath));
  assert.ok(!sanitized.includes('C:\\Users\\adity'));
  assert.ok(sanitized.includes('[path]'));
});
