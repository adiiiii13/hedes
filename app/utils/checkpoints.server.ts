import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Checkpoint = { id: string; label: string; createdAt: number; files: Record<string, string> };
const skipped = new Set(['node_modules', '.git', '.hedes-checkpoints', 'dist', 'build', '.next', '.vite']);

async function projectFiles(projectDir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let total = 0;
  const visit = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || skipped.has(entry.name) || entry.name.startsWith('.env') || entry.name.startsWith('.hedes')) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (total < 5_000_000) await visit(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        if (stat.size > 500_000 || total + stat.size > 5_000_000) continue;
        const content = await fs.readFile(full, 'utf8');
        if (content.includes('\0')) continue;
        result[path.relative(projectDir, full).replace(/\\/g, '/')] = content;
        total += stat.size;
      }
    }
  };
  await visit(projectDir);
  return result;
}

function checkpointPath(projectDir: string, id: string): string {
  if (!/^[a-zA-Z0-9-]{1,90}$/.test(id)) throw new Error('Invalid checkpoint ID');
  return path.join(projectDir, '.hedes-checkpoints', `${id}.json`);
}

export async function createCheckpoint(projectDir: string, label: string): Promise<Checkpoint> {
  const checkpoint: Checkpoint = { id: `${Date.now()}-${randomUUID()}`, label: label.trim().slice(0, 120) || 'Before AI edit', createdAt: Date.now(), files: await projectFiles(projectDir) };
  const target = checkpointPath(projectDir, checkpoint.id);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(`${target}.tmp`, JSON.stringify(checkpoint), 'utf8');
  await fs.rename(`${target}.tmp`, target);
  return checkpoint;
}

export async function listCheckpoints(projectDir: string): Promise<Array<Omit<Checkpoint, 'files'> & { fileCount: number }>> {
  const directory = path.join(projectDir, '.hedes-checkpoints');
  const entries = await fs.readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? [] : Promise.reject(error));
  const items = await Promise.all(entries.filter((entry) => entry.endsWith('.json')).map(async (entry) => {
    const saved = JSON.parse(await fs.readFile(path.join(directory, entry), 'utf8')) as Checkpoint;
    return { id: saved.id, label: saved.label, createdAt: saved.createdAt, fileCount: Object.keys(saved.files).length };
  }));
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function readCheckpoint(projectDir: string, id: string): Promise<Checkpoint> {
  return JSON.parse(await fs.readFile(checkpointPath(projectDir, id), 'utf8')) as Checkpoint;
}

export async function compareCheckpoint(projectDir: string, id: string) {
  const snapshot = await readCheckpoint(projectDir, id);
  const current = await projectFiles(projectDir);
  const changed = [...new Set([...Object.keys(snapshot.files), ...Object.keys(current)])].filter((file) => snapshot.files[file] !== current[file]).sort();
  return { checkpoint: { id: snapshot.id, label: snapshot.label, createdAt: snapshot.createdAt }, changed, before: snapshot.files, after: current };
}

export async function restoreCheckpoint(projectDir: string, id: string): Promise<string[]> {
  const { before, after, changed } = await compareCheckpoint(projectDir, id);
  for (const file of changed) {
    const full = path.resolve(projectDir, file);
    if (!full.startsWith(path.resolve(projectDir) + path.sep)) throw new Error('Checkpoint path escaped project');
    const parts = path.relative(projectDir, full).split(path.sep);
    let cursor = projectDir;
    for (const part of parts) {
      cursor = path.join(cursor, part);
      if ((await fs.lstat(cursor).catch(() => null))?.isSymbolicLink()) throw new Error('Checkpoint path contains symbolic link');
    }
    if (Object.prototype.hasOwnProperty.call(before, file)) {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, before[file], 'utf8');
    } else if (Object.prototype.hasOwnProperty.call(after, file)) {
      await fs.rm(full);
    }
  }
  return changed;
}
