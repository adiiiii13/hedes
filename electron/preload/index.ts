import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron';

console.debug('start preload.', ipcRenderer);

export interface HedesDesktopBridge {
  getSessionToken: () => Promise<string>;
  getUpdaterStatus: () => Promise<{ status: string; currentVersion: string; availableVersion?: string; progressPercent?: number; error?: string }>;
  checkForUpdates: () => Promise<{ status: string; currentVersion: string; availableVersion?: string; progressPercent?: number; error?: string }>;
  importFolder: () => Promise<{ projectId: string; title: string } | null>;
  openProjectLocation: (projectId: string) => Promise<string>;
  openInVsCode: (projectId: string) => Promise<string>;
  voiceRecognize: () => Promise<string>;
  voiceSpeak: (text: string) => Promise<string>;
  voiceStop: () => Promise<void>;
}

const hedesDesktop: HedesDesktopBridge = {
  getSessionToken: () => ipcRenderer.invoke('desktop:getSessionToken'),
  getUpdaterStatus: () => ipcRenderer.invoke('desktop:getUpdaterStatus'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:checkForUpdates'),
  importFolder: () => ipcRenderer.invoke('desktop:importFolder'),
  openProjectLocation: (projectId: string) => {
    if (typeof projectId !== 'string') throw new Error('Invalid project ID');
    return ipcRenderer.invoke('desktop:openProjectLocation', projectId);
  },
  openInVsCode: (projectId: string) => {
    if (typeof projectId !== 'string') throw new Error('Invalid project ID');
    return ipcRenderer.invoke('desktop:openInVsCode', projectId);
  },
  voiceRecognize: () => ipcRenderer.invoke('desktop:voiceRecognize'),
  voiceSpeak: (text: string) => {
    if (typeof text !== 'string') throw new Error('Text must be a string');
    return ipcRenderer.invoke('desktop:voiceSpeak', text.slice(0, 10000));
  },
  voiceStop: () => ipcRenderer.invoke('desktop:voiceStop'),
};

contextBridge.exposeInMainWorld('hedesDesktop', hedesDesktop);
