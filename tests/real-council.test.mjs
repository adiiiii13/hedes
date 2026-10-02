import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAgentContribution, runRealCouncil } from '../app/engine/real-council.ts';

const personas = Array.from({ length: 100 }, (_, index) => ({
  id: index + 1, name: `Agent ${index + 1}`, prompt: 'Review the task', enabled: true,
}));

test('100-agent relay invokes the model for every persona and passes actual prior output', async () => {
  const calls = [];
  const events = [];
  await runRealCouncil({
    personas,
    prompt: 'Build an app',
    mode: 'relay',
    generate: async (persona, previous) => {
      calls.push({ id: persona.id, previous });
      return JSON.stringify({ critique: `Critique ${persona.id}`, recommendation: `Recommendation ${persona.id}` });
    },
    synthesize: async (contributions) => `Based on ${contributions.length} responses`,
    emit: (event) => events.push(event),
  });
  assert.equal(calls.length, 100);
  assert.equal(calls[0].previous, '');
  assert.equal(calls[1].previous, 'Recommendation 1');
  assert.equal(events.filter((event) => event.type === 'agent').length, 100);
  assert.equal(events.at(-1).completed, 100);
  assert.equal(events.at(-1).consensus, 'Based on 100 responses');
});

test('failed model calls are reported and never counted as successful agents', async () => {
  const events = [];
  await runRealCouncil({
    personas: personas.slice(0, 3),
    prompt: 'Review',
    mode: 'swarm',
    generate: async (persona) => {
      if (persona.id === 2) throw new Error('Rate limited');
      return `Actual answer ${persona.id}`;
    },
    synthesize: async (contributions) => `${contributions.length} responded`,
    emit: (event) => events.push(event),
  });
  assert.equal(events.filter((event) => event.type === 'agent_error').length, 1);
  assert.equal(events.at(-1).completed, 2);
  assert.equal(events.at(-1).consensus, '2 responded');
});

test('97 useful replies still produce a final summary', async () => {
  const events = [];
  await runRealCouncil({
    personas,
    prompt: 'Improve the app',
    mode: 'swarm',
    maxConcurrency: 3,
    generate: async (persona) => {
      if (persona.id > 97) throw new Error('Provider limit');
      return `From my role, improve feature ${persona.id} with a concrete user test.`;
    },
    synthesize: async (contributions) => `Best plan from ${contributions.length} real replies`,
    emit: (event) => events.push(event),
  });
  assert.equal(events.filter((event) => event.type === 'agent_error').length, 3);
  assert.equal(events.at(-1).type, 'complete');
  assert.equal(events.at(-1).completed, 97);
  assert.match(events.at(-1).consensus, /97 real replies/);
});

test('incomplete JSON is rejected; prose is shown as advice', () => {
  assert.throws(() => parseAgentContribution(1, '```json'), /usable advice/);
  assert.throws(() => parseAgentContribution(1, '{"critique": "'), /incomplete advice/);
  assert.equal(parseAgentContribution(2, 'Add a clear undo button to every edit.').recommendation, 'Add a clear undo button to every edit.');
});
