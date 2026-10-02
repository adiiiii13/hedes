import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDefaultUserDataDir } from './runtime.server.ts';
import { validateProjectId, resolveProjectDir, assertProjectPathSafe } from './project-dir.server.ts';
const executeFile = promisify(execFile);

export type TaskState = 'pending' | 'running' | 'approval_required' | 'failed' | 'cancelled' | 'completed';

export interface TaskSchedule {
  type: 'one-time' | 'recurring';
  executeAt: number; // Unix timestamp ms
  cronIntervalMs?: number; // e.g. 3600000 for hourly
  timezone: string;
  catchUpOffered?: boolean;
}

export interface QueuedTask {
  id: string;
  projectId: string;
  title: string;
  command: string;
  capabilities: string[];
  state: TaskState;
  schedule: TaskSchedule;
  requiresApproval: boolean;
  approved: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  lastError?: string;
  lastResult?: any;
}

interface ActiveTaskHandle {
  abortController: AbortController;
  child?: any;
}

const activeExecutions = new Map<string, ActiveTaskHandle>();

function getQueueFilePath(): string {
  return path.join(getDefaultUserDataDir(), 'tasks', 'task-queue.json');
}

export async function readTasksFromDisk(): Promise<QueuedTask[]> {
  const filePath = getQueueFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch {
    return [];
  }
}

export async function writeTasksToDisk(tasks: QueuedTask[]): Promise<void> {
  const filePath = getQueueFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ version: 1, updatedAt: Date.now(), tasks }, null, 2));
  await fs.rename(tmp, filePath);
}

export async function createQueuedTask(input: {
  projectId: string;
  title: string;
  command: string;
  capabilities?: string[];
  schedule: {
    type?: 'one-time' | 'recurring';
    executeAt?: number;
    cronIntervalMs?: number;
    timezone?: string;
  };
  requiresApproval?: boolean;
}): Promise<QueuedTask> {
  const validProject = validateProjectId(input.projectId);
  const now = Date.now();
  const scheduleType = input.schedule.type || 'one-time';
  const executeAt = input.schedule.executeAt || now;

  const requiresApproval = input.requiresApproval ?? true;

  const task: QueuedTask = {
    id: crypto.randomUUID(),
    projectId: validProject,
    title: String(input.title || 'Untitled task').trim(),
    command: String(input.command || '').trim(),
    capabilities: Array.isArray(input.capabilities) ? input.capabilities : ['shell:execute'],
    state: requiresApproval ? 'approval_required' : 'pending',
    schedule: {
      type: scheduleType,
      executeAt,
      cronIntervalMs: input.schedule.cronIntervalMs,
      timezone: input.schedule.timezone || 'UTC',
      catchUpOffered: false,
    },
    requiresApproval,
    approved: !requiresApproval,
    createdAt: now,
    updatedAt: now,
    nextRunAt: executeAt,
    runCount: 0,
  };

  const tasks = await readTasksFromDisk();
  tasks.push(task);
  await writeTasksToDisk(tasks);

  return task;
}

export async function listQueuedTasks(projectId?: string): Promise<QueuedTask[]> {
  const tasks = await readTasksFromDisk();
  if (projectId) {
    const valid = validateProjectId(projectId);
    return tasks.filter((t) => t.projectId === valid);
  }
  return tasks;
}

export async function getQueuedTask(taskId: string): Promise<QueuedTask | null> {
  const tasks = await readTasksFromDisk();
  return tasks.find((t) => t.id === taskId) || null;
}

export async function approveQueuedTask(taskId: string, approved: boolean): Promise<QueuedTask> {
  const tasks = await readTasksFromDisk();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  task.approved = approved;
  task.state = approved ? 'pending' : 'cancelled';
  task.updatedAt = Date.now();
  await writeTasksToDisk(tasks);
  return task;
}

export async function cancelQueuedTask(taskId: string): Promise<QueuedTask> {
  const active = activeExecutions.get(taskId);
  if (active) {
    active.abortController.abort();
    if (active.child && !active.child.killed) {
      try {
        active.child.kill('SIGTERM');
      } catch {
        // Best-effort process kill
      }
    }
    activeExecutions.delete(taskId);
  }

  const tasks = await readTasksFromDisk();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  task.state = 'cancelled';
  task.nextRunAt = undefined;
  task.updatedAt = Date.now();
  await writeTasksToDisk(tasks);
  return task;
}

/**
 * Executes a single task run with strict concurrency deduplication and approval verification.
 */
export async function executeTaskRun(taskId: string): Promise<{ success: boolean; task: QueuedTask; error?: string }> {
  if (activeExecutions.has(taskId)) {
    throw new Error(`Task ${taskId} is already currently executing (deduplication active)`);
  }

  const tasks = await readTasksFromDisk();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  if (task.requiresApproval && !task.approved) {
    throw new Error(`Task ${taskId} cannot execute: capability authorization required.`);
  }

  if (task.state === 'cancelled') throw new Error('Cancelled tasks cannot execute');

  const abortController = new AbortController();
  activeExecutions.set(taskId, { abortController });
  task.state = 'running';
  task.updatedAt = Date.now();
  await writeTasksToDisk(tasks);

  try {
    if (!task.command || task.command.length > 12000 || task.command.includes('\0')) throw new Error('Invalid task command');
    const { projectDir } = await resolveProjectDir(task.projectId);
    await assertProjectPathSafe(projectDir, projectDir);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|HEDES_/i.test(key))) as NodeJS.ProcessEnv;
    const executable = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    const args = process.platform === 'win32'
      ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
          Buffer.from(task.command + '\nif ($LASTEXITCODE) { exit $LASTEXITCODE }', 'utf16le').toString('base64')]
      : ['-c', task.command];

    const child = execFile(executable, args, {
      cwd: projectDir,
      env,
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      signal: abortController.signal,
    });
    const currentEntry = activeExecutions.get(taskId);
    if (currentEntry) currentEntry.child = child;

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => { stdout += d; });
      child.stderr?.on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else {
          const err: any = new Error(`Process exited with code ${code}`);
          err.code = code;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        }
      });
    });

    task.lastRunAt = Date.now();
    task.runCount += 1;
    task.lastResult = { executedCommand: task.command, exitCode: 0, stdout: result.stdout, stderr: result.stderr, timestamp: task.lastRunAt };

    if (task.schedule.type === 'recurring' && task.schedule.cronIntervalMs) {
      task.state = 'pending';
      task.nextRunAt = task.lastRunAt + task.schedule.cronIntervalMs;
    } else {
      task.state = 'completed';
      task.nextRunAt = undefined;
    }

    task.updatedAt = Date.now();
    await writeTasksToDisk(tasks);
    return { success: true, task };
  } catch (err: any) {
    if (abortController.signal.aborted) {
      task.state = 'cancelled';
      task.lastError = 'Task run cancelled by user';
    } else {
      task.state = 'failed';
      task.lastError = err.message;
    }
    task.lastResult = {
      exitCode: typeof err.code === 'number' ? err.code : null,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      timestamp: Date.now(),
    };
    task.updatedAt = Date.now();
    await writeTasksToDisk(tasks);
    return { success: false, task, error: task.lastError };
  } finally {
    activeExecutions.delete(taskId);
  }
}

/**
 * Resumes scheduled tasks after application restart or timer tick.
 * Handles:
 * - Mark orphaned 'running' tasks as interrupted.
 * - Catch-up policy: for missed recurring runs while app was offline, offer at most ONE catch-up run.
 * - Reschedule forward.
 */
export async function resumeScheduledTasks(referenceTime = Date.now()): Promise<{
  recoveredInterrupted: number;
  catchUpExecuted: number;
  scheduledNext: number;
}> {
  const tasks = await readTasksFromDisk();
  let recoveredInterrupted = 0;
  let catchUpExecuted = 0;
  let scheduledNext = 0;
  const dueIds = new Set<string>();

  for (const task of tasks) {
    // 1. Recover orphaned running tasks
    if (task.state === 'running' && !activeExecutions.has(task.id)) {
      task.state = 'failed';
      task.lastError = 'Interrupted due to application restart or process termination.';
      task.updatedAt = referenceTime;
      recoveredInterrupted += 1;
      continue;
    }

    // 2. Check scheduled tasks that are ready or missed
    if (task.state === 'pending' && task.nextRunAt && task.nextRunAt <= referenceTime) {
      dueIds.add(task.id);
      if (task.schedule.type === 'recurring') {
        // At most one catch up run
        if (!task.schedule.catchUpOffered) {
          task.schedule.catchUpOffered = true;
        }
        // Reschedule forward from referenceTime
        const interval = task.schedule.cronIntervalMs || 3600000;
        task.nextRunAt = referenceTime + interval;
        scheduledNext += 1;
      } else {
        // One-time task that was due
        // Leave due one-time tasks pending until the executor actually runs them.
      }
      task.updatedAt = referenceTime;
    }
  }

  await writeTasksToDisk(tasks);
  for (const task of tasks) {
    if (task.state !== 'pending' || (task.requiresApproval && !task.approved) || activeExecutions.has(task.id)) continue;
    if (dueIds.has(task.id)) {
      const result = await executeTaskRun(task.id);
      if (result.success) catchUpExecuted++;
    }
  }

  return {
    recoveredInterrupted,
    catchUpExecuted,
    scheduledNext,
  };
}
