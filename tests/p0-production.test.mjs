import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { proposeApproval, decideApproval, consumeApproval } from '../app/utils/approvals.server.ts';
import { atomicWriteFile } from '../app/utils/atomic-write.server.ts';
import { readBoundedZip } from '../app/utils/bounded-zip.server.ts';
import { beginRestore, recoverInterruptedRestore, restoreInProgress } from '../app/utils/restore-recovery.server.ts';
import { createFullBackupArchive, restoreFullBackupArchive } from '../app/utils/backup.server.ts';

test('P0: server rejects unapproved, changed, replayed and simultaneous approval use', async () => {
  const payload = { projectId: 'demo', runId: 'r1', command: 'echo hello' };
  const record = await proposeApproval('command', payload);
  await assert.rejects(consumeApproval(record.id, 'command', payload), /Approval missing/);
  await decideApproval(record.id, record.hash, true);
  await assert.rejects(consumeApproval(record.id, 'command', { ...payload, command: 'echo changed' }), /payload changed/);
  const outcomes = await Promise.allSettled([consumeApproval(record.id, 'command', payload), consumeApproval(record.id, 'command', payload)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  await assert.rejects(consumeApproval(record.id, 'command', payload), /already used/);
});

function child(code) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; processHandle.stderr.on('data', chunk => output += chunk);
    processHandle.on('error', reject);
    processHandle.on('exit', code => resolve({ code, output }));
  });
}
test('P0: different OS processes cannot overwrite the same file revision', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-p0-process-'));
  try {
    const target = path.join(directory, 'file.txt');
    const revision = await atomicWriteFile(target, 'before');
    const module = pathToFileURL(path.resolve('app/utils/atomic-write.server.ts')).href;
    const outcomes = await Promise.all(['one', 'two'].map(value => child(`import {atomicWriteFile} from ${JSON.stringify(module)}; await atomicWriteFile(${JSON.stringify(target)}, ${JSON.stringify(value)}, ${JSON.stringify(revision)});`)));
    assert.equal(outcomes.filter(result => result.code === 0).length, 1, JSON.stringify(outcomes));
    assert.match(outcomes.find(result => result.code !== 0).output, /revision conflict/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('P0: bounded ZIP rejects expansion before accepting oversized contents', async () => {
  const zip = new JSZip(); zip.file('projects/demo/bomb.txt', Buffer.alloc(51 * 1024 * 1024));
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await assert.rejects(readBoundedZip(archive), /size exceeds/);
});

test('P0: restore journal survives interrupted process and rolls back on next startup', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-p0-crash-'));
  try {
    const target = path.join(directory, 'projects', 'demo', 'file.txt');
    await atomicWriteFile(target, 'original');
    const module = pathToFileURL(path.resolve('app/utils/restore-recovery.server.ts')).href;
    const outcome = await child(`import {beginRestore} from ${JSON.stringify(module)}; import {writeFile} from 'node:fs/promises'; const transaction=await beginRestore(${JSON.stringify(directory)}); await transaction.record(${JSON.stringify(target)},Buffer.from('original')); await writeFile(${JSON.stringify(target)},'interrupted restore'); process.exit(7);`);
    assert.equal(outcome.code, 7, outcome.output);
    assert.equal(restoreInProgress(directory), true);
    await recoverInterruptedRestore(directory);
    assert.equal(await fs.readFile(target, 'utf8'), 'original');
    assert.equal(restoreInProgress(directory), false);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('P0: expanded backup restores authoritative settings and feature data', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-p0-backup-'));
  try {
    for (const category of ['settings', 'mcp', 'plugins', 'tasks', 'store', 'changesets']) {
      await atomicWriteFile(path.join(directory, category, 'data.json'), JSON.stringify({ category, original: true }));
    }
    const { archiveBuffer } = await createFullBackupArchive(directory);
    await atomicWriteFile(path.join(directory, 'tasks', 'data.json'), 'changed');
    const result = await restoreFullBackupArchive(archiveBuffer, directory);
    assert.equal(result.restoredCount, 6);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'tasks', 'data.json'), 'utf8')).original, true);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
