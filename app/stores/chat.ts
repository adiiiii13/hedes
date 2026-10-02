import { atom, map, type MapStore } from 'nanostores';
import { StreamingMessageParser } from '~/engine/message-parser';
import { actionRunner, isBuilding } from './workspace';
import { saveChat } from '~/persistence/db';
import { activeModel, activeProvider } from './settings';
import type { BoltAction } from '~/types/actions';

export interface ActionItemState extends BoltAction {
  status: 'pending' | 'running' | 'complete' | 'failed' | 'interrupted' | 'awaiting-approval';
  error?: string;
  output?: string;
  cwd?: string;
  duration?: string;
  linesAdded?: number;
  linesRemoved?: number;
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

const initialChatId = typeof localStorage !== 'undefined' && localStorage.getItem('hedes_current_chat')
  ? (localStorage.getItem('hedes_current_chat') as string)
  : `chat-${Date.now()}`;

export const currentChatId = atom<string>(initialChatId);
export const chatMessages = atom<ChatMessage[]>([]);
export const isGenerating = atom<boolean>(false);
export const chatInput = atom<string>('');

export const saveStatus = atom<'saving' | 'saved' | 'error'>('saved');
export const projectRevision = atom<number>(1);
export const lastSaveError = atom<string | null>(null);

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
          output: '',
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

/**
 * Execution-Free Parser for loading past chat history.
 * Parses tags for visual rendering in Artifact cards without invoking actionRunner.runAction!
 */
export const staticHydrationParser = new StreamingMessageParser({
  callbacks: {
    onArtifactOpen(data) {
      const current = { ...artifactsStore.get() };
      const existing = current[data.messageId];
      current[data.messageId] = {
        id: data.id,
        title: data.title || 'Project Files',
        type: data.type,
        closed: true,
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
    },
    onActionOpen(data) {
      const current = { ...artifactsStore.get() };
      const art = current[data.messageId] || {
        id: data.artifactId,
        title: 'Project Files',
        closed: true,
        actions: {},
      };
      art.actions = {
        ...art.actions,
        [data.actionId]: {
          ...data.action,
          status: 'complete',
          output: '',
        },
      };
      current[data.messageId] = art;
      artifactsStore.set(current);
    },
    // Zero onActionClose callback to strictly prevent saved actions from executing during history restoration!
  },
});

actionRunner.getCurrentProjectId = () => currentChatId.get();

actionRunner.onActionOutput = (actionId, chunk, fullOutput) => {
  const current = { ...artifactsStore.get() };
  let changed = false;
  for (const [msgId, art] of Object.entries(current)) {
    if (art.actions && art.actions[actionId]) {
      art.actions[actionId] = {
        ...art.actions[actionId],
        output: fullOutput,
      };
      changed = true;
    }
  }
  if (changed) {
    artifactsStore.set(current);
  }
};

actionRunner.onActionComplete = (actionId, action) => {
  const current = { ...artifactsStore.get() };
  let changed = false;
  for (const [msgId, art] of Object.entries(current)) {
    if (art.actions && art.actions[actionId]) {
      art.actions[actionId] = {
        ...art.actions[actionId],
        status: 'complete',
        output: (action as any)?.output ?? art.actions[actionId].output,
        cwd: (action as any)?.cwd ?? art.actions[actionId].cwd,
        duration: (action as any)?.duration ?? art.actions[actionId].duration,
        linesAdded: (action as any)?.linesAdded ?? art.actions[actionId].linesAdded,
        linesRemoved: (action as any)?.linesRemoved ?? art.actions[actionId].linesRemoved,
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
        output: art.actions[actionId].output || errorMsg,
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

let historySaveQueue: Promise<void> = Promise.resolve();
const savedRevisions = new Map<string, number>();
export function persistCurrentChat() {
  const id = currentChatId.get();
  const msgs = chatMessages.get().map(message => ({ ...message }));
  const revision = projectRevision.get();
  const model = activeModel.get();
  const provider = activeProvider.get();
  historySaveQueue = historySaveQueue.catch(() => {}).then(() => persistChatSnapshot(id, msgs, savedRevisions.get(id) ?? revision, model, provider));
  return historySaveQueue;
}

async function persistChatSnapshot(id: string, msgs: ChatMessage[], expectedRevision: number, model: string, provider: string) {
  
  let allFiles: Record<string, string> = {};
  try {
    const { files } = await import('~/stores/workspace');
    if (currentChatId.get() === id) allFiles = files.get();
  } catch {}
  
  const fileKeys = Object.keys(allFiles);

  // If there are neither messages nor files, nothing to save
  if (msgs.length === 0 && fileKeys.length === 0) return;

  if (typeof window !== 'undefined' && currentChatId.get() === id) {
    localStorage.setItem('hedes_current_chat', id);
  }

  saveStatus.set('saving');

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
    model,
    provider,
    createdAt: msgs[0]?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  try {
    // 1. Host disk is AUTHORITATIVE. Save with revision tracking.
    const response = await fetch('/api/local/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: id,
        title,
        messages: record.messages,
        model: record.model,
        provider: record.provider,
        expectedRevision,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Disk history save failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (data.revision) {
      savedRevisions.set(id, data.revision);
      if (currentChatId.get() === id) projectRevision.set(data.revision);
      Object.assign(record, { revision: data.revision });
    }

    // 2. Also save to local IndexedDB cache, but catch errors so IndexedDB never blocks disk persistence
    try {
      await saveChat(record);
    } catch (idbErr) {
      console.warn('IndexedDB cache update failed, disk copy preserved:', idbErr);
    }

    saveStatus.set('saved');
    lastSaveError.set(null);
  } catch (err: any) {
    console.error('Failed to persist project history:', err);
    saveStatus.set('error');
    lastSaveError.set(err.message || 'Save failed');
  }
}

export function loadMessagesIntoStore(messages: ChatMessage[]) {
  const parsedMessages: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const clean = staticHydrationParser.parse(m.id, m.content);
      staticHydrationParser.flush(m.id);
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

export async function resetChat(options?: { initialize?: boolean; chatId?: string }) {
  // CRITICAL: Auto-save current active project first so NO work is EVER lost!
  try {
    await persistCurrentChat();
  } catch (e) {
    console.warn('Auto-save prior project before reset:', e);
  }

  const newChatId = options?.chatId || `chat-${Date.now()}`;
  currentChatId.set(newChatId);
  projectRevision.set(1);
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

  if (options?.initialize === false) return;

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
  let persistenceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastPersistedPayload = '';

  chatMessages.subscribe((msgs) => {
    if (persistenceTimer) clearTimeout(persistenceTimer);
    persistenceTimer = setTimeout(() => {
      const currentPayload = JSON.stringify({ id: currentChatId.get(), count: msgs.length, last: msgs[msgs.length - 1]?.content });
      if (currentPayload !== lastPersistedPayload) {
        void persistCurrentChat().then(() => { if (saveStatus.get() === 'saved') lastPersistedPayload = currentPayload; });
      }
    }, 1200);
  });

  setInterval(() => {
    const msgs = chatMessages.get();
    const currentPayload = JSON.stringify({ id: currentChatId.get(), count: msgs.length, last: msgs[msgs.length - 1]?.content });
    if (currentPayload !== lastPersistedPayload) {
      void persistCurrentChat().then(() => { if (saveStatus.get() === 'saved') lastPersistedPayload = currentPayload; });
    }
  }, 20000);
}


/**
 * Run a command directly in the chat terminal stream (Antigravity-style)
 */
export function runInChatTerminal(command: string, isSystemMode = false, customCwd?: string) {
  const trimmed = command.trim();
  if (!trimmed) return;

  const actionId = 'cmd-' + Date.now();
  const userMsgId = 'usr-' + Date.now();
  const asstMsgId = 'asst-' + (Date.now() + 1);
  const actionType = isSystemMode ? 'terminal' : 'shell';

  const userMsg: ChatMessage = {
    id: userMsgId,
    role: 'user',
    content: isSystemMode ? `⚡ ${trimmed}` : `❯ ${trimmed}`,
    createdAt: Date.now(),
  };

  const asstMsg: ChatMessage = {
    id: asstMsgId,
    role: 'assistant',
    content: `<div class="\__boltArtifact\__" data-message-id="${asstMsgId}"></div>`,
    createdAt: Date.now() + 1,
  };

  const current = { ...artifactsStore.get() };
  current[asstMsgId] = {
    id: 'art-' + Date.now(),
    title: isSystemMode ? 'System Command' : 'Terminal Execution',
    type: 'bundled',
    closed: false,
    actions: {
      [actionId]: {
        id: actionId,
        type: actionType,
        content: trimmed,
        filePath: customCwd,
        status: 'running',
        output: '',
        cwd: customCwd || (isSystemMode ? 'System' : ('projects/' + currentChatId.get())),
      },
    },
  };
  artifactsStore.set(current);

  chatMessages.set([...chatMessages.get(), userMsg, asstMsg]);

  // Run the action
  const act: BoltAction = {
    id: actionId,
    type: actionType,
    content: trimmed,
    filePath: customCwd,
    status: 'running',
  };
  actionRunner.addAction(act);
  actionRunner.runAction(act);
}
