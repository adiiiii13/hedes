import http from 'node:http';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';

// Integration fixture exercises the real HTTP adapter, not model intelligence.
const origin = process.env.HEDES_REVIEW_ORIGIN || 'http://127.0.0.1:5186';
const html = await (await fetch(origin)).text();
const token = html.match(/sessionToken\\?"\s*:\s*\\?"([a-f0-9]{64})/)?.[1] || html.match(/[a-f0-9]{64}/)?.[0];
assert.ok(token, 'SSR session bootstrap missing');
const headers = { 'Content-Type': 'application/json', Origin: origin, 'X-Hedes-Session-Token': token };
const post = async (route, body) => {
  const response = await fetch(origin + route, { method: 'POST', headers, body: JSON.stringify(body) });
  if (response.status !== 428) return response;
  const { approval } = await response.json();
  assert.ok(approval.hash);
  const decision = await fetch(origin + '/api/local/approvals', { method: 'POST', headers, body: JSON.stringify({ id: approval.id, hash: approval.hash, approved: true }) });
  assert.equal(decision.status, 200);
  return fetch(origin + route, { method: 'POST', headers: { ...headers, 'X-Hedes-Approval': approval.id }, body: JSON.stringify(body) });
};
const calls = [];
let retryFailed = false;
const mock = http.createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'review-model' }] })); return; }
  const body = JSON.parse(raw);
  const system = body.messages.find(m => m.role === 'system')?.content || '';
  const id = Number(system.match(/Specialist (\d+)/)?.[1]);
  calls.push({ id, maxTokens: body.max_tokens });
  res.setHeader('Content-Type', 'application/json');
  if ([79, 96, 100].includes(id) && !retryFailed) {
    res.statusCode = 400; res.end(JSON.stringify({ error: { message: 'Review seeded bot failure', type: 'invalid_request_error' } })); return;
  }
  const content = id ? `Specialist ${id} recommends a tested implementation with clear boundaries and complete readable output.` : 'Best approach: preserve working recommendations, fix remaining failures, then verify the actual project.';
  res.end(JSON.stringify({ id: 'review-response', object: 'chat.completion', created: 1, model: 'review-model', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 } }));
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
try {
  for (const route of ['/api/local/projects','/api/local/memory','/api/local/skills','/api/local/settings']) assert.equal((await fetch(origin + route)).status, 401);
  assert.equal((await fetch(origin + '/api/local/projects', { headers: { ...headers, Origin: 'http://127.0.0.1:9000' } })).status, 403);
  const projectId = 'review-http-project';
  const saved = await post('/api/local/fs', { chatId: projectId, filePath: 'review.txt', content: 'first' });
  assert.equal(saved.status, 200); const revision = (await saved.json()).revision;
  assert.equal((await post('/api/local/fs', { chatId: projectId, filePath: 'review.txt', content: 'second', expectedRevision: revision })).status, 200);
  assert.equal((await post('/api/local/fs', { chatId: projectId, filePath: 'review.txt', content: 'stale', expectedRevision: revision })).status, 409);
  const baseUrl = `http://127.0.0.1:${mock.address().port}/v1`;
  const scan = await post('/api/custom-models', { baseUrl }); assert.equal(scan.status, 200);
  assert.equal((await scan.json()).models[0].id, 'review-model');
  const personas = Array.from({ length: 100 }, (_, i) => ({ id: i+1, name: `Specialist ${i+1}`, archetype: 'review', role: 'tester', prompt: 'Review actual implementation', enabled: true }));
  const input = { prompt: 'Review project', projectId, chatId: projectId, personas, provider: 'review-custom', model: 'review-model', customProviders: [{ id: 'review-custom', name: 'Review fixture', baseUrl, modelId: 'review-model', enabled: true, createdAt: Date.now() }] };
  const response = await post('/api/agents', input); assert.equal(response.status, 200);
  const runId = response.headers.get('X-Hedes-Run-Id');
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  const final = events.find(e => e.type === 'complete');
  assert.ok(final, JSON.stringify(events.at(-1))); assert.equal(final.completed, 97);
  assert.equal(final.contributions.length, 97); assert.ok(final.consensus.length > 30);
  const callCount = calls.length;
  const replay = await post('/api/agents', { ...input, runId }); await replay.text();
  assert.equal(calls.length, callCount, 'Reconnect must not invoke completed bots again');
  retryFailed = true;
  const resumed = await post('/api/agents', { ...input, runId, resume: true });
  const resumedEvents = (await resumed.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(resumedEvents.filter(e => e.type === 'complete').at(-1).completed, 100);
  assert.equal(calls.slice(callCount).filter(c => c.id).length, 3, 'Retry must invoke only failed bots');
  const evidence = { checkedAt: new Date().toISOString(), unauthorizedReads: 'rejected', crossPortOrigin: 'rejected', atomicSaveConflict: '409', customDiscovery: 'passed', botsResponded: 97, replayAdditionalCalls: 0, resumedBotsResponded: 100, retryBotCalls: 3, provider: 'Local deterministic HTTP fixture; not an intelligence evaluation' };
  await mkdir('output', { recursive: true }); await writeFile('output/review-http-results.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
} finally { await new Promise(resolve => mock.close(resolve)); }
