import { atom, map, type MapStore } from 'nanostores';
import { StreamingMessageParser } from '~/engine/message-parser';
import { actionRunner, isBuilding } from './workspace';
import { saveChat } from '~/persistence/db';
import { activeModel, activeProvider } from './settings';
import type { BoltAction } from '~/types/actions';

export interface ActionItemState extends BoltAction {
  status: 'pending' | 'running' | 'complete' | 'failed';
  error?: string;
}

export interface ArtifactState {
  id: string;
  title: string;
  type?: string;
  closed: boolean;
  actions: Record<string, ActionItemState>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // Clean parsed markdown text with placeholder
  rawContent?: string; // Full raw stream with XML tags (used for context engine & persistence)
  images?: string[]; // Array of base64 data URLs for vision/screenshot-to-code
  createdAt: number;
}

const initialChatId = typeof window !== 'undefined' && localStorage.getItem('hedes_current_chat')
  ? (localStorage.getItem('hedes_current_chat') as string)
  : `chat-${Date.now()}`;

export const currentChatId = atom<string>(initialChatId);
export const chatMessages = atom<ChatMessage[]>([]);
export const isGenerating = atom<boolean>(false);
export const chatInput = atom<string>('');

// Artifacts indexed by messageId
export const artifactsStore: MapStore<Record<string, ArtifactState>> = map({});

export const parser = new StreamingMessageParser({
  callbacks: {
    onArtifactOpen(data) {
      isBuilding.set(true);
      const current = { ...artifactsStore.get() };
      const existing = current[data.messageId];
      current[data.messageId] = {
        id: data.id,
        title: data.title || 'Project Files',
        type: data.type,
        closed: false,
        actions: existing ? existing.actions : {},
      };
      artifactsStore.set(current);
    },
    onArtifactClose(data) {
      const current = { ...artifactsStore.get() };
      if (current[data.messageId]) {
        current[data.messageId] = {
          ...current[data.messageId],
          closed: true,
        };
        artifactsStore.set(current);
      }
      isBuilding.set(false);
    },
    onActionOpen(data) {
      const current = { ...artifactsStore.get() };
      const art = current[data.messageId] || {
        id: data.artifactId,
        title: 'Project Files',
        closed: false,
        actions: {},
      };
      art.actions = {
        ...art.actions,
        [data.actionId]: {
          ...data.action,
          status: 'running',
        },
      };
      current[data.messageId] = art;
      artifactsStore.set(current);
      actionRunner.addAction(data.action);
    },
    onActionClose(data) {
      // Execute the action (writes file to disk or runs terminal command)
      actionRunner.runAction(data.action);
    },
  },
});

actionRunner.onActionComplete = (actionId) => {
  const current = { ...artifactsStore.get() };
  let changed = false;
  for (const [msgId, art] of Object.entries(current)) {
    if (art.actions && art.actions[actionId]) {
      art.actions[actionId] = {
        ...art.actions[actionId],
        status: 'complete',
      };
      changed = true;
    }
  }
  if (changed) {
    artifactsStore.set(current);
  }
};

actionRunner.onActionError = (actionId, errorMsg) => {
  const current = { ...artifactsStore.get() };
  let changed = false;
  for (const [msgId, art] of Object.entries(current)) {
    if (art.actions && art.actions[actionId]) {
      art.actions[actionId] = {
        ...art.actions[actionId],
        status: 'failed',
        error: errorMsg,
      };
      changed = true;
    }
  }
  if (changed) {
    artifactsStore.set(current);
  }
};

export function appendMessage(msg: ChatMessage) {
  chatMessages.set([...chatMessages.get(), msg]);
}

export function updateLastMessage(messageId: string, fullStreamedText: string) {
  const messages = [...chatMessages.get()];
  const msgIndex = messages.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) return;

  // Parser strips raw code from actions and outputs clean markdown + artifact div
  const cleanParsed = parser.parse(messageId, fullStreamedText);

  messages[msgIndex] = {
    ...messages[msgIndex],
    content: cleanParsed,
    rawContent: fullStreamedText,
  };
  chatMessages.set(messages);
}

export function flushParser(messageId: string) {
  parser.flush(messageId);
}

export async function persistCurrentChat() {
  const id = currentChatId.get();
  const msgs = chatMessages.get();
  
  let allFiles: Record<string, string> = {};
  try {
    const { files } = await import('~/stores/workspace');
    allFiles = files.get();
  } catch {}
  
  const fileKeys = Object.keys(allFiles);

  // If there are neither messages nor files, nothing to save
  if (msgs.length === 0 && fileKeys.length === 0) return;

  if (typeof window !== 'undefined') {
    localStorage.setItem('hedes_current_chat', id);
  }

  const firstUser = msgs.find((m: ChatMessage) => m.role === 'user');
  let title = 'New Project';
  if (firstUser && firstUser.content.trim()) {
    title = firstUser.content.trim().slice(0, 45);
  } else if (allFiles['package.json']) {
    try {
      const pkg = JSON.parse(allFiles['package.json']);
      if (pkg.name) title = pkg.name;
    } catch {}
  } else if (allFiles['pubspec.yaml']) {
    const match = allFiles['pubspec.yaml'].match(/name:\s*([^\r\n]+)/);
    if (match) title = match[1].trim();
  } else if (fileKeys.length > 0) {
    title = `Project ${id.replace(/^chat-/, '')}`;
  }

  const record = {
    id,
    title,
    messages: msgs.map((m) => ({
      ...m,
      // For persistence and context, preserve rawContent if available so full code is saved in DB
      content: m.rawContent || m.content,
    })),
    model: activeModel.get(),
    provider: activeProvider.get(),
    createdAt: msgs[0]?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  // 1. Save to local IndexedDB
  await saveChat(record);

  // 2. Also save to disk via /api/local/projects so disk & DB are permanently unified
  try {
    fetch('/api/local/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: id,
        title,
        messages: record.messages,
        model: record.model,
        provider: record.provider,
      }),
    }).catch(() => {});
  } catch {}
}

export function loadMessagesIntoStore(messages: ChatMessage[]) {
  const parsedMessages: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const clean = parser.parse(m.id, m.content);
      parser.flush(m.id);
      parsedMessages.push({
        ...m,
        content: clean,
        rawContent: m.content,
      });
    } else {
      parsedMessages.push(m);
    }
  }
  chatMessages.set(parsedMessages);
}

export async function resetChat() {
  // CRITICAL: Auto-save current active project first so NO work is EVER lost!
  try {
    await persistCurrentChat();
  } catch (e) {
    console.warn('Auto-save prior project before reset:', e);
  }

  const newChatId = `chat-${Date.now()}`;
  currentChatId.set(newChatId);
  if (typeof window !== 'undefined') {
    localStorage.setItem('hedes_current_chat', newChatId);
  }
  chatMessages.set([]);
  artifactsStore.set({});
  isGenerating.set(false);
  chatInput.set('');
  parser.reset();
  actionRunner.actions.set({});

  const {
    files,
    activeFile,
    previewUrl,
    workspaceViewMode,
    activeProjectName,
    activeProjectDir,
  } = await import('~/stores/workspace');

  activeProjectName.set(newChatId);
  activeProjectDir.set(`projects/${newChatId}`);
  previewUrl.set(null);
  workspaceViewMode.set('code');

  // Right-side explorer is fully blank for the new project
  files.set({});
  activeFile.set(null);

  try {
    const res = await fetch('/api/local/project/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: newChatId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.projectDir) {
        activeProjectDir.set(data.projectDir);
      }
    }
  } catch (err) {
    console.error('Failed to initialize fresh project:', err);
  }
}

// Background auto-save interval: ensures ongoing work is continuously preserved
if (typeof window !== 'undefined') {
  setInterval(() => {
    persistCurrentChat().catch(() => {});
  }, 20000);
}

