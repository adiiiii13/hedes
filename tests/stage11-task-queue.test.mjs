import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQueuedTask,
  getQueuedTask,
  listQueuedTasks,
  approveQueuedTask,
  cancelQueuedTask,
  executeTaskRun,
  resumeScheduledTasks,
  writeTasksToDisk,
} from '../app/utils/task-queue.server.ts';

test('Stage 11: Task queue persists tasks with project scope, capabilities, and schedule', async () => {
  const projectId = 'test-proj-11';
  const task = await createQueuedTask({
    projectId,
    title: 'Daily Build Verification',
    command: 'npm run build',
    capabilities: ['shell:execute', 'fs:read'],
    schedule: {
      type: 'recurring',
      executeAt: Date.now() + 10000,
      cronIntervalMs: 86400000, // 24 hours
      timezone: 'Asia/Kolkata',
    },
    requiresApproval: true,
  });

  assert.ok(task.id);
  assert.equal(task.projectId, projectId);
  assert.equal(task.state, 'approval_required');
  assert.equal(task.approved, false);
  assert.equal(task.schedule.type, 'recurring');
  assert.equal(task.schedule.timezone, 'Asia/Kolkata');

  const fetched = await getQueuedTask(task.id);
  assert.equal(fetched?.id, task.id);
  assert.equal(fetched?.title, 'Daily Build Verification');
});

test('Stage 11: Task execution enforces capability approval gate', async () => {
  const task = await createQueuedTask({
    projectId: 'test-proj-approval',
    title: 'Dangerous Task',
    command: 'echo HEDES_REAL_TASK_EXECUTED',
    schedule: { type: 'one-time' },
    requiresApproval: true,
  });

  // Attempting to execute unapproved task must reject
  await assert.rejects(
    async () => {
      await executeTaskRun(task.id);
    },
    /capability authorization required/
  );

  // Approve and execute
  await approveQueuedTask(task.id, true);
  const result = await executeTaskRun(task.id);
  assert.equal(result.success, true);
  assert.equal(result.task.state, 'completed');
  assert.equal(result.task.runCount, 1);
  assert.match(result.task.lastResult.stdout, /HEDES_REAL_TASK_EXECUTED/);
});

test('Stage 11: Application restart recovers interrupted tasks and offers at most one catch-up run', async () => {
  const now = Date.now();

  // Create mock state with:
  // 1. An orphaned running task (interrupted by crash/restart)
  // 2. A recurring task that missed 5 runs while offline
  const interruptedTask = {
    id: 'orphaned-task-1',
    projectId: 'test-proj-rec',
    title: 'Interrupted Task',
    command: 'npm test',
    capabilities: ['shell:execute'],
    state: 'running',
    schedule: { type: 'one-time', executeAt: now - 5000, timezone: 'UTC' },
    requiresApproval: false,
    approved: true,
    createdAt: now - 10000,
    updatedAt: now - 5000,
    runCount: 0,
  };

  const missedRecurringTask = {
    id: 'missed-task-2',
    projectId: 'test-proj-rec',
    title: 'Missed Hourly Task',
    command: 'echo HEDES_REAL_CATCHUP',
    capabilities: ['shell:execute'],
    state: 'pending',
    schedule: {
      type: 'recurring',
      executeAt: now - 3600000 * 5, // 5 hours ago
      cronIntervalMs: 3600000,
      timezone: 'UTC',
      catchUpOffered: false,
    },
    requiresApproval: false,
    approved: true,
    createdAt: now - 3600000 * 6,
    updatedAt: now - 3600000 * 5,
    nextRunAt: now - 3600000 * 5,
    runCount: 0,
  };

  await writeTasksToDisk([interruptedTask, missedRecurringTask]);

  // Resume scheduled tasks
  const resumeResult = await resumeScheduledTasks(now);

  assert.equal(resumeResult.recoveredInterrupted, 1, 'Orphaned task should be recovered');
  assert.equal(resumeResult.catchUpExecuted, 1, 'Should execute at most one catch-up run');

  const tasks = await listQueuedTasks('test-proj-rec');
  const recovered = tasks.find((t) => t.id === 'orphaned-task-1');
  const recurring = tasks.find((t) => t.id === 'missed-task-2');

  assert.equal(recovered?.state, 'failed');
  assert.ok(recovered?.lastError?.includes('Interrupted due to application restart'));

  assert.equal(recurring?.runCount, 1, 'Only one catch-up run executed');
  assert.equal(recurring?.schedule.catchUpOffered, true);
  assert.ok(recurring?.nextRunAt && recurring.nextRunAt > now, 'Rescheduled forward into future');
});
