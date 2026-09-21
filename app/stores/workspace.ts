import { atom, map } from 'nanostores';
import { WORK_DIR_NAME } from '~/utils/constants';
import { ActionRunner } from '~/engine/action-runner';
import { TerminalStore } from '~/stores/terminal';

export const isWebContainerLoaded = atom<boolean>(true); // We are using local now
export const files = map<Record<string, string>>({});
export const activeFile = atom<string | null>(null);
export const previewUrl = atom<string | null>(null);
export const expoUrlAtom = atom<string | undefined>(undefined);
export const isFileDrawerOpen = atom<boolean>(false);
export const isTerminalOpen = atom<boolean>(false);
export const isBuilding = atom<boolean>(false);
export const workspaceViewMode = atom<'code' | 'preview' | 'split' | 'terminal'>('code');
export const terminalErrorAtom = atom<string | null>(null);
export const activeProjectName = atom<string | null>(null);
export const activeProjectDir = atom<string | null>(null);

export const terminalStore = new TerminalStore();

export const actionRunner = new ActionRunner(
  () => terminalStore.boltTerminal
);

actionRunner.onPreviewUrl = (url: string) => {
  previewUrl.set(url);
  workspaceViewMode.set('preview');
};

actionRunner.onActionError = (actionId: string, errorMsg: string) => {
  terminalErrorAtom.set(`[Terminal Error - Action ${actionId}]:\n${errorMsg}\n\nPlease analyze this error and fix the code.`);
};

actionRunner.onFileChange = (filePath: string, content: string) => {
  files.setKey(filePath, content);
  if (!activeFile.get()) {
    activeFile.set(filePath);
  }
};

export function selectFile(filePath: string) {
  activeFile.set(filePath);
}

export async function loadProjectFiles(chatId?: string) {
  try {
    let idToQuery = chatId;
    if (!idToQuery) {
      try {
        const { currentChatId } = await import('~/stores/chat');
        const active = currentChatId.get();
        if (active) idToQuery = active;
      } catch {}
    }
    if (!idToQuery && typeof window !== 'undefined') {
      idToQuery = localStorage.getItem('hedes_current_chat') || undefined;
    }

    const response = await fetch(`/api/local/fs?chatId=${idToQuery || 'latest'}`);
    if (response.ok) {
      const data = await response.json();
      const loadedFiles = data.files || {};
      files.set(loadedFiles);

      // Synchronize project directory and currentChatId
      if (data.resolvedChatId) {
        activeProjectName.set(data.resolvedChatId);
        import('~/stores/chat').then(({ currentChatId }) => {
          if (currentChatId.get() !== data.resolvedChatId) {
            currentChatId.set(data.resolvedChatId);
          }
          if (typeof window !== 'undefined') {
            localStorage.setItem('hedes_current_chat', data.resolvedChatId);
          }
        });
      }
      if (data.projectDir) {
        activeProjectDir.set(data.projectDir);
      }

      const filePaths = Object.keys(loadedFiles);
      if (filePaths.length > 0) {
        if (!activeFile.get()) {
          const defaultFile = filePaths.find((f) => f.includes('App.') || f.includes('index.html')) || filePaths[0];
          activeFile.set(defaultFile);
        }
      } else {
        activeFile.set(null);
      }
    }
  } catch (err) {
    console.error('Failed to load project files', err);
  }
}

export function updateFileContent(filePath: string, content: string) {
  files.setKey(filePath, content);
  import('~/stores/chat').then(({ currentChatId, persistCurrentChat }) => {
    fetch('/api/local/fs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChatId.get(),
        filePath,
        content,
      }),
    })
      .then(() => {
        // Automatically save project in history whenever files are modified
        persistCurrentChat().catch(() => {});
      })
      .catch(console.error);
  });
}

export function toggleFileDrawer() {
  isFileDrawerOpen.set(!isFileDrawerOpen.get());
}

export function toggleTerminal() {
  isTerminalOpen.set(!isTerminalOpen.get());
}
