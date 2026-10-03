import {
  getCloudSyncState,
  listChats,
  listCouncilSessions,
  saveChat,
  saveCouncilSession,
  setCloudSyncState,
  removeCloudSyncState,
  type ChatRecord,
  type CouncilSessionRecord,
} from '../persistence/db.ts';

export type CloudRecordType = 'chats' | 'council_sessions';
export interface CloudRecord {
  type: CloudRecordType;
  id: string;
  payload: Record<string, unknown>;
  revision: number;
  clientUpdatedAt: number;
  deleted: boolean;
}
export interface SyncManifestEntry { revision: number; hash: string }
export type SyncManifest = Record<string, SyncManifestEntry>;
export interface CloudSyncResult { uploaded: number; downloaded: number; conflicts: string[]; skipped: string[] }
export type SyncDecision = 'download' | 'upload' | 'unchanged' | 'conflict';
type LocalSyncRecord = { type: CloudRecordType; id: string; payload: Record<string, unknown>; updatedAt: number };
export interface SyncDependencies {
  listChats: () => Promise<ChatRecord[]>;
  listCouncilSessions: () => Promise<CouncilSessionRecord[]>;
  saveChat: (record: ChatRecord) => Promise<void>;
  saveCouncilSession: (record: CouncilSessionRecord) => Promise<void>;
  getState: <T>(key: string) => Promise<T | undefined>;
  setState: <T>(key: string, value: T) => Promise<void>;
  removeState: (key: string) => Promise<void>;
  fetch: typeof fetch;
}
type PendingPush = { mutationId: string; records: Array<{ type: CloudRecordType; id: string; baseRevision: number; clientUpdatedAt: number; deleted: false; payload: Record<string, unknown> }> };

export function decideRecordSync(input: {
  localExists: boolean;
  localHash?: string;
  serverHash: string;
  serverRevision: number;
  previous?: SyncManifestEntry;
}): SyncDecision {
  if (!input.localExists) return 'download';
  if (input.localHash === input.serverHash) return 'unchanged';
  if (input.previous && input.localHash === input.previous.hash) return 'download';
  if (input.previous && input.serverRevision === input.previous.revision) return 'upload';
  return 'conflict';
}

const bodyLimit = 256 * 1024;
const safeField = /(^|_)(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|credential)(_|$)/i;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => item !== undefined && !safeField.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function recordKey(type: CloudRecordType, id: string) { return `${type}:${id}`; }

function cleanChat(chat: ChatRecord): Record<string, unknown> {
  return {
    id: chat.id,
    title: chat.title,
    model: chat.model,
    provider: chat.provider,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    // Screenshots and generated artifacts can be large and contain local paths.
    // Keep transcript text only; project files and images have a separate API.
    messages: (Array.isArray(chat.messages) ? chat.messages : []).map((item: any) => ({
      id: String(item?.id ?? ''),
      role: item?.role,
      content: typeof item?.content === 'string' ? item.content : '',
      createdAt: Number(item?.createdAt) || 0,
    })),
  };
}

function cleanCouncil(session: CouncilSessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    title: session.title,
    mode: session.mode,
    personaId: session.personaId,
    personaName: session.personaName,
    messages: (Array.isArray(session.messages) ? session.messages : []).map((item: any) => ({
      id: String(item?.id ?? ''),
      role: item?.role,
      content: typeof item?.content === 'string' ? item.content : '',
      createdAt: Number(item?.createdAt) || 0,
      personaId: item?.personaId,
      personaName: item?.personaName,
    })),
    timestamp: session.timestamp,
    updatedAt: session.updatedAt,
  };
}

function asRemoteRecord(value: any): CloudRecord | null {
  if (!value || !['chats', 'council_sessions'].includes(value.type) || typeof value.id !== 'string'
    || !value.payload || typeof value.payload !== 'object' || !Number.isSafeInteger(value.revision)) return null;
  return value as CloudRecord;
}

async function requestJson<T>(url: string, token: string, init: RequestInit | undefined, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof body?.error === 'string' ? body.error : `Cloud request failed (${response.status})`), { status: response.status });
  return body as T;
}

const defaultDependencies: SyncDependencies = {
  listChats: async () => {
    // The host-disk project store is authoritative for chat history. IndexedDB
    // remains a cache and may be stale after restore or a second-device sync.
    const response = await fetch('/api/local/projects', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not read local project history (${response.status})`);
    const body = await response.json() as { projects?: ChatRecord[] };
    const diskChats = Array.isArray(body.projects) ? body.projects : [];
    const byId = new Map(diskChats.map((chat) => [chat.id, chat]));
    for (const cached of await listChats()) if (!byId.has(cached.id)) byId.set(cached.id, cached);
    return [...byId.values()];
  },
  listCouncilSessions,
  saveChat: async (record) => {
    const response = await fetch('/api/local/projects', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not check local project history (${response.status})`);
    const body = await response.json() as { projects?: Array<{ id: string; revision?: number }> };
    const current = body.projects?.find((project) => project.id === record.id);
    const saved = await fetch('/api/local/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: record.id,
        title: record.title,
        model: record.model,
        provider: record.provider,
        messages: record.messages,
        ...(current?.revision ? { expectedRevision: current.revision } : {}),
      }),
    });
    if (!saved.ok) throw new Error(`Could not restore synced chat to local disk (${saved.status})`);
    const result = await saved.json() as { project?: { revision?: number } };
    await saveChat({ ...record, revision: result.project?.revision ?? record.revision });
  },
  saveCouncilSession,
  getState: getCloudSyncState,
  setState: setCloudSyncState,
  removeState: removeCloudSyncState,
  fetch: globalThis.fetch.bind(globalThis),
};

export async function syncLocalHistory(baseUrl: string, token: string, accountId: string, dependencies: SyncDependencies = defaultDependencies): Promise<CloudSyncResult> {
  const root = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(root) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(root)) {
    throw new Error('Cloud API URL must use HTTPS (HTTP is allowed only for localhost)');
  }
  if (!token) throw new Error('Cloud login session has expired. Sign in again.');

  const [chats, sessions] = await Promise.all([dependencies.listChats(), dependencies.listCouncilSessions()]);
  const local = new Map<string, LocalSyncRecord>();
  for (const chat of chats) local.set(recordKey('chats', chat.id), { type: 'chats', id: chat.id, payload: cleanChat(chat), updatedAt: chat.updatedAt });
  for (const session of sessions) local.set(recordKey('council_sessions', session.id), { type: 'council_sessions', id: session.id, payload: cleanCouncil(session), updatedAt: session.updatedAt });

  if (!accountId || accountId.length > 128) throw new Error('Cloud account identity is invalid');
  const manifestKey = `manifest:${accountId}`;
  const pendingKey = `pending:${accountId}`;
  const manifest = await dependencies.getState<SyncManifest>(manifestKey) ?? {};
  const result: CloudSyncResult = { uploaded: 0, downloaded: 0, conflicts: [], skipped: [] };
  const sendBatch = async (pending: PendingPush) => {
    await dependencies.setState(pendingKey, pending);
    let response: { accepted?: Array<{ type: string; id: string; revision: number }>; conflicts?: Array<{ type: string; id: string }> } | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await requestJson<{ accepted?: Array<{ type: string; id: string; revision: number }>; conflicts?: Array<{ type: string; id: string }> }>(`${root}/v1/sync/push`, token, { method: 'POST', body: JSON.stringify(pending) }, dependencies.fetch);
        break;
      } catch (cause) {
        const status = (cause as { status?: number })?.status;
        const retryable = status === undefined || status === 429 || status >= 500;
        if (!retryable || attempt === 2) throw cause;
        await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      }
    }
    for (const accepted of response?.accepted ?? []) {
      const key = recordKey(accepted.type as CloudRecordType, accepted.id);
      const uploaded = pending.records.find((entry) => recordKey(entry.type, entry.id) === key);
      if (!uploaded) continue;
      manifest[key] = { revision: accepted.revision, hash: await fingerprint(uploaded.payload) };
      result.uploaded += 1;
    }
    for (const conflict of response?.conflicts ?? []) result.conflicts.push(`${conflict.type}/${conflict.id}`);
    await dependencies.setState(manifestKey, manifest);
    await dependencies.removeState(pendingKey);
  };
  const pending = await dependencies.getState<PendingPush>(pendingKey);
  if (pending) await sendBatch(pending);
  const remote = new Map<string, CloudRecord>();
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page: { records?: unknown[]; nextCursor?: string | null } = await requestJson(`${root}/v1/sync/pull?limit=100${query}`, token, undefined, dependencies.fetch);
    for (const raw of page.records ?? []) {
      const record = asRemoteRecord(raw);
      if (record) remote.set(recordKey(record.type, record.id), record);
    }
    cursor = page.nextCursor ?? null;
  } while (cursor);

  const uploads: Array<{ record: LocalSyncRecord; baseRevision: number }> = [];

  for (const [key, server] of remote) {
    const localRecord = local.get(key);
    const serverHash = await fingerprint(server.payload);
    const decision = decideRecordSync({
      localExists: Boolean(localRecord),
      localHash: localRecord ? await fingerprint(localRecord.payload) : undefined,
      serverHash,
      serverRevision: server.revision,
      previous: manifest[key],
    });
    if (decision === 'download') {
      if (server.type === 'chats') {
        const p = server.payload as unknown as ChatRecord;
        if (typeof p.id === 'string' && Array.isArray(p.messages)) {
          await dependencies.saveChat({ ...p, revision: server.revision });
          result.downloaded += 1;
          manifest[key] = { revision: server.revision, hash: serverHash };
        } else result.skipped.push(server.id);
      } else {
        const p = server.payload as unknown as CouncilSessionRecord;
        if (typeof p.id === 'string' && Array.isArray(p.messages)) {
          await dependencies.saveCouncilSession({ ...p, updatedAt: Number(p.updatedAt) || Date.now() });
          result.downloaded += 1;
          manifest[key] = { revision: server.revision, hash: serverHash };
        } else result.skipped.push(server.id);
      }
      continue;
    }

    if (!localRecord) continue;
    if (decision === 'unchanged') {
      manifest[key] = { revision: server.revision, hash: serverHash };
    } else if (decision === 'upload') {
      const previous = manifest[key];
      if (previous) uploads.push({ record: localRecord, baseRevision: previous.revision });
    } else {
      result.conflicts.push(`${server.type}/${server.id}`);
    }
  }

  for (const [key, item] of local) {
    if (remote.has(key)) continue;
    uploads.push({ record: item, baseRevision: 0 });
  }

  let batch: typeof uploads = [];
  const flush = async () => {
    if (!batch.length) return;
    const body: PendingPush = { mutationId: crypto.randomUUID(), records: batch.map(({ record, baseRevision }) => ({
      type: record.type,
      id: record.id,
      baseRevision,
      clientUpdatedAt: Math.max(1, record.updatedAt || Date.now()),
      deleted: false,
      payload: record.payload,
    })) };
    await sendBatch(body);
    batch = [];
  };

  for (const entry of uploads) {
    const candidate = [...batch, entry];
    const bodySize = new TextEncoder().encode(JSON.stringify({ mutationId: '00000000-0000-4000-8000-000000000000', records: candidate })).byteLength;
    if (bodySize > bodyLimit && batch.length) await flush();
    const singleSize = new TextEncoder().encode(JSON.stringify(entry.record.payload)).byteLength;
    if (singleSize > bodyLimit - 1024) {
      result.skipped.push(entry.record.id);
      continue;
    }
    batch.push(entry);
    if (batch.length >= 50) await flush();
  }
  await flush();
  await dependencies.setState(manifestKey, manifest);
  return result;
}
