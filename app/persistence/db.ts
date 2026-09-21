import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CustomProviderConfig } from '~/types/model';

export interface ChatRecord {
  id: string;
  title: string;
  messages: any[];
  model: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
}

export interface CouncilSessionRecord {
  id: string;
  title: string;
  mode: 'assembly' | 'direct';
  personaId?: number;
  personaName?: string;
  messages: any[];
  timestamp: number;
  updatedAt: number;
}

interface HedesDB extends DBSchema {
  chats: {
    key: string;
    value: ChatRecord;
    indexes: { 'by-updated': number };
  };
  council_sessions: {
    key: string;
    value: CouncilSessionRecord;
    indexes: { 'by-updated': number };
  };
  custom_models: {
    key: string;
    value: CustomProviderConfig;
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'hedes_studio_db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<HedesDB>> | null = null;

export function getHedesDB(): Promise<IDBPDatabase<HedesDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available on server'));
  }

  if (!dbPromise) {
    dbPromise = openDB<HedesDB>(DB_NAME, DB_VERSION, {
      upgrade(db: any, oldVersion: number) {
        if (!db.objectStoreNames.contains('chats')) {
          const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
          chatStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('council_sessions')) {
          const councilStore = db.createObjectStore('council_sessions', { keyPath: 'id' });
          councilStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('custom_models')) {
          db.createObjectStore('custom_models', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }

  return dbPromise!;
}

export async function saveChat(chat: ChatRecord): Promise<void> {
  const db = await getHedesDB();
  await db.put('chats', chat);
}

export async function getChat(id: string): Promise<ChatRecord | undefined> {
  const db = await getHedesDB();
  return db.get('chats', id);
}

export async function listChats(): Promise<ChatRecord[]> {
  const db = await getHedesDB();
  const all = await db.getAllFromIndex('chats', 'by-updated');
  return all.reverse();
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getHedesDB();
  await db.delete('chats', id);
}

// ── Council Session Local Database Operations ────────────────────────────────
export async function saveCouncilSession(session: CouncilSessionRecord): Promise<void> {
  try {
    const db = await getHedesDB();
    await db.put('council_sessions', session);
  } catch (err) {
    console.error('Failed to save council session to IndexedDB:', err);
  }
}

export async function getCouncilSession(id: string): Promise<CouncilSessionRecord | undefined> {
  try {
    const db = await getHedesDB();
    return db.get('council_sessions', id);
  } catch (err) {
    console.error('Failed to get council session from IndexedDB:', err);
    return undefined;
  }
}

export async function listCouncilSessions(): Promise<CouncilSessionRecord[]> {
  try {
    const db = await getHedesDB();
    if (!db.objectStoreNames.contains('council_sessions')) return [];
    const all = await db.getAllFromIndex('council_sessions', 'by-updated');
    return all.reverse();
  } catch (err) {
    console.error('Failed to list council sessions from IndexedDB:', err);
    return [];
  }
}

export async function deleteCouncilSession(id: string): Promise<void> {
  try {
    const db = await getHedesDB();
    await db.delete('council_sessions', id);
  } catch (err) {
    console.error('Failed to delete council session from IndexedDB:', err);
  }
}

export async function saveCustomModel(config: CustomProviderConfig): Promise<void> {
  const db = await getHedesDB();
  await db.put('custom_models', config);
}

export async function listCustomModels(): Promise<CustomProviderConfig[]> {
  const db = await getHedesDB();
  return db.getAll('custom_models');
}

export async function deleteCustomModel(id: string): Promise<void> {
  const db = await getHedesDB();
  await db.delete('custom_models', id);
}
