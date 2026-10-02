import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getOrCreateDurableRun,
  emitRunEvent,
  updateRunStatus,
  loadDurableRun,
  cancelDurableRun,
  listDurableRuns,
  initializeRunCrashRecovery,
} from '../app/utils/runs.server.ts';
import { getStoragePaths } from '../app/utils/runtime.server.ts';

test('Stage 02: Durable runs idempotency prevents duplicate execution on UI reloads', async () => {
  const idempotencyKey = `idem_${Date.now()}_test`;
  const initial = await getOrCreateDurableRun({
    idempotencyKey,
    projectId: 'proj_alpha',
    chatId: 'chat_123',
    type: 'council',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    requestSnapshot: { prompt: 'Analyze architecture tradeoffs' },
  });

  assert.equal(initial.isExisting, false, 'First call must create a new run');
  assert.equal(initial.run.status, 'queued');

  // Simulate UI reload with the same idempotency key
  const duplicate = await getOrCreateDurableRun({
    idempotencyKey,
    projectId: 'proj_alpha',
    chatId: 'chat_123',
    type: 'council',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    requestSnapshot: { prompt: 'Analyze architecture tradeoffs' },
  });

  assert.equal(duplicate.isExisting, true, 'Subsequent call with same key must return existing run');
  assert.equal(duplicate.run.runId, initial.run.runId, 'Run ID must match');
});

test('Stage 02: Monotonic event sequence and catch-up replay', async () => {
  const { run } = await getOrCreateDurableRun({
    projectId: 'proj_beta',
    chatId: 'chat_456',
    type: 'council',
    provider: 'google',
    model: 'gemini-1.5-pro',
    requestSnapshot: { prompt: 'Test events' },
  });

  const ev1 = await emitRunEvent(run.runId, 'agent-reply', { agentId: 1, text: 'Rec 1' });
  const ev2 = await emitRunEvent(run.runId, 'agent-reply', { agentId: 2, text: 'Rec 2' });
  const ev3 = await emitRunEvent(run.runId, 'summary', { text: 'Final summary' });

  assert.equal(ev1.seq, 1);
  assert.equal(ev2.seq, 2);
  assert.equal(ev3.seq, 3);

  // Catch up from seq 1
  const loaded = await loadDurableRun(run.runId);
  assert.ok(loaded);
  const replayed = loaded.events.filter((e) => e.seq > 1);
  assert.equal(replayed.length, 2);
  assert.equal(replayed[0].seq, 2);
  assert.equal(replayed[1].seq, 3);
});

test('Stage 02: Explicit cancellation aborts pending work', async () => {
  const { run, handle } = await getOrCreateDurableRun({
    projectId: 'proj_gamma',
    chatId: 'chat_789',
    type: 'council',
    provider: 'openai',
    model: 'gpt-4o',
    requestSnapshot: { prompt: 'Abort test' },
  });

  assert.equal(handle.abortController.signal.aborted, false);

  const cancelled = await cancelDurableRun(run.runId);
  assert.equal(cancelled, true);
  assert.equal(handle.abortController.signal.aborted, true, 'Abort signal must be fired');

  const reloaded = await loadDurableRun(run.runId);
  assert.equal(reloaded?.status, 'cancelled');
});

test('Stage 02: Crash recovery detects orphaned running jobs and marks them interrupted', async () => {
  const { sessions } = getStoragePaths();
  const runsDir = path.join(sessions, 'runs');
  await fs.mkdir(runsDir, { recursive: true });

  const orphanedRunId = `run_crash_${Date.now()}`;
  const orphanedPath = path.join(runsDir, `${orphanedRunId}.json`);

  const mockOrphanedRun = {
    runId: orphanedRunId,
    projectId: 'proj_delta',
    chatId: 'chat_999',
    type: 'council',
    provider: 'ollama',
    model: 'llama3',
    status: 'running', // Simulating crash while running
    createdAt: Date.now() - 5000,
    updatedAt: Date.now() - 5000,
    requestSnapshot: {},
    attempts: 1,
    events: [
      { seq: 1, timestamp: Date.now() - 4000, type: 'agent-reply', payload: { agentId: 1, text: 'Prior reply 1' } }
    ],
  };

  await fs.writeFile(orphanedPath, JSON.stringify(mockOrphanedRun, null, 2), 'utf8');

  // Trigger crash recovery
  await initializeRunCrashRecovery(true);

  const recoveredRaw = await fs.readFile(orphanedPath, 'utf8');
  const recovered = JSON.parse(recoveredRaw);

  assert.equal(recovered.status, 'interrupted', 'Orphaned running job must be marked interrupted');
  assert.equal(recovered.events.length, 1, 'Completed prior replies must be preserved');
});
