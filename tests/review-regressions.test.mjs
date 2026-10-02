import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { atomicWriteFile } from '../app/utils/atomic-write.server.ts';
import { createFullBackupArchive, restoreFullBackupArchive } from '../app/utils/backup.server.ts';
import { getServerSessionToken, verifyLocalSessionRequest } from '../app/utils/session-auth.server.ts';
import { resolveProjectDir } from '../app/utils/project-dir.server.ts';
import { startWebsite, stopWebsite } from '../app/utils/website-runner.server.ts';

test('review: session token cannot authorize a different localhost origin', () => {
  const request = new Request('http://localhost:5186/api/local/fs', { headers: {
    Origin: 'http://localhost:9000', 'X-Hedes-Session-Token': getServerSessionToken(),
  } });
  assert.equal(verifyLocalSessionRequest(request).status, 403);
});

test('review: actual atomic writer rejects two saves based on the same revision', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-atomic-review-'));
  try {
    const file = path.join(dir, 'data.txt');
    const revision = await atomicWriteFile(file, 'original');
    const outcomes = await Promise.allSettled([
      atomicWriteFile(file, 'first', revision), atomicWriteFile(file, 'second', revision),
    ]);
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
    assert.equal(await fs.readFile(file, 'utf8'), 'first');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('review: backup rejects tampered manifests and extra files before restore', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-backup-review-'));
  try {
    await fs.mkdir(path.join(dir, 'projects', 'demo'), { recursive: true });
    const original = path.join(dir, 'projects', 'demo', 'safe.txt');
    await fs.writeFile(original, 'keep-me');
    const { archiveBuffer } = await createFullBackupArchive(dir);
    const zip = await JSZip.loadAsync(archiveBuffer);
    zip.file('projects/demo/injected.txt', 'unexpected');
    await assert.rejects(restoreFullBackupArchive(await zip.generateAsync({ type: 'nodebuffer' }), dir), /Unmanifested/);
    assert.equal(await fs.readFile(original, 'utf8'), 'keep-me');
    const manifest = JSON.parse(await zip.file('manifest.json').async('text'));
    manifest.createdAt++;
    zip.file('manifest.json', JSON.stringify(manifest));
    await assert.rejects(restoreFullBackupArchive(await zip.generateAsync({ type: 'nodebuffer' }), dir), /manifest integrity/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('review: real website process starts without dependencies, serves content and receives no session token', async () => {
  const id = 'review-real-website';
  const { projectDir } = await resolveProjectDir(id);
  await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ scripts: { dev: 'node server.cjs' } }));
  await fs.writeFile(path.join(projectDir, 'server.cjs'), `require('node:http').createServer((req,res)=>res.end(JSON.stringify({message:'HEDES_REAL_PREVIEW_OK', leaked: Boolean(process.env.HEDES_SESSION_TOKEN || process.env.REVIEW_API_KEY)}))).listen(Number(process.env.PORT),'127.0.0.1');`);
  process.env.REVIEW_API_KEY = 'review-secret';
  getServerSessionToken();
  try {
    const status = await startWebsite(id);
    assert.equal(status.running, true, status.error || status.logs.join('\n'));
    const reply = await (await fetch(status.url)).json();
    assert.equal(reply.message, 'HEDES_REAL_PREVIEW_OK');
    assert.equal(reply.leaked, false);
  } finally { delete process.env.REVIEW_API_KEY; await stopWebsite(id); }
});
