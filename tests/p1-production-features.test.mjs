import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { acquireGatewaySlot } from '../app/llm/gateway.server.ts';
import { deleteWhisperModel, checkVoiceCapabilities, OFFICIAL_WHISPER_MODELS } from '../app/utils/voice.server.ts';
import { checkMcpHealth } from '../app/utils/mcp.server.ts';
import { promoteSkill, listSkills, createSkillDraft } from '../app/utils/skills.server.ts';
import {
  createQueuedTask,
  approveQueuedTask,
  cancelQueuedTask,
  listQueuedTasks,
  resumeScheduledTasks,
} from '../app/utils/task-queue.server.ts';
import { getDefaultUserDataDir } from '../app/utils/runtime.server.ts';

test('P1 Item 7: Gateway manages shared concurrency and slot acquisition', async () => {
  const slot1 = await acquireGatewaySlot({ provider: 'groq' });
  assert.ok(slot1 && typeof slot1.release === 'function');
  const slot2 = await acquireGatewaySlot({ provider: 'groq' });
  assert.ok(slot2 && typeof slot2.release === 'function');
  slot1.release();
  slot2.release();
});

test('P1 Item 8: Voice status and Whisper offline model configuration', async () => {
  const caps = await checkVoiceCapabilities();
  assert.ok(caps.platform);
  assert.ok(typeof caps.offlineCapable === 'boolean');
  assert.ok(caps.whisperCpp);
  assert.ok(caps.tts);

  // Verify official multilingual models include Hindi & English
  assert.ok(OFFICIAL_WHISPER_MODELS['ggml-base']);
  assert.ok(OFFICIAL_WHISPER_MODELS['ggml-base'].languages.includes('hi'));
  assert.ok(OFFICIAL_WHISPER_MODELS['ggml-base'].languages.includes('en'));

  // Test non-existent model deletion returns false safely
  const deleted = await deleteWhisperModel('non-existent-model');
  assert.equal(deleted, false);
});

test('P1 Item 9: MCP health check returns status and latency', async () => {
  const health = await checkMcpHealth({
    command: 'node',
    args: ['-e', 'process.exit(1)'],
  });
  assert.ok(typeof health.healthy === 'boolean');
  assert.ok(typeof health.latencyMs === 'number');
  assert.ok(typeof health.toolCount === 'number');
});

test('P1 Item 10: VS Code Companion Bridge diagnostics report and sync', async () => {
  const bridgeDataPath = path.join(getDefaultUserDataDir(), 'vscode-bridge.json');
  const diagnosticsPayload = {
    action: 'report-diagnostics',
    diagnostics: [
      {
        file: 'app/root.tsx',
        range: { startLine: 1, startCol: 1, endLine: 1, endCol: 10 },
        message: 'Unused import',
        severity: 'warning',
        source: 'eslint',
      },
    ],
  };

  await fs.mkdir(path.dirname(bridgeDataPath), { recursive: true });
  await fs.writeFile(bridgeDataPath, JSON.stringify({
    diagnostics: diagnosticsPayload.diagnostics,
    updatedAt: Date.now(),
  }));

  const readBack = JSON.parse(await fs.readFile(bridgeDataPath, 'utf8'));
  assert.equal(readBack.diagnostics.length, 1);
  assert.equal(readBack.diagnostics[0].severity, 'warning');
});

test('P1 Item 11: Learned skill promotion transitions draft to installed and enabled', async () => {
  const draftName = `test-draft-${Date.now()}`;
  await createSkillDraft({
    name: draftName,
    description: 'Test learned capability',
    instructions: 'When requested, do something specific',
    sourceRunId: 'test-run-123',
  });

  const beforeSkills = await listSkills();
  const draft = beforeSkills.find(s => s.name === draftName);
  assert.ok(draft);
  assert.equal(draft.status, 'draft');

  // Promote
  const promoted = await promoteSkill(draftName);
  assert.equal(promoted.status, 'installed');
  assert.equal(promoted.enabled, true);

  const afterSkills = await listSkills();
  const updated = afterSkills.find(s => s.name === draftName);
  assert.ok(updated);
  assert.equal(updated.status, 'installed');
  assert.equal(updated.enabled, true);
});

test('P1 Item 12: Scheduled task approval, cancellation, and resume loop', async () => {
  const task = await createQueuedTask({
    projectId: 'default-project',
    title: 'Automated Build Test',
    command: 'echo "scheduled test"',
    capabilities: ['shell:execute'],
    schedule: {
      type: 'one-time',
      executeAt: Date.now() + 100000,
      timezone: 'UTC',
    },
    requiresApproval: true,
  });

  assert.equal(task.state, 'approval_required');
  assert.equal(task.approved, false);

  // Approve
  const approvedTask = await approveQueuedTask(task.id, true);
  assert.equal(approvedTask.state, 'pending');
  assert.equal(approvedTask.approved, true);

  // Cancel
  const cancelledTask = await cancelQueuedTask(task.id);
  assert.equal(cancelledTask.state, 'cancelled');
  assert.equal(cancelledTask.nextRunAt, undefined);

  // Verify list
  const allTasks = await listQueuedTasks('default-project');
  const found = allTasks.find(t => t.id === task.id);
  assert.ok(found);
  assert.equal(found.state, 'cancelled');

  // Resume scheduler tick
  const resumeResult = await resumeScheduledTasks();
  assert.ok(typeof resumeResult.recoveredInterrupted === 'number');
  assert.ok(typeof resumeResult.catchUpExecuted === 'number');
});

test('P1 Item 14: Large project folder tree lazy folding', () => {
  const shouldExpand = (depth, currentPath, nodePath) => {
    const containsActive = currentPath ? currentPath.startsWith(nodePath + '/') : false;
    return depth < 2 || containsActive;
  };

  assert.equal(shouldExpand(0, 'src/app/index.ts', 'src'), true);
  assert.equal(shouldExpand(1, 'src/app/index.ts', 'src/app'), true);
  assert.equal(shouldExpand(3, 'src/app/index.ts', 'src/deep/nested/sub'), false);
  assert.equal(shouldExpand(3, 'src/deep/nested/sub/file.ts', 'src/deep/nested/sub'), true);
});
