import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCheckpoint, compareCheckpoint, restoreCheckpoint } from '../app/utils/checkpoints.server.ts';

test('checkpoint compares and restores changed and new project files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-checkpoint-'));
  try {
    await fs.writeFile(path.join(directory, 'app.ts'), 'before');
    await fs.writeFile(path.join(directory, '.env'), 'secret');
    const checkpoint = await createCheckpoint(directory, 'Before AI change');
    await fs.writeFile(path.join(directory, 'app.ts'), 'after');
    await fs.writeFile(path.join(directory, 'new.ts'), 'new file');
    const comparison = await compareCheckpoint(directory, checkpoint.id);
    assert.deepEqual(comparison.changed, ['app.ts', 'new.ts']);
    assert.equal(comparison.before['.env'], undefined);
    await restoreCheckpoint(directory, checkpoint.id);
    assert.equal(await fs.readFile(path.join(directory, 'app.ts'), 'utf8'), 'before');
    await assert.rejects(fs.access(path.join(directory, 'new.ts')));
    assert.equal(await fs.readFile(path.join(directory, '.env'), 'utf8'), 'secret');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
