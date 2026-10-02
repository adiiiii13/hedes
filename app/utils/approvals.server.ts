import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { getStoragePaths } from './runtime.server.ts';
import { atomicWriteFile } from './atomic-write.server.ts';
import { getServerSessionToken } from './session-auth.server.ts';

export interface Approval {
  id: string;
  session: string;
  scope: string;
  payload: unknown;
  hash: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'consumed';
}
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const digest = (value: unknown) => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const directory = () => path.join(getStoragePaths().userData, 'approvals');
function filename(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid approval ID');
  return path.join(directory(), `${id}.json`);
}
export async function proposeApproval(scope: string, payload: unknown): Promise<Approval> {
  const encoded = canonical(payload);
  if (encoded.length > 2_000_000) throw new Error('Approval payload exceeds 2MB');
  const record: Approval = { id: crypto.randomUUID(), session: digest(getServerSessionToken()), scope, payload,
    hash: digest({ scope, payload }), createdAt: Date.now(), expiresAt: Date.now() + 15 * 60_000, status: 'pending' };
  await atomicWriteFile(filename(record.id), JSON.stringify(record));
  return record;
}
export async function readApproval(id: string): Promise<Approval> {
  const record: Approval = JSON.parse(await fs.readFile(filename(id), 'utf8'));
  if (record.session !== digest(getServerSessionToken()) || record.expiresAt < Date.now()) throw new Error('Approval expired; review again');
  return record;
}
async function mutate(id: string, operation: (record: Approval) => void) {
  const target = filename(id);
  const release = await lockfile.lock(`${target}.transaction`, { realpath: false, retries: 20 });
  try {
    const record = await readApproval(id);
    operation(record);
    await atomicWriteFile(target, JSON.stringify(record));
    return record;
  } finally { await release(); }
}
export async function decideApproval(id: string, hash: string, approved: boolean) {
  return mutate(id, record => {
    if (record.status !== 'pending' || record.hash !== hash) throw new Error('Approval changed or already decided');
    record.status = approved ? 'approved' : 'rejected';
  });
}
export async function consumeApproval(id: string, scope: string, payload: unknown) {
  return mutate(id, record => {
    if (record.status !== 'approved' || record.hash !== digest({ scope, payload })) throw new Error('Approval missing, already used, or payload changed');
    record.status = 'consumed';
  });
}
export async function requireApproval(request: Request, scope: string, payload: unknown): Promise<Response | null> {
  const id = request.headers.get('X-Hedes-Approval');
  if (id) {
    try { await consumeApproval(id, scope, payload); return null; }
    catch (error) { return Response.json({ error: (error as Error).message }, { status: 403 }); }
  }
  const record = await proposeApproval(scope, payload);
  return Response.json({ approval: { ...record, session: undefined } }, { status: 428 });
}
export async function pendingApprovals(): Promise<Approval[]> {
  const entries = await fs.readdir(directory()).catch(() => [] as string[]);
  const records: Approval[] = [];
  for (const name of entries.filter(name => name.endsWith('.json'))) {
    try {
      const record = await readApproval(name.slice(0, -5));
      if (record.status === 'pending' && record.scope === 'mcp') records.push(record);
    } catch { /* Expired approvals cannot be reused. */ }
  }
  return records;
}
