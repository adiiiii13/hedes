import logger from 'electron-log';
import type { MessageBoxOptions } from 'electron';
import { app, dialog } from 'electron';
import type { AppUpdater, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import * as electronUpdater from 'electron-updater';
import { isDev } from './constants';

const autoUpdater: AppUpdater = (electronUpdater as any).default.autoUpdater;

export interface UpdaterState {
  status:
    | 'unconfigured'
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'downloading'
    | 'ready-to-install'
    | 'failed';
  currentVersion: string;
  availableVersion?: string;
  progressPercent?: number;
  lastChecked?: number;
  error?: string;
}

const currentState: UpdaterState = {
  status: 'unconfigured',
  currentVersion: app.getVersion() || '1.0.0',
};

export function getUpdaterState(): UpdaterState {
  return { ...currentState };
}

export async function setupAutoUpdater() {
  logger.transports.file.level = 'debug';
  autoUpdater.logger = logger;
  // Unsigned development packages must not trust an update feed without a publisher identity.
  if (process.platform === 'win32' && app.isPackaged) {
    try {
      const target = process.execPath.replace(/'/g, "''");
      const command = `(Get-AuthenticodeSignature -LiteralPath '${target}').Status.ToString()`;
      const result = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
      if (result.stdout.trim() !== 'Valid') {
        currentState.status = 'unconfigured';
        currentState.error = 'Automatic updates require a signed release build.';
        return;
      }
    } catch {
      currentState.status = 'unconfigured';
      currentState.error = 'Could not verify the installed publisher signature.';
      return;
    }
  }

  const resourcePath = isDev
    ? path.join(process.cwd(), 'electron-update.yml')
    : path.join(process.resourcesPath, 'app-update.yml');

  if (!existsSync(resourcePath)) {
    currentState.status = 'unconfigured';
    logger.info('Auto-update unconfigured: no update configuration is bundled.');
    return;
  }

  currentState.status = 'up-to-date';
  autoUpdater.updateConfigPath = resourcePath;

  // Strict user consent: do not auto-download or auto-install on app quit behind user's back
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    currentState.status = 'checking';
    currentState.lastChecked = Date.now();
    logger.info('checking-for-update...');
  });

  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    currentState.status = 'available';
    currentState.availableVersion = info.version;
    logger.info('Update available:', info);

    const dialogOpts: MessageBoxOptions = {
      type: 'info' as const,
      buttons: ['Download Update', 'Later'],
      title: 'Hedes Studio Update Available',
      message: `Hedes Studio v${info.version} is available.`,
      detail: 'A new release is available. Would you like to download it now?',
    };

    const response = await dialog.showMessageBox(dialogOpts);
    if (response.response === 0) {
      currentState.status = 'downloading';
      currentState.progressPercent = 0;
      autoUpdater.downloadUpdate().catch((err) => {
        currentState.status = 'failed';
        currentState.error = err.message;
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    currentState.status = 'up-to-date';
    logger.info('Update not available: current version is up to date.');
  });

  autoUpdater.on('error', (err) => {
    currentState.status = 'failed';
    currentState.error = err.message;
    logger.error('Error in auto-updater:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    currentState.status = 'downloading';
    currentState.progressPercent = Math.round(progressObj.percent);
    logger.info('Download progress:', progressObj.percent);
  });

  autoUpdater.on('update-downloaded', async (event: UpdateDownloadedEvent) => {
    currentState.status = 'ready-to-install';
    logger.info('Update downloaded:', formatUpdateDownloadedEvent(event));

    const dialogOpts: MessageBoxOptions = {
      type: 'info' as const,
      buttons: ['Restart Now', 'Later'],
      title: 'Hedes Studio Update Ready',
      message: 'Update Downloaded',
      detail: 'The update has been verified and downloaded. Restart Hedes Studio to apply the update.',
    };

    const response = await dialog.showMessageBox(dialogOpts);
    if (response.response === 0) {
      autoUpdater.quitAndInstall(false);
    }
  });

  // Safe initial check
  try {
    logger.info('Checking for updates. Current version:', app.getVersion());
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    currentState.status = 'failed';
    currentState.error = err.message;
    logger.warn('Failed initial update check:', err);
  }

  // Periodic update check every 6 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((err) => {
        logger.warn('Periodic update check failed:', err);
      });
    },
    6 * 60 * 60 * 1000,
  );
}

export async function manualCheckForUpdates(): Promise<UpdaterState> {
  if (currentState.status === 'unconfigured') {
    return currentState;
  }
  try {
    currentState.status = 'checking';
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    currentState.status = 'failed';
    currentState.error = err.message;
  }
  return currentState;
}

function formatUpdateDownloadedEvent(event: UpdateDownloadedEvent): string {
  return JSON.stringify({
    version: event.version,
    downloadedFile: event.downloadedFile,
    files: event.files.map((e) => ({ files: { url: e.url, size: e.size } })),
  });
}
