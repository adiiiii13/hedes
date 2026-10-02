import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import lockfile from 'proper-lockfile';

const writes = new Map<string, Promise<unknown>>();
export function contentRevision(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function atomicWriteFile(target: string, content: string | Buffer, expectedRevision?: string | null): Promise<string> {
  const key = path.resolve(target);
  const previous = writes.get(key) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(key), { recursive: true });
    const release = await lockfile.lock(key, { realpath: false, stale: 30000, retries: { retries: 100, minTimeout: 20, maxTimeout: 100 } });
    try {
    if (expectedRevision !== undefined) {
      const original = await fs.readFile(key).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if ((original === null ? null : contentRevision(original)) !== expectedRevision) {
        throw new Error('File revision conflict: reload the file before saving');
      }
    }
    await fs.mkdir(path.dirname(key), { recursive: true });
    const temporary = `${key}.${crypto.randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, 'wx');
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally { await handle.close(); }
      for (let attempt = 0; ; attempt++) {
        try { await fs.rename(temporary, key); break; }
        catch (error) {
          if (attempt >= 6 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
          await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
        }
      }
    }
    finally { await fs.unlink(temporary).catch(() => {}); }
    return contentRevision(content);
    } finally { await release(); }
  });
  writes.set(key, operation);
  try { return await operation; }
  finally { if (writes.get(key) === operation) writes.delete(key); }
}
