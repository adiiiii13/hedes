import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, decideRecordSync, fingerprint, syncLocalHistory } from '../app/utils/cloud-sync.client.ts';

test('cloud sync decisions preserve non-conflicting local and remote edits', () => {
  assert.equal(decideRecordSync({ localExists: false, serverHash: 'remote', serverRevision: 1 }), 'download');
  assert.equal(decideRecordSync({ localExists: true, localHash: 'same', serverHash: 'same', serverRevision: 3 }), 'unchanged');
  assert.equal(decideRecordSync({
    localExists: true,
    localHash: 'old',
    serverHash: 'new',
    serverRevision: 2,
    previous: { revision: 1, hash: 'old' },
  }), 'download');
  assert.equal(decideRecordSync({
    localExists: true,
    localHash: 'local-new',
    serverHash: 'old',
    serverRevision: 1,
    previous: { revision: 1, hash: 'old' },
  }), 'upload');
  assert.equal(decideRecordSync({
    localExists: true,
    localHash: 'local-new',
    serverHash: 'remote-new',
    serverRevision: 2,
    previous: { revision: 1, hash: 'old' },
  }), 'conflict');
});

test('cloud fingerprints are stable and exclude credential-shaped fields', async () => {
  assert.equal(canonicalJson({ z: 1, a: { api_key: 'private', keep: true } }), '{"a":{"keep":true},"z":1}');
  assert.equal(await fingerprint({ a: 1, b: 2 }), await fingerprint({ b: 2, a: 1 }));
  assert.notEqual(await fingerprint({ a: 1 }), await fingerprint({ a: 2 }));
});

test('cloud sync uploads local transcript text only after the caller requests it', async () => {
  const requests = [];
  const stored = new Map();
  const mutationIds = [];
  let failedOnce = false;
  const chat = {
    id: 'chat-a', title: 'A chat', model: 'model', provider: 'provider', createdAt: 1, updatedAt: 2,
    messages: [{ id: 'm1', role: 'user', content: 'hello', rawContent: 'hidden action data', images: ['data:image/png;base64,abc'] }],
  };
  const dependencies = {
    listChats: async () => [chat], listCouncilSessions: async () => [],
    saveChat: async () => {}, saveCouncilSession: async () => {},
    getState: async (key) => stored.get(key), setState: async (key, value) => stored.set(key, value), removeState: async (key) => stored.delete(key),
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/pull?')) return Response.json({ records: [], nextCursor: null });
      const body = JSON.parse(init.body);
      mutationIds.push(body.mutationId);
      assert.equal(body.records[0].payload.messages[0].content, 'hello');
      assert.equal('rawContent' in body.records[0].payload.messages[0], false);
      assert.equal('images' in body.records[0].payload.messages[0], false);
      if (!failedOnce) { failedOnce = true; throw new TypeError('temporary network failure'); }
      return Response.json({ accepted: [{ type: 'chats', id: 'chat-a', revision: 1 }], conflicts: [] });
    },
  };

  const result = await syncLocalHistory('https://api.example.test', 'short-lived-token', 'account-a', dependencies);
  assert.equal(result.uploaded, 1);
  assert.deepEqual(result.conflicts, []);
  assert.equal(requests.length, 3);
  assert.equal(mutationIds.length, 2);
  assert.equal(mutationIds[0], mutationIds[1], 'network retry must reuse the idempotency key');
  assert.ok(requests.every((request) => request.init.headers.Authorization === 'Bearer short-lived-token'));
  assert.equal(stored.get('manifest:account-a')['chats:chat-a'].revision, 1);
});

test('cloud sync reports a two-device edit conflict and keeps the local copy', async () => {
  const previousPayload = { title: 'last synced', messages: [] };
  const serverPayload = { title: 'changed elsewhere', messages: [] };
  const local = { id: 'chat-b', title: 'changed here', model: 'm', provider: 'p', createdAt: 1, updatedAt: 2, messages: [] };
  const stored = new Map([['manifest:account-b', { 'chats:chat-b': { revision: 1, hash: await fingerprint(previousPayload) } }]]);
  let saved = false;
  let pushed = false;
  const dependencies = {
    listChats: async () => [local], listCouncilSessions: async () => [],
    saveChat: async () => { saved = true; }, saveCouncilSession: async () => {},
    getState: async (key) => stored.get(key), setState: async (key, value) => stored.set(key, value), removeState: async (key) => stored.delete(key),
    fetch: async (url, init = {}) => {
      if (String(url).includes('/pull?')) return Response.json({ records: [{ type: 'chats', id: 'chat-b', payload: serverPayload, revision: 2, clientUpdatedAt: 2, deleted: false }], nextCursor: null });
      pushed = true;
      return Response.json({ accepted: [], conflicts: [] });
    },
  };
  const result = await syncLocalHistory('https://api.example.test', 'token', 'account-b', dependencies);
  assert.deepEqual(result.conflicts, ['chats/chat-b']);
  assert.equal(saved, false);
  assert.equal(pushed, false);
});
