import { map, type MapStore } from 'nanostores';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import type { ITerminal } from '~/types/terminal';

const logger = createScopedLogger('ActionRunner');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'failed' | 'interrupted' | 'awaiting-approval';

export interface ActionState extends BoltAction {
  status: ActionStatus;
  error?: string;
  output?: string;
  cwd?: string;
  duration?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

function computePayloadHash(projectId: string, actionId: string, content: string): string {
  let hash = 0;
  const str = `${projectId}:${actionId}:${content}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export class ActionRunner {
  #fileQueue: Promise<void> = Promise.resolve();
  #shellQueue: Promise<void> = Promise.resolve();
  #terminal: () => ITerminal | undefined;
  
  actions: MapStore<Record<string, ActionState>> = map({});
  getCurrentProjectId?: () => string | undefined;
  onRefreshFiles?: (projectId: string) => Promise<void> | void;
  onExpoUrl?: (url: string) => void;
  onPreviewUrl?: (url: string) => void;
  onFileChange?: (filePath: string, content: string) => void;
  onActionComplete?: (actionId: string, action: BoltAction) => void;
  onActionError?: (actionId: string, errorMsg: string) => void;
  /** Real-time streaming output callback for in-chat terminal cards */
  onActionOutput?: (actionId: string, chunk: string, fullOutput: string) => void;
  /** Called when a file is deleted so UI can remove it from workspace */
  onFileDelete?: (filePath: string) => void;

  constructor(getTerminal: () => ITerminal | undefined) {
    this.#terminal = getTerminal;
  }

  #getProjectId(action?: BoltAction): string {
    return action?.projectId || this.getCurrentProjectId?.() || '';
  }

  addAction(action: BoltAction) {
    const targetProjectId = this.#getProjectId(action);
    action.projectId = targetProjectId;
    action.runId = action.runId || ('run-' + Date.now());
    action.payloadHash = action.payloadHash || computePayloadHash(targetProjectId, action.id, action.content);

    this.actions.setKey(action.id, {
      ...action,
      status: action.status || 'pending',
    });
  }

  runAction(action: BoltAction, approved = false): Promise<void> {
    const targetProjectId = this.#getProjectId(action);
    action.projectId = targetProjectId;
    action.runId = action.runId || ('run-' + Date.now());
    action.payloadHash = action.payloadHash || computePayloadHash(targetProjectId, action.id, action.content);

    const existing = this.actions.get()[action.id];
    if (existing?.status === 'complete') {
      logger.info(`Action ${action.id} already completed, skipping duplicate execution.`);
      return Promise.resolve();
    }
    // Generated commands and deletions require an explicit click on their exact payload.
    if (action.type !== 'file' && !approved) {
      this.actions.setKey(action.id, { ...action, status: 'awaiting-approval' });
      return Promise.resolve();
    }
    if (approved && (!existing || existing.status !== 'awaiting-approval' || existing.content !== action.content || existing.projectId !== action.projectId || existing.filePath !== action.filePath || existing.type !== action.type || existing.runId !== action.runId)) {
      return Promise.reject(new Error('Action changed since approval; review the current command'));
    }

    this.actions.setKey(action.id, {
      ...action,
      status: 'running',
    });

    if (action.type === 'file') {
      this.#fileQueue = this.#fileQueue
        .then(async () => {
          logger.info(`Running file action ${action.id} (${action.filePath}) on project ${action.projectId}`);
          await this.#executeFileAction(action);
          this.actions.setKey(action.id, { ...action, status: 'complete' });
          this.onActionComplete?.(action.id, action);
          logger.info(`File ${action.filePath} written and completed`);
        })
        .catch((err) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Action ${action.id} (${action.filePath}) failed:`, errorMsg);
          this.actions.setKey(action.id, {
            ...action,
            status: 'failed',
            error: errorMsg,
          });
          this.onActionError?.(action.id, errorMsg);
        });

      return this.#fileQueue;
    } else if (action.type === 'delete') {
      // ── DELETE action: removes files/folders from the project ──────────────
      this.#fileQueue = this.#fileQueue
        .then(async () => {
          logger.info(`Running delete action ${action.id} (${action.filePath || action.content}) on project ${action.projectId}`);
          await this.#executeDeleteAction(action);
          this.actions.setKey(action.id, { ...action, status: 'complete' });
          this.onActionComplete?.(action.id, action);
          logger.info(`Delete action ${action.id} completed`);
        })
        .catch((err) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Delete action ${action.id} failed:`, errorMsg);
          this.actions.setKey(action.id, {
            ...action,
            status: 'failed',
            error: errorMsg,
          });
          this.onActionError?.(action.id, errorMsg);
        });

      return this.#fileQueue;
    } else {
      // shell, start, terminal — chained after file queue to guarantee file writes commit before dependent commands run!
      this.#shellQueue = Promise.all([this.#shellQueue, this.#fileQueue])
        .then(async () => {
          logger.info(`Running shell action ${action.id} (${action.type}) on project ${action.projectId}`);
          await this.#executeShellAction(action);
          this.actions.setKey(action.id, { ...action, status: 'complete' });
          this.onActionComplete?.(action.id, action);
          logger.info(`Shell action ${action.id} completed`);
        })
        .catch((err) => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Shell action ${action.id} failed:`, errorMsg);
          this.actions.setKey(action.id, {
            ...action,
            status: 'failed',
            error: errorMsg,
          });
          this.onActionError?.(action.id, errorMsg);
        });

      return this.#shellQueue;
    }
  }

  async waitForIdle(): Promise<void> {
    await Promise.all([this.#fileQueue, this.#shellQueue]);
  }

  async #executeFileAction(action: BoltAction) {
    if (!action.filePath) return;
    
    const projectId = this.#getProjectId(action);
    const lines = (action.content || '').split('\n').length;
    (action as any).linesAdded = lines;
    (action as any).linesRemoved = 0;
    
    const response = await fetch('/api/local/fs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: projectId,
        filePath: action.filePath,
        content: action.content,
        runId: action.runId,
        actionId: action.id,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to write file: ${await response.text()}`);
    }

    const data = await response.json();
    const cleanPath = data.cleanPath || action.filePath.replace(/^\/+/, '');
    
    // Update active memory files store immediately if viewing this project
    if (this.#getProjectId() === projectId) {
      this.onFileChange?.(cleanPath, action.content);
      this.onRefreshFiles?.(projectId);
    }
  }

  /**
   * DELETE action: removes a file or folder from the project.
   */
  async #executeDeleteAction(action: BoltAction) {
    const targetPath = action.filePath || action.content.trim();
    if (!targetPath) {
      throw new Error('No file path specified for delete action');
    }

    const projectId = this.#getProjectId(action);
    const terminal = this.#terminal();

    if (terminal) {
      terminal.write(`\r\n\x1b[31m🗑 Deleting: ${targetPath}\x1b[0m\r\n`);
    }

    const response = await fetch('/api/local/fs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: projectId,
        filePath: targetPath,
        type: 'delete',
        runId: action.runId,
        actionId: action.id,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (terminal) {
        terminal.write(`\x1b[31m✗ Delete failed: ${errText}\x1b[0m\r\n`);
      }
      throw new Error(`Failed to delete: ${errText}`);
    }

    if (terminal) {
      terminal.write(`\x1b[32m✓ Deleted: ${targetPath}\x1b[0m\r\n`);
    }

    (action as any).output = `Deleted ${targetPath}`;

    if (this.#getProjectId() === projectId) {
      this.onFileDelete?.(targetPath.replace(/^\/+/, ''));
      this.onRefreshFiles?.(projectId);
    }
  }

  async #executeShellAction(action: BoltAction): Promise<void> {
    const command = action.content.trim();
    if (!command) return;

    const projectId = this.#getProjectId(action);
    const isSystemMode = action.type === 'terminal';
    const startTime = Date.now();
    let accumulatedOutput = '';

    logger.info(`Spawning ${isSystemMode ? 'system' : 'project'} shell command: ${command} on ${projectId}`);
    
    const terminal = this.#terminal();
    if (terminal) {
      const prefix = isSystemMode ? '\x1b[35m⚡' : '\x1b[32m❯';
      terminal.write(`\r\n${prefix} ${command}\x1b[0m\r\n`);
    }

    const cwdDisplay = isSystemMode ? (action.filePath || 'System') : `projects/${projectId}`;
    (action as any).cwd = cwdDisplay;
    
    const response = await fetch('/api/local/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: projectId,
        command,
        runId: action.runId,
        actionId: action.id,
        systemMode: isSystemMode,
        cwd: isSystemMode ? (action.filePath || undefined) : undefined,
      }),
    });

    if (!response.ok) throw new Error(`Shell request failed: ${await response.text()}`);

    if (!response.body) {
      throw new Error('No response body from shell execution');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lineBuffer = '';

    const expoUrlRegex = /(exp:\/\/[^\s]+)/;
    const localhostRegex = /http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/;
    const viteLocalRegex = /Local:\s+(http:\/\/(?:localhost|127\.0\.0\.1):\d+\/)/;

    const isStartOrDev =
      action.type === 'start' ||
      /(?:^|\s)(?:dev|start|vite)(?:\s|$)/i.test(command);

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const finishSuccess = () => {
        if (!resolved) {
          resolved = true;
          const durationMs = Date.now() - startTime;
          const duration = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
          (action as any).duration = duration;
          (action as any).output = accumulatedOutput || 'Done (no output)';
          this.actions.setKey(action.id, {
            ...this.actions.get()[action.id],
            duration,
            output: (action as any).output,
          });
          resolve();
        }
      };

      const finishError = (err: Error) => {
        if (!resolved) {
          resolved = true;
          const durationMs = Date.now() - startTime;
          const duration = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
          (action as any).duration = duration;
          (action as any).output = accumulatedOutput || err.message;
          this.actions.setKey(action.id, {
            ...this.actions.get()[action.id],
            duration,
            output: (action as any).output,
            error: err.message,
          });
          reject(err);
        }
      };

      // Background stream reader loop: continues for the full lifetime of the process
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              finishSuccess();
              break;
            }

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              let payload: { type: string; data: string };
              try { payload = JSON.parse(line); } catch { continue; }

                if (payload.type === 'stdout' || payload.type === 'stderr') {
                  if (terminal) {
                    // Convert newlines to CRLF for xterm.js
                    const text = payload.data.replace(/\n/g, '\r\n');
                    terminal.write(text);
                  }

                  accumulatedOutput += payload.data;
                  (action as any).output = accumulatedOutput;
                  this.actions.setKey(action.id, {
                    ...this.actions.get()[action.id],
                    output: accumulatedOutput,
                    cwd: cwdDisplay,
                  });
                  this.onActionOutput?.(action.id, payload.data, accumulatedOutput);

                  buffer += payload.data;
                  const cleanBuffer = buffer.replace(
                    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
                    ''
                  );

                  // Look for Preview URLs in stdout
                  const expoMatch = cleanBuffer.match(expoUrlRegex);
                  if (expoMatch) {
                    const cleanUrl = expoMatch[1].replace(/[^\x20-\x7E]+$/g, '');
                    this.onExpoUrl?.(cleanUrl);
                    this.onPreviewUrl?.(cleanUrl);
                    buffer = '';
                    if (isStartOrDev) finishSuccess();
                  } else {
                    const viteMatch = cleanBuffer.match(viteLocalRegex);
                    if (viteMatch) {
                      this.onPreviewUrl?.(viteMatch[1]);
                      buffer = '';
                      if (isStartOrDev) finishSuccess();
                    } else {
                      const localMatch = cleanBuffer.match(localhostRegex);
                      if (localMatch) {
                        this.onPreviewUrl?.(`http://localhost:${localMatch[1]}`);
                        buffer = '';
                        if (isStartOrDev) finishSuccess();
                      }
                    }
                  }
                }

              if (payload.type === 'url' && payload.data) {
                this.onPreviewUrl?.(payload.data);
                if (isStartOrDev) finishSuccess();
              }
              if (payload.type === 'error') finishError(new Error(payload.data));
              if (payload.type === 'exit') {
                if (payload.data !== '0') finishError(new Error(`Command exited with code ${payload.data}`));
                else finishSuccess();
              }
            }
          }
        } catch (streamErr) {
          finishError(streamErr instanceof Error ? streamErr : new Error(String(streamErr)));
        }
      })();
    });
  }
}
