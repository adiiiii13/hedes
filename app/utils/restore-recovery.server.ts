import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { atomicWriteFile } from './atomic-write.server.ts';
import { assertProjectPathSafe } from './project-dir.server.ts';
import { getStoragePaths } from './runtime.server.ts';

const journalDirectory = (root: string) => path.join(root, 'backups', 'restore-transaction');
export function restoreInProgress(root = getStoragePaths().userData) {
  return existsSync(path.join(journalDirectory(root), 'active.json'));
}
async function rollback(root: string) {
  const directory = journalDirectory(root);
  if (!restoreInProgress(root)) return;
  const entries = (await fs.readdir(directory)).filter(name => /^\d+\.json$/.test(name)).sort().reverse();
  for (const name of entries) {
    const record = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
    const destination = path.resolve(root, record.relative);
    await assertProjectPathSafe(root, destination);
    if (!/^(projects|memory|skills|sessions|settings|mcp|plugins|tasks|store|changesets)[/\\]/.test(record.relative)) throw new Error('Invalid recovery destination');
    if (record.original === null) await fs.unlink(destination).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    else await atomicWriteFile(destination, Buffer.from(record.original, 'base64'));
  }
  await fs.unlink(path.join(directory, 'active.json'));
}
export async function recoverInterruptedRestore(root = getStoragePaths().userData) {
  if (!restoreInProgress(root)) return;
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(path.join(root, '.restore'), { realpath: false, stale: 30000, retries: 0 });
    await rollback(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ELOCKED') throw error;
  } finally { await release?.(); }
}
export async function beginRestore(root: string) {
  await fs.mkdir(root, { recursive: true });
  const release = await lockfile.lock(path.join(root, '.restore'), { realpath: false, stale: 30000, retries: 0 });
  try {
    await rollback(root);
    const directory = journalDirectory(root);
    await assertProjectPathSafe(root, directory);
    await fs.mkdir(directory, { recursive: true });
    for (const name of await fs.readdir(directory)) {
      if (/^\d+\.json$/.test(name)) await fs.unlink(path.join(directory, name));
    }
    await atomicWriteFile(path.join(directory, 'active.json'), JSON.stringify({ startedAt: Date.now() }));
    let count = 0;
    return {
      async record(destination: string, original: Buffer | null) {
        await assertProjectPathSafe(root, destination);
        await atomicWriteFile(path.join(directory, `${String(count++).padStart(6, '0')}.json`),
          JSON.stringify({ relative: path.relative(root, destination), original: original?.toString('base64') ?? null }));
      },
      async finish() { await fs.unlink(path.join(directory, 'active.json')); await release(); },
      async abort() { try { await rollback(root); } finally { await release(); } },
    };
  } catch (error) { await release(); throw error; }
}
