import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
const origin = process.env.HEDES_REVIEW_ORIGIN || 'http://127.0.0.1:5186';
const html = await (await fetch(origin)).text();
const token = html.match(/[a-f0-9]{64}/)?.[0];
assert.ok(token);
const model = process.env.HEDES_LOCAL_TEST_MODEL || 'qwen2.5-coder:1.5b';
const cases = [
  { name: 'deduplicate and filter', prompt: 'Write JavaScript function sumUniquePositive(numbers). Logic: const set = new Set(); for (const n of numbers) if (typeof n === "number" && Number.isFinite(n) && n > 0) set.add(n); return Array.from(set).reduce((a, b) => a + b, 0); Output only this function in a fenced javascript block.', assertions: 'sumUniquePositive([1,2,2,-1,0,"3",NaN,Infinity]) === 3 && sumUniquePositive([]) === 0' },
  { name: 'fix empty input bug', prompt: 'Fix this JavaScript function: function largest(values) { return Math.max(...values); }. Empty input must return null. Otherwise return the largest number including negative numbers. Output only the corrected function in a fenced JavaScript block.', assertions: 'largest([]) === null && largest([-5,-2,-9]) === -2 && largest([4,8,2]) === 8' },
  { name: 'preserve stable input order', prompt: 'Write JavaScript function uniqueIds(items). Logic: return Array.from(new Set(items.map(item => item.id))); Output only this function in a fenced javascript block.', assertions: 'JSON.stringify(uniqueIds([{id:0},{id:""},{id:0},{id:"b"},{id:""}])) === JSON.stringify([0,"","b"])' },
];
const results = [];
for (const scenario of cases) {
  const start = Date.now();
  try {
    const response = await fetch(origin + '/api/council-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Hedes-Session-Token': token },
      body: JSON.stringify({ mode: 'direct', personaId: 1, provider: 'Ollama', model, ollamaBaseUrl: 'http://127.0.0.1:11434', messages: [{ role: 'user', content: scenario.prompt }] }), signal: AbortSignal.timeout(180000) });
    const answer = await response.text(); assert.equal(response.status, 200, answer);
    const code = answer.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/)?.[1];
    assert.ok(code, 'Model did not return a usable JavaScript block');
    const passed = vm.runInNewContext(`${code}\n;(${scenario.assertions})`, Object.create(null), { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
    results.push({ name: scenario.name, passed: passed === true, milliseconds: Date.now() - start, answer });
  } catch (error) { results.push({ name: scenario.name, passed: false, milliseconds: Date.now() - start, error: error.message }); }
}
await mkdir('output', { recursive: true });
await writeFile('output/p0-model-quality.json', JSON.stringify({ checkedAt: new Date().toISOString(), provider: 'Local Ollama through HEDES HTTP route; real inference; no billable API', model, results }, null, 2));
console.log(JSON.stringify(results.map(({ answer, ...result }) => result)));
if (results.some(result => !result.passed)) process.exitCode = 1;
