import { createRequestHandler } from 'react-router';
import electron, { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron';
import log from 'electron-log';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as pkg from '../../package.json';
import { setupAutoUpdater, getUpdaterState, manualCheckForUpdates } from './utils/auto-update';
import { isDev, DEFAULT_PORT } from './utils/constants';
import { initViteServer, viteServer } from './utils/vite-server';
import { setupMenu } from './ui/menu';
import { createWindow } from './ui/window';
import { initCookies, storeCookies } from './utils/cookie';
import { loadServerBuild, serveAsset } from './utils/serve';
import { reloadOnChange } from './utils/reload';
import { registerVoiceIpc } from './voice';
import { getStoragePaths, runStorageMigration } from '../../app/utils/runtime.server';
import { getServerSessionToken } from '../../app/utils/session-auth.server';
import { resumeScheduledTasks } from '../../app/utils/task-queue.server';

Object.assign(console, log.functions);

console.debug('main: import.meta.env:', import.meta.env);
console.log('main: isDev:', isDev);
console.log('NODE_ENV:', global.process.env.NODE_ENV);
console.log('isPackaged:', app.isPackaged);

// Log unhandled errors
process.on('uncaughtException', async (error) => {
  console.log('Uncaught Exception:', error);
});

process.on('unhandledRejection', async (error) => {
  console.log('Unhandled Rejection:', error);
});

(() => {
  const root = global.process.env.APP_PATH_ROOT ?? import.meta.env.VITE_APP_PATH_ROOT;

  if (root === undefined) {
    console.log('no given APP_PATH_ROOT or VITE_APP_PATH_ROOT. default path is used.');
    return;
  }

  if (!path.isAbsolute(root)) {
    console.log('APP_PATH_ROOT must be absolute path.');
    global.process.exit(1);
  }

  console.log(`APP_PATH_ROOT: ${root}`);

  const subdirName = pkg.name;

  for (const [key, val] of [
    ['appData', ''],
    ['userData', subdirName],
    ['sessionData', subdirName],
  ] as const) {
    app.setPath(key, path.join(root, val));
  }

  app.setAppLogsPath(path.join(root, subdirName, 'Logs'));
})();

console.log('appPath:', app.getAppPath());

const keys: Parameters<typeof app.getPath>[number][] = ['home', 'appData', 'userData', 'sessionData', 'logs', 'temp'];
keys.forEach((key) => console.log(`${key}:`, app.getPath(key)));
console.log('start whenReady');

declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/naming-convention
  var __electron__: typeof electron;
}

let schedulerTimer: NodeJS.Timeout | undefined;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  console.log('Another instance of Hedes Studio is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const win = windows[0];
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  (async () => {
    await app.whenReady();
  console.log('App is ready');
  const userDataDir = app.getPath('userData');
  global.process.env.HEDES_USER_DATA_DIR = userDataDir;
  global.process.env.HEDES_APP_PATH = app.getAppPath();
  global.process.env.HEDES_RUNTIME = 'windows-desktop';
  const storage = getStoragePaths(userDataDir);
  const durableProjectsDir = storage.projects;
  global.process.env.HEDES_PROJECTS_DIR = durableProjectsDir;

  try {
    const migration = await runStorageMigration(storage);
    console.log('Storage migration completed. Migrated records:', migration.records.length);
  } catch (migErr) {
    console.error('Storage migration failed:', migErr);
  }

  // Automatic background task scheduler loop (checks every 30s)
  try {
    void resumeScheduledTasks().catch((err) => console.warn('Initial scheduler resume warning:', err));
  } catch {}
  schedulerTimer = setInterval(() => {
    void resumeScheduledTasks().catch((err) => console.warn('Background scheduler tick warning:', err));
  }, 30000);

  // Restrict permissions: Only allow microphone to the main application frame on loopback
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = details.requestingUrl || webContents.getURL();
    try {
      const parsed = new URL(url);
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      const isAppPort = parsed.port === `${DEFAULT_PORT}` || parsed.port === '5174';
      const isMainFrame = webContents.mainFrame?.url === url;

      if (isLoopback && isAppPort && isMainFrame && permission === 'media') {
        return callback(true);
      }
    } catch {}
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    try {
      const parsed = new URL(requestingOrigin);
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      const isAppPort = parsed.port === `${DEFAULT_PORT}` || parsed.port === '5174';
      if (isLoopback && isAppPort && permission === 'media') {
        return true;
      }
    } catch {}
    return false;
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    try {
      const parsed = new URL(details.url);
      const isAppOrigin =
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
        (parsed.port === `${DEFAULT_PORT}` || parsed.port === '5174');

      if (isAppOrigin) {
        const responseHeaders = { ...details.responseHeaders };
        responseHeaders['X-Frame-Options'] = ['SAMEORIGIN'];
        responseHeaders['X-Content-Type-Options'] = ['nosniff'];
        responseHeaders['Content-Security-Policy'] = [
          "default-src 'self' http://localhost:* http://127.0.0.1:*; " +
          "script-src 'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:*; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "img-src 'self' data: blob: https:; " +
          "connect-src 'self' https: ws: wss: http://localhost:* http://127.0.0.1:*; " +
          "frame-src 'self' http://localhost:* http://127.0.0.1:* https:; " +
          "object-src 'none'; " +
          "base-uri 'self';"
        ];
        return callback({ responseHeaders });
      }
    } catch {}
    callback({ responseHeaders: details.responseHeaders });
  });

  // Load any existing cookies from ElectronStore, set as cookie
  await initCookies();

  const serverBuild = await loadServerBuild();

  protocol.handle('http', async (req) => {
    console.log('Handling request for:', req.url);

    if (isDev) {
      console.log('Dev mode: forwarding to vite server');
      return await fetch(req);
    }

    req.headers.append('Referer', req.referrer);

    try {
      const url = new URL(req.url);

      // Forward requests to specific local server ports
      if (url.hostname !== 'localhost' || url.port !== `${DEFAULT_PORT}`) {
        console.log('Forwarding request to local server:', req.url);
        return await fetch(req);
      }

      // Always try to serve asset first
      const unpackedClientPath = path.join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'), 'build', 'client');
      const defaultClientPath = path.join(app.getAppPath(), 'build', 'client');
      const assetPath = (await fs.stat(unpackedClientPath).catch(() => null)) ? unpackedClientPath : defaultClientPath;
      const res = await serveAsset(req, assetPath);

      if (res) {
        console.log('Served asset:', req.url);
        return res;
      }

      // Forward all cookies to remix server
      const cookies = await session.defaultSession.cookies.get({});

      if (cookies.length > 0) {
        req.headers.set('Cookie', cookies.map((c) => `${c.name}=${c.value}`).join('; '));

        // Store all cookies
        await storeCookies(cookies);
      }

      // Ensure server build is valid
      const build = serverBuild ?? (await loadServerBuild());
      if (!build || !build.routes) {
        throw new Error('Remix server build failed to load or has no routes. Check logs.');
      }

      // Create request handler with the server build
      const handler = createRequestHandler(build, 'production');
      console.log('Handling request with server build:', req.url);

      const result = await handler(req, {
        /*
         * Remix app access cloudflare.env
         * Need to pass an empty object to prevent undefined
         */
        // @ts-ignore:next-line
        cloudflare: {},
      });

      return result;
    } catch (err) {
      console.log('Error handling request:', {
        url: req.url,
        error:
          err instanceof Error
            ? {
                message: err.message,
                stack: err.stack,
                cause: err.cause,
              }
            : err,
      });

      const error = err instanceof Error ? err : new Error(String(err));

      return new Response(`Error handling request to ${req.url}: ${error.stack ?? error.message}`, {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      });
    }
  });

  const rendererURL = await (isDev
    ? (async () => {
        await initViteServer();

        if (!viteServer) {
          throw new Error('Vite server is not initialized');
        }

        const listen = await viteServer.listen();
        global.__electron__ = electron;
        viteServer.printUrls();

        return `http://localhost:${listen.config.server.port}`;
      })()
    : `http://localhost:${DEFAULT_PORT}`);

  console.log('Using renderer URL:', rendererURL);
  registerVoiceIpc(rendererURL);

  const win = await createWindow(rendererURL);

  function validateTrustedIpcSender(event: Electron.IpcMainInvokeEvent): BrowserWindow {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    if (!sourceWindow) throw new Error('Desktop window required');
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error('IPC invocation from subframes is forbidden');
    }
    try {
      const parsed = new URL(event.senderFrame.url);
      if (parsed.origin !== new URL(rendererURL).origin) {
        throw new Error('Unauthorized IPC origin');
      }
    } catch {
      throw new Error('Invalid IPC sender frame');
    }
    return sourceWindow;
  }

  ipcMain.handle('desktop:getSessionToken', (event) => {
    validateTrustedIpcSender(event);
    return getServerSessionToken();
  });

  ipcMain.handle('desktop:getUpdaterStatus', (event) => {
    validateTrustedIpcSender(event);
    return getUpdaterState();
  });

  ipcMain.handle('desktop:checkForUpdates', async (event) => {
    validateTrustedIpcSender(event);
    return await manualCheckForUpdates();
  });

  ipcMain.handle('desktop:importFolder', async (event) => {
    const sourceWindow = validateTrustedIpcSender(event);
    const selected = await dialog.showOpenDialog(sourceWindow, { properties: ['openDirectory'] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const source = await fs.realpath(selected.filePaths[0]);
    const projectsBase = durableProjectsDir;
    if (projectsBase === source || projectsBase.startsWith(source + path.sep)) throw new Error('Choose a folder outside the Hedes projects directory');
    const projectId = `chat-${Date.now()}`;
    const destination = path.join(projectsBase, projectId);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.cp(source, destination, {
        recursive: true,
        filter: async (filePath) => {
          const name = path.basename(filePath);
          if (filePath !== source && ['node_modules', 'dist', 'build', '.next', '.vite'].includes(name)) return false;
          return !(await fs.lstat(filePath)).isSymbolicLink();
        },
      });
      const title = path.basename(source);
      const now = Date.now();
      await fs.writeFile(path.join(destination, '.hedes_project.json'), JSON.stringify({ id: projectId, title, messages: [], createdAt: now, updatedAt: now }, null, 2));
      return { projectId, title };
    } catch (error) {
      await fs.rm(destination, { recursive: true, force: true });
      throw error;
    }
  });

  ipcMain.handle('desktop:openProjectLocation', async (event, projectId: unknown) => {
    validateTrustedIpcSender(event);
    if (typeof projectId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(projectId)) throw new Error('Invalid project ID');
    const directory = path.join(durableProjectsDir, projectId);
    if (!(await fs.stat(directory).catch(() => null))?.isDirectory()) throw new Error('Project folder does not exist');
    return shell.openPath(directory);
  });

  ipcMain.handle('desktop:openInVsCode', async (event, projectId: unknown) => {
    validateTrustedIpcSender(event);
    if (typeof projectId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(projectId)) throw new Error('Invalid project ID');
    const directory = path.join(durableProjectsDir, projectId);
    if (!(await fs.stat(directory).catch(() => null))?.isDirectory()) throw new Error('Project folder does not exist');
    await shell.openExternal(`vscode://file/${encodeURI(directory.replace(/\\/g, '/'))}`);
    return 'Opened VS Code. If it did not launch, install official VS Code and register its URL handler.';
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow(rendererURL);
    }
  });

  console.log('end whenReady');

  return win;
})()
  .then((win) => {
    // IPC samples : send and recieve.
    let count = 0;
    setInterval(() => win.webContents.send('ping', `hello from main! ${count++}`), 60 * 1000);
    ipcMain.handle('ipcTest', (event, ...args) => console.log('ipc: renderer -> main', { event, ...args }));

    return win;
  })
  .then((win) => setupMenu(win));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  (globalThis as typeof globalThis & { __hedesStopWebsites?: () => void }).__hedesStopWebsites?.();
});

if (isDev) {
  reloadOnChange();
}
setupAutoUpdater();
