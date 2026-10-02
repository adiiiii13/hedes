import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { isDev } from '../utils/constants';
import { store } from '../utils/store';

export function createWindow(rendererURL: string) {
  console.log('Creating window with URL:', rendererURL);

  const bounds = store.get('bounds');
  console.log('restored bounds:', bounds);

  const parsedRendererUrl = new URL(rendererURL);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    ...bounds,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : { color: '#0b0d14', symbolColor: '#e5e7eb', height: 36 },
    backgroundColor: '#0b0d14',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'build', 'electron', 'preload', 'index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      nodeIntegrationInSubFrames: false,
    },
  });
  win.setMenuBarVisibility(false);

  // Security: Block unexpected new windows; open verified external http/https links in OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        if (parsed.origin !== parsedRendererUrl.origin) {
          void shell.openExternal(url);
        }
      }
    } catch {}
    return { action: 'deny' };
  });

  // Security: Prevent unexpected top-level navigation away from the app
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.origin !== parsedRendererUrl.origin) {
        event.preventDefault();
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          void shell.openExternal(navigationUrl);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  console.log('Window created, loading URL...');
  win.loadURL(rendererURL).catch((err) => {
    console.log('Failed to load URL:', err);
  });

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.log('Failed to load:', errorCode, errorDescription);
  });

  win.webContents.on('did-finish-load', () => {
    console.log('Window finished loading');
    win.show();
    win.focus();
  });

  // Open DevTools only when explicitly requested during development.
  if (isDev && process.env.HEDES_OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools();
  }

  const boundsListener = () => {
    const bounds = win.getBounds();
    store.set('bounds', bounds);
  };
  win.on('moved', boundsListener);
  win.on('resized', boundsListener);

  return win;
}
