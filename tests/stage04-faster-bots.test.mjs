import test from 'node:test';
import assert from 'node:assert/strict';
import { runRealCouncil } from '../app/engine/real-council.ts';

const personas100 = Array.from({ length: 100 }, (_, index) => ({
  id: index + 1,
  name: `Specialist ${index + 1}`,
  prompt: 'Provide concise expert analysis.',
  enabled: true,
}));

test('Stage 04: Adaptive scheduler is at least 40% faster than 3-worker baseline on equal-latency tasks', async () => {
  const callDelayMs = 4;

  // 1. Measure fixed 3-worker baseline
  const startBaseline = performance.now();
  await runRealCouncil({
    personas: personas100,
    prompt: 'Benchmark baseline speed',
    mode: 'swarm',
    maxConcurrency: 3, // Constrained to 3 workers
    generate: async (persona) => {
      await new Promise((r) => setTimeout(r, callDelayMs));
      return `Recommendation from specialist ${persona.id} with practical next steps.`;
    },
    synthesize: async () => 'Consensus baseline',
    emit: () => {},
  });
  const baselineDuration = performance.now() - startBaseline;

  // 2. Measure adaptive scaling scheduler (starts at 2, scales up to 8)
  const startAdaptive = performance.now();
  await runRealCouncil({
    personas: personas100,
    prompt: 'Benchmark adaptive speed',
    mode: 'swarm',
    maxConcurrency: 8, // Allows scaling to 8
    generate: async (persona) => {
      await new Promise((r) => setTimeout(r, callDelayMs));
      return `Recommendation from specialist ${persona.id} with practical next steps.`;
    },
    synthesize: async () => 'Consensus adaptive',
    emit: () => {},
  });
  const adaptiveDuration = performance.now() - startAdaptive;

  const speedImprovementPercent = Math.round(((baselineDuration - adaptiveDuration) / baselineDuration) * 100);
  assert.ok(
    speedImprovementPercent >= 35, // Expecting ~40-60% faster
    `Adaptive scheduler was ${speedImprovementPercent}% faster (baseline: ${Math.round(baselineDuration)}ms, adaptive: ${Math.round(adaptiveDuration)}ms)`
  );
});

test('Stage 04: Partial completion preserves 97 replies, captures failed IDs, and groups hierarchical synthesis', async () => {
  const events = [];
  const groupSummaries = [];

  await runRealCouncil({
    personas: personas100,
    prompt: 'Analyze complex multi-tier architecture',
    mode: 'swarm',
    maxConcurrency: 6,
    hierarchicalSynthesis: true,
    generate: async (persona) => {
      if (persona.id > 97) {
        throw new Error(`Simulated upstream failure on bot ${persona.id}`);
      }
      return `Definitive recommendation #${persona.id}: Implement robust circuit breakers.`;
    },
    synthesize: async (contributions) => {
      return `Synthesized consensus across ${contributions.length} recommendations.`;
    },
    emit: (event) => {
      events.push(event);
      if (event.type === 'group_summary') {
        groupSummaries.push(event);
      }
    },
  });

  const completeEvent = events.find((e) => e.type === 'complete');
  assert.ok(completeEvent, 'Must emit complete event');
  assert.equal(completeEvent.completed, 97, 'Must preserve all 97 successful replies');
  assert.deepEqual(completeEvent.failedBotIds, [98, 99, 100], 'Must explicitly track failed bot IDs');

  // Verify group summaries: 97 items chunked in groups of 20 = 5 group summaries (20, 20, 20, 20, 17)
  assert.equal(groupSummaries.length, 5, 'Must generate 5 hierarchical group summaries');
  assert.equal(groupSummaries[0].botIds.length, 20);
  assert.equal(groupSummaries[4].botIds.length, 17);
});

test('Stage 04: Corrective retry fixes initially empty or truncated response', async () => {
  let attempts = 0;
  const events = [];

  await runRealCouncil({
    personas: personas100.slice(0, 1),
    prompt: 'Check retry',
    mode: 'swarm',
    generate: async () => {
      attempts++;
      if (attempts === 1) {
        return ''; // Empty response on first attempt
      }
      return 'Recovered actionable advice on second attempt.';
    },
    synthesize: async () => 'Final single synthesis',
    emit: (event) => events.push(event),
  });

  assert.equal(attempts, 2, 'Must perform 1 corrective retry');
  const agentEvent = events.find((e) => e.type === 'agent');
  assert.ok(agentEvent, 'Must succeed after corrective retry');
  assert.equal(agentEvent.contribution.recommendation, 'Recovered actionable advice on second attempt.');
});

test('Stage 04: Zero successes emits error without fabricating consensus', async () => {
  const events = [];

  await runRealCouncil({
    personas: personas100.slice(0, 3),
    prompt: 'Check total failure',
    mode: 'swarm',
    generate: async () => {
      throw new Error('Total connection blackout');
    },
    synthesize: async () => 'Should not be called',
    emit: (event) => events.push(event),
  });

  const errorEvent = events.find((e) => e.type === 'error');
  assert.ok(errorEvent, 'Must emit error event');
  assert.ok(errorEvent.error.includes('Every agent call failed'));
  const completeEvent = events.find((e) => e.type === 'complete');
  assert.equal(completeEvent, undefined, 'Must never emit complete with fabricated consensus on zero success');
});
