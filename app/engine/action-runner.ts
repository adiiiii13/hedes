import { map, type MapStore } from 'nanostores';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { currentChatId } from '~/stores/chat';
import type { ITerminal } from '~/types/terminal';
import { expoUrlAtom, loadProjectFiles } from '~/stores/workspace';

const logger = createScopedLogger('ActionRunner');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface ActionState extends BoltAction {
  status: ActionStatus;
  error?: string;
}

export class ActionRunner {
  #fileQueue: Promise<void> = Promise.resolve();
  #shellQueue: Promise<void> = Promise.resolve();
  #terminal: () => ITerminal | undefined;
  
  actions: MapStore<Record<string, ActionState>> = map({});
  onPreviewUrl?: (url: string) => void;
  onFileChange?: (filePath: string, content: string) => void;
  onActionComplete?: (actionId: string, action: BoltAction) => void;
  onActionError?: (actionId: string, errorMsg: string) => void;

  constructor(getTerminal: () => ITerminal | undefined) {
    this.#terminal = getTerminal;
  }

  addAction(action: BoltAction) {
    this.actions.setKey(action.id, {
      ...action,
      status: 'pending',
    });
  }

  runAction(action: BoltAction): Promise<void> {
    this.actions.setKey(action.id, {
      ...action,
      status: 'running',
    });

    if (action.type === 'file') {
      this.#fileQueue = this.#fileQueue
        .then(async () => {
          logger.info(`Running file action ${action.id} (${action.filePath})`);
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
    } else {
      this.#shellQueue = this.#shellQueue
        .then(async () => {
          logger.info(`Running shell action ${action.id} (${action.type})`);
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

  async #executeFileAction(action: BoltAction) {
    if (!action.filePath) return;
    
    const chatId = currentChatId.get();
    
    const response = await fetch('/api/local/fs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        filePath: action.filePath,
        content: action.content,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to write file: ${await response.text()}`);
    }

    const data = await response.json();
    const cleanPath = data.cleanPath || action.filePath.replace(/^\/+/, '');
    
    // Update active memory files store immediately
    this.onFileChange?.(cleanPath, action.content);

    // Refresh disk file list so File Explorer shows new file immediately
    loadProjectFiles(chatId).catch(() => {});
  }

  async #executeShellAction(action: BoltAction): Promise<void> {
    const command = action.content.trim();
    if (!command) return;

    logger.info(`Spawning shell command: ${command}`);
    
    const terminal = this.#terminal();
    if (terminal) {
      terminal.write(`\r\n\x1b[32m❯ ${command}\x1b[0m\r\n`);
    }

    const chatId = currentChatId.get();
    
    const response = await fetch('/api/local/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, command }),
    });

    if (!response.body) {
      throw new Error('No response body from shell execution');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const expoUrlRegex = /(exp:\/\/[^\s]+)/;
    const localhostRegex = /http:\/\/localhost:(\d+)/;
    const viteLocalRegex = /Local:\s+(http:\/\/localhost:\d+\/)/;

    const isStartOrDev =
      action.type === 'start' ||
      command.includes('dev') ||
      command.includes('start') ||
      command.includes('vite');

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const finishSuccess = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const finishError = (err: Error) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      };

      // For dev servers / start actions: resolve early so subsequent actions are never blocked
      if (isStartOrDev) {
        setTimeout(() => {
          finishSuccess();
        }, 1500);
      }

      // Background stream reader loop: continues for the full lifetime of the process
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              finishSuccess();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const payload = JSON.parse(line);

                if (payload.type === 'stdout' || payload.type === 'stderr') {
                  if (terminal) {
                    // Convert newlines to CRLF for xterm.js
                    const text = payload.data.replace(/\n/g, '\r\n');
                    terminal.write(text);
                  }

                  buffer += payload.data;
                  const cleanBuffer = buffer.replace(
                    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
                    ''
                  );

                  // Look for Preview URLs in stdout
                  const expoMatch = cleanBuffer.match(expoUrlRegex);
                  if (expoMatch) {
                    const cleanUrl = expoMatch[1].replace(/[^\x20-\x7E]+$/g, '');
                    expoUrlAtom.set(cleanUrl);
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

                if (payload.type === 'system') {
                  if (isStartOrDev) finishSuccess();
                }

                if (payload.type === 'exit' && payload.data !== '0' && action.type !== 'start') {
                  finishError(new Error(`Command exited with code ${payload.data}`));
                }
              } catch (e) {
                // Ignore partial JSON parse errors
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
