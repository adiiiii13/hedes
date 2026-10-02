import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteFile } from './atomic-write.server.ts';
import { getStoragePaths } from './runtime.server.ts';
import { logDiagnostic } from './diagnostic-logger.server.ts';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting-for-approval'
  | 'paused-for-limits'
  | 'completed'
  | 'completed-with-failures'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface RunEvent {
  seq: number;
  timestamp: number;
  type: string;
  payload: any;
}

export interface DurableRun {
  runId: string;
  idempotencyKey?: string;
  projectId: string;
  chatId: string;
  type: 'chat' | 'council' | 'relay';
  provider: string;
  model: string;
  status: RunStatus;
  createdAt: number;
  updatedAt: number;
  requestSnapshot: any;
  attempts: number;
  events: RunEvent[];
  results?: any;
  error?: string;
}

interface ActiveRunHandle {
  run: DurableRun;
  abortController: AbortController;
  subscribers: Set<(event: RunEvent) => void>;
}

// In-memory active runs registry
const activeRuns = new Map<string, ActiveRunHandle>();
// Map idempotency keys to runIds
const idempotencyMap = new Map<string, string>();
const persistenceQueues = new Map<string, Promise<void>>();
function validateRunId(runId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(runId)) throw new Error('Invalid run ID');
}

let isCrashRecoveryInitialized = false;

function getRunsDirectory(): string {
  const { sessions } = getStoragePaths();
  return path.join(sessions, 'runs');
}

/**
 * Startup crash recovery: mark any orphaned active runs as 'interrupted'.
 */
export async function initializeRunCrashRecovery(force = false): Promise<void> {
  if (isCrashRecoveryInitialized && !force) return;
  isCrashRecoveryInitialized = true;

  try {
    const runsDir = getRunsDirectory();
    await fs.mkdir(runsDir, { recursive: true });
    const files = await fs.readdir(runsDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(runsDir, file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const run: DurableRun = JSON.parse(raw);
        if (run.status === 'running' || run.status === 'queued') {
          run.status = 'interrupted';
          run.updatedAt = Date.now();
          await fs.writeFile(filePath, JSON.stringify(run, null, 2), 'utf8');
          await logDiagnostic('warn', 'RUN_CRASH_RECOVERY', `Marked interrupted run ${run.runId}`);
        }
      } catch {
        // Ignore unreadable run files
      }
    }
  } catch (err) {
    console.error('[RUN_RECOVERY_ERROR]', err);
  }
}

/**
 * Persist run state atomically to disk.
 */
async function persistRun(run: DurableRun): Promise<void> {
  validateRunId(run.runId);
  const snapshot = JSON.stringify(run, null, 2);
  const prior = persistenceQueues.get(run.runId) || Promise.resolve();
  const pending = prior.catch(() => undefined).then(async () => {
    const runsDir = getRunsDirectory();
    await fs.mkdir(runsDir, { recursive: true });
    const filePath = path.join(runsDir, `${run.runId}.json`);
    await atomicWriteFile(filePath, snapshot);
  });
  persistenceQueues.set(run.runId, pending);
  await pending;
  if (persistenceQueues.get(run.runId) === pending) persistenceQueues.delete(run.runId);
}

/**
 * Create or reuse a durable run.
 */
export async function getOrCreateDurableRun(params: {
  runId?: string;
  idempotencyKey?: string;
  projectId: string;
  chatId: string;
  type: 'chat' | 'council' | 'relay';
  provider: string;
  model: string;
  requestSnapshot: any;
}): Promise<{ run: DurableRun; isExisting: boolean; handle: ActiveRunHandle }> {
  await initializeRunCrashRecovery();
  if (params.runId) {
    validateRunId(params.runId);
    const existing = activeRuns.get(params.runId);
    const saved = existing?.run || await loadDurableRun(params.runId);
    if (saved) {
      if (saved.projectId !== params.projectId || saved.chatId !== params.chatId ||
          JSON.stringify(saved.requestSnapshot) !== JSON.stringify(params.requestSnapshot)) {
        throw new Error('Run identity conflicts with this request');
      }
      const handle = existing || { run: saved, abortController: new AbortController(), subscribers: new Set<(event: RunEvent) => void>() };
      activeRuns.set(saved.runId, handle);
      return { run: saved, isExisting: true, handle };
    }
  }

  if (params.idempotencyKey && idempotencyMap.has(params.idempotencyKey)) {
    const existingRunId = idempotencyMap.get(params.idempotencyKey)!;
    const existing = activeRuns.get(existingRunId);
    if (existing) {
      return { run: existing.run, isExisting: true, handle: existing };
    }
    const persisted = await loadDurableRun(existingRunId);
    if (persisted) {
      const handle: ActiveRunHandle = {
        run: persisted,
        abortController: new AbortController(),
        subscribers: new Set(),
      };
      activeRuns.set(persisted.runId, handle);
      return { run: persisted, isExisting: true, handle };
    }
  }

  const runId = params.runId || `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = Date.now();

  const run: DurableRun = {
    runId,
    idempotencyKey: params.idempotencyKey,
    projectId: params.projectId,
    chatId: params.chatId,
    type: params.type,
    provider: params.provider,
    model: params.model,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    requestSnapshot: params.requestSnapshot,
    attempts: 1,
    events: [],
  };

  const handle: ActiveRunHandle = {
    run,
    abortController: new AbortController(),
    subscribers: new Set(),
  };

  activeRuns.set(runId, handle);
  if (params.idempotencyKey) {
    idempotencyMap.set(params.idempotencyKey, runId);
  }

  await persistRun(run);
  return { run, isExisting: false, handle };
}

/**
 * Emit an event to a run, appending monotonically and distributing to active subscribers.
 */
export async function emitRunEvent(runId: string, type: string, payload: any): Promise<RunEvent> {
  const handle = activeRuns.get(runId);
  let run: DurableRun;

  if (handle) {
    run = handle.run;
  } else {
    const loaded = await loadDurableRun(runId);
    if (!loaded) throw new Error(`Run ${runId} not found`);
    run = loaded;
  }

  const seq = run.events.length + 1;
  const event: RunEvent = {
    seq,
    timestamp: Date.now(),
    type,
    payload,
  };

  run.events.push(event);
  run.updatedAt = Date.now();
  // Subscribers may display completion or disconnect immediately. Persist first.
  await persistRun(run);

  if (handle) {
    for (const subscriber of handle.subscribers) {
      try {
        subscriber(event);
      } catch {
        // Subscriber disconnected
      }
    }
  }

  // Persist periodically or on critical milestones
  if (
    type === 'start' || type === 'agent' || type === 'agent_error' || type === 'complete' || type === 'error' ||
    type === 'started' ||
    type === 'completed' ||
    type === 'failed' ||
    type === 'summary' ||
    run.events.length % 5 === 0
  ) {
    await persistRun(run);
  }

  return event;
}

/**
 * Update the status of a run.
 */
export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  error?: string,
  results?: any
): Promise<void> {
  const handle = activeRuns.get(runId);
  let run: DurableRun;

  if (handle) {
    run = handle.run;
  } else {
    const loaded = await loadDurableRun(runId);
    if (!loaded) return;
    run = loaded;
  }

  run.status = status;
  run.updatedAt = Date.now();
  if (error) run.error = error;
  if (results) run.results = results;

  await emitRunEvent(runId, 'status-change', { status, error });
  await persistRun(run);

  if (status === 'completed' || status === 'completed-with-failures' || status === 'failed' || status === 'cancelled') {
    // Keep in active memory briefly for reconnecting clients, then clean up
    const timer = setTimeout(() => {
      activeRuns.delete(runId);
    }, 60000);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }
}

/**
 * Load a run from disk.
 */
export async function loadDurableRun(runId: string): Promise<DurableRun | null> {
  validateRunId(runId);
  const filePath = path.join(getRunsDirectory(), `${runId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Cancel an active run.
 */
export async function cancelDurableRun(runId: string): Promise<boolean> {
  const handle = activeRuns.get(runId);
  if (!handle) {
    const run = await loadDurableRun(runId);
    if (run && (run.status === 'running' || run.status === 'queued')) {
      run.status = 'cancelled';
      run.updatedAt = Date.now();
      await persistRun(run);
      return true;
    }
    return false;
  }

  handle.abortController.abort();
  await updateRunStatus(runId, 'cancelled');
  return true;
}

/**
 * Get active run handle if running.
 */
export function getActiveRunHandle(runId: string): ActiveRunHandle | undefined {
  return activeRuns.get(runId);
}

/**
 * List runs for a specific project/chat.
 */
export async function listDurableRuns(filter?: { projectId?: string; chatId?: string }): Promise<DurableRun[]> {
  await initializeRunCrashRecovery();
  const runsDir = getRunsDirectory();
  const out: DurableRun[] = [];

  try {
    const files = await fs.readdir(runsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(runsDir, file), 'utf8');
        const run: DurableRun = JSON.parse(raw);
        if (filter?.projectId && run.projectId !== filter.projectId) continue;
        if (filter?.chatId && run.chatId !== filter.chatId) continue;
        out.push(run);
      } catch {
        // Skip unreadable
      }
    }
  } catch {
    // Directory might be empty
  }

  return out.sort((a, b) => b.createdAt - a.createdAt);
}
