import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createChangeSet,
  applyChangeSet,
  revertChangeSet,
  attachTestResultToChangeSet,
} from '../app/utils/changesets.server.ts';

test('Stage 08: ChangeSets detect concurrent modifications and reject application on conflict', async () => {
  const tmpProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-cs-test-'));
  const testFile = path.join(tmpProjectDir, 'src', 'config.json');
  await fs.mkdir(path.dirname(testFile), { recursive: true });
  await fs.writeFile(testFile, JSON.stringify({ version: '1.0.0' }), 'utf8');

  // 1. AI proposes an edit
  const changeSet = await createChangeSet({
    projectId: 'test_project_1',
    projectDir: tmpProjectDir,
    runId: 'run_101',
    changes: [{ filePath: 'src/config.json', proposedContent: JSON.stringify({ version: '2.0.0' }) }],
  });

  assert.equal(changeSet.status, 'proposed');
  assert.equal(changeSet.changes.length, 1);
  assert.ok(changeSet.changes[0].expectedHash, 'Must capture expected baseline hash');

  // 2. User concurrently edits the file before AI proposal is approved
  await fs.writeFile(testFile, JSON.stringify({ version: '1.0.1-user-edit' }), 'utf8');

  // 3. Try applying the stale proposal
  const result = await applyChangeSet({
    changeSetId: changeSet.changeSetId,
    projectId: 'test_project_1',
    projectDir: tmpProjectDir,
  });

  assert.equal(result.success, false, 'Must reject application on conflict');
  assert.ok(result.error?.includes('Conflict detected'), 'Must state conflict error');

  // Verify file on disk was NOT overwritten
  const contentOnDisk = await fs.readFile(testFile, 'utf8');
  assert.equal(contentOnDisk, JSON.stringify({ version: '1.0.1-user-edit' }), 'Disk content must be preserved');

  await fs.rm(tmpProjectDir, { recursive: true, force: true });
});

test('Stage 08: Successful apply creates pre-apply checkpoint and supports clean revert', async () => {
  const tmpProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-cs-revert-'));
  const testFile = path.join(tmpProjectDir, 'index.html');
  await fs.writeFile(testFile, '<h1>Original Title</h1>', 'utf8');

  // 1. Propose change
  const changeSet = await createChangeSet({
    projectId: 'test_project_2',
    projectDir: tmpProjectDir,
    runId: 'run_102',
    changes: [{ filePath: 'index.html', proposedContent: '<h1>AI Proposed Title</h1>' }],
  });

  // 2. Apply change
  const applyRes = await applyChangeSet({
    changeSetId: changeSet.changeSetId,
    projectId: 'test_project_2',
    projectDir: tmpProjectDir,
  });

  assert.equal(applyRes.success, true);
  assert.ok(applyRes.changeSet.checkpointId, 'Must create recovery checkpoint');

  const contentAfterApply = await fs.readFile(testFile, 'utf8');
  assert.equal(contentAfterApply, '<h1>AI Proposed Title</h1>');

  // 3. Revert change
  const revertRes = await revertChangeSet({
    changeSetId: changeSet.changeSetId,
    projectId: 'test_project_2',
    projectDir: tmpProjectDir,
  });

  assert.equal(revertRes.success, true);
  const contentAfterRevert = await fs.readFile(testFile, 'utf8');
  assert.equal(contentAfterRevert, '<h1>Original Title</h1>', 'Revert must restore original checkpoint state');

  await fs.rm(tmpProjectDir, { recursive: true, force: true });
});

test('Stage 08: ChangeSets record actual test and command evidence', async () => {
  const tmpProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-cs-evidence-'));
  const changeSet = await createChangeSet({
    projectId: 'test_project_3',
    projectDir: tmpProjectDir,
    runId: 'run_103',
    changes: [{ filePath: 'math.js', proposedContent: 'export const sum = (a, b) => a + b;' }],
  });

  const updated = await attachTestResultToChangeSet({
    changeSetId: changeSet.changeSetId,
    projectId: 'test_project_3',
    passed: true,
    command: 'npm test -- math.test.js',
    output: 'PASS: 1 passed in 4ms',
  });

  assert.ok(updated.testResults);
  assert.equal(updated.testResults.passed, true);
  assert.equal(updated.testResults.command, 'npm test -- math.test.js');
  assert.ok(updated.testResults.verifiedAt);

  await fs.rm(tmpProjectDir, { recursive: true, force: true });
});
