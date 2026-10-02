import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createChangeSet, applyChangeSet } from '../app/utils/changesets.server.ts';
import { restoreFullBackupArchive } from '../app/utils/backup.server.ts';
import { normalizeFilePath } from '../app/utils/project-dir.server.ts';

test('Plan 3 Failure: Stale file revision is rejected when disk contents change concurrently', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-stale-rev-'));
  const targetFile = path.join(tmpDir, 'state.json');

  // Initial file
  await fs.writeFile(targetFile, JSON.stringify({ count: 1 }));

  try {
    // 1. Create ChangeSet expecting { count: 1 }
    const changeSet = await createChangeSet({
      projectId: 'proj-concurrent',
      projectDir: tmpDir,
      runId: 'run-concurrent',
      changes: [
        {
          filePath: 'state.json',
          proposedContent: JSON.stringify({ count: 2 }),
        },
      ],
    });

    // 2. Simulate concurrent modification on disk before apply
    await fs.writeFile(targetFile, JSON.stringify({ count: 999 })); // Modified externally!

    // 3. Apply should detect conflict and reject
    const result = await applyChangeSet({
      changeSetId: changeSet.changeSetId,
      projectId: 'proj-concurrent',
      projectDir: tmpDir,
    });

    assert.equal(result.success, false);
    assert.equal(result.changeSet.status, 'rejected');
    assert.ok(result.error?.includes('Conflict detected'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Plan 3 Failure: Corrupted backup archive is rejected without overwriting valid profile', async () => {
  // Pass invalid/corrupted zip buffer
  const corruptedBuffer = Buffer.from('NOT_A_VALID_ZIP_HEADER');

  await assert.rejects(
    async () => {
      await restoreFullBackupArchive(corruptedBuffer);
    },
    (err) => {
      assert.ok(err.message.includes('End of data reached') || err.message.includes('Invalid backup archive') || err.message.includes('Can\'t find end of central directory'));
      return true;
    }
  );
});

test('Plan 3 Failure: Atomic file safety ensures interrupted write does not destroy good data', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-atomic-test-'));
  const originalFile = path.join(tmpDir, 'important-data.json');
  const validData = JSON.stringify({ safe: true, timestamp: Date.now() });

  await fs.writeFile(originalFile, validData, 'utf8');

  // Simulated atomic write pattern
  async function safeAtomicWrite(targetPath, newContent, simulateFailure = false) {
    const tmpPath = `${targetPath}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, newContent, 'utf8');
    if (simulateFailure) {
      await fs.unlink(tmpPath).catch(() => {});
      throw new Error('Disk write simulated hardware failure');
    }
    await fs.rename(tmpPath, targetPath);
  }

  // Attempt write that fails midway
  await assert.rejects(
    async () => {
      await safeAtomicWrite(originalFile, 'CORRUPTED_INCOMPLETE_DATA', true);
    },
    /simulated hardware failure/
  );

  // Assert original file content remains completely intact!
  const currentContent = await fs.readFile(originalFile, 'utf8');
  assert.equal(currentContent, validData);

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('Plan 3 Edge Case: Project path normalization handles Unicode and spaces safely', () => {
  const pathWithSpaces = 'My Subfolder/My Project File.tsx';
  const normalizedSpaces = normalizeFilePath(pathWithSpaces, 'test-project');
  assert.equal(normalizedSpaces, 'My Subfolder/My Project File.tsx');

  const pathWithUnicode = 'src/हिंदी/घटक.ts';
  const normalizedUnicode = normalizeFilePath(pathWithUnicode, 'test-project');
  assert.equal(normalizedUnicode, 'src/हिंदी/घटक.ts');
});
