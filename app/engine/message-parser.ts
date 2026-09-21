import type { ActionType, BoltAction, FileAction, ShellAction } from '~/types/actions';
import type { BoltArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MessageParser');

const ARTIFACT_OPEN_TAGS = ['<boltArtifact', '<hedesArtifact'];
const ARTIFACT_CLOSE_TAGS = ['</boltArtifact>', '</hedesArtifact>'];
const ACTION_OPEN_TAGS = ['<boltAction', '<hedesAction'];
const ACTION_CLOSE_TAGS = ['</boltAction>', '</hedesAction>'];

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionStream?: ActionCallback;
  onActionClose?: ActionCallback;
}

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
}

interface MessageState {
  position: number;
  accumulatedOutput: string;
  insideArtifact: boolean;
  insideAction: boolean;
  currentArtifact?: BoltArtifactData;
  currentAction: {
    type: ActionType;
    filePath?: string;
    content: string;
  };
  actionId: number;
}

function cleanoutMarkdownSyntax(content: string) {
  const codeBlockRegex = /^\s*```\w*\n([\s\S]*?)\n\s*```\s*$/;
  const match = content.match(codeBlockRegex);
  if (match) {
    return match[1];
  }
  return content;
}

function cleanEscapedTags(content: string) {
  return content.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function findFirstOf(input: string, startIndex: number, tags: string[]): { tag: string; index: number } | null {
  let earliestIndex = -1;
  let matchedTag = '';

  for (const tag of tags) {
    const pos = input.indexOf(tag, startIndex);
    if (pos !== -1 && (earliestIndex === -1 || pos < earliestIndex)) {
      earliestIndex = pos;
      matchedTag = tag;
    }
  }

  return earliestIndex !== -1 ? { tag: matchedTag, index: earliestIndex } : null;
}

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();

  constructor(private _options: StreamingMessageParserOptions = {}) {}

  /**
   * Parse incoming input chunk/cumulative string for the given message.
   * Returns the FULL clean parsed string for this message so far (conversational text + artifact placeholder).
   * File code inside actions is NEVER included in the returned output.
   */
  parse(messageId: string, input: string): string {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        accumulatedOutput: '',
        insideAction: false,
        insideArtifact: false,
        currentAction: { content: '', type: 'file' },
        actionId: 0,
      };
      this.#messages.set(messageId, state);
    }

    let i = state.position;
    let newOutput = '';
    let earlyBreak = false;

    while (i < input.length) {
      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;
        if (!currentArtifact) {
          state.insideArtifact = false;
          i++;
          continue;
        }

        if (state.insideAction) {
          const closeMatch = findFirstOf(input, i, ACTION_CLOSE_TAGS);
          const currentAction = state.currentAction;

          if (closeMatch) {
            currentAction.content += input.slice(i, closeMatch.index);
            let content = currentAction.content.trim();

            if (currentAction.type === 'file') {
              if (currentAction.filePath && !currentAction.filePath.endsWith('.md')) {
                content = cleanoutMarkdownSyntax(content);
                content = cleanEscapedTags(content);
              }
              content += '\n';
            }

            currentAction.content = content;

            this._options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,
              actionId: String(state.actionId - 1),
              action: {
                id: String(state.actionId - 1),
                status: 'complete',
                ...currentAction,
              } as BoltAction,
            });

            state.insideAction = false;
            state.currentAction = { content: '', type: 'file' };
            i = closeMatch.index + closeMatch.tag.length;
          } else {
            // Still streaming inside action — do not emit to markdown output!
            if (currentAction.type === 'file') {
              let content = input.slice(i);
              if (currentAction.filePath && !currentAction.filePath.endsWith('.md')) {
                content = cleanoutMarkdownSyntax(content);
                content = cleanEscapedTags(content);
              }
              this._options.callbacks?.onActionStream?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId - 1),
                action: {
                  id: String(state.actionId - 1),
                  status: 'running',
                  ...currentAction,
                  content,
                } as BoltAction,
              });
            }
            break;
          }
        } else {
          // Inside artifact, looking for next action or artifact close
          const actionOpenMatch = findFirstOf(input, i, ACTION_OPEN_TAGS);
          const artifactCloseMatch = findFirstOf(input, i, ARTIFACT_CLOSE_TAGS);

          if (
            actionOpenMatch &&
            (!artifactCloseMatch || actionOpenMatch.index < artifactCloseMatch.index)
          ) {
            const actionEndIndex = input.indexOf('>', actionOpenMatch.index);

            if (actionEndIndex !== -1) {
              state.insideAction = true;
              state.currentAction = this.#parseActionTag(input, actionOpenMatch.index, actionEndIndex);

              this._options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: {
                  id: String(state.actionId - 1),
                  status: 'pending',
                  ...state.currentAction,
                } as BoltAction,
              });

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseMatch) {
            this._options.callbacks?.onArtifactClose?.({
              messageId,
              ...currentArtifact,
            });

            state.insideArtifact = false;
            state.currentArtifact = undefined;
            i = artifactCloseMatch.index + artifactCloseMatch.tag.length;
          } else {
            break;
          }
        }
      } else if (input[i] === '<' && input[i + 1] !== '/') {
        // Outside artifact: check if an artifact open tag is beginning
        let matchedOpenTag: string | null = null;
        let potentialMatch = false;

        for (const tag of ARTIFACT_OPEN_TAGS) {
          const slice = input.slice(i, i + tag.length);
          if (slice === tag) {
            matchedOpenTag = tag;
            break;
          } else if (tag.startsWith(slice)) {
            potentialMatch = true;
          }
        }

        if (matchedOpenTag) {
          const openTagEnd = input.indexOf('>', i);

          if (openTagEnd !== -1) {
            const artifactTag = input.slice(i, openTagEnd + 1);
            const artifactTitle = this.#extractAttribute(artifactTag, 'title') || 'Project Build';
            const type = this.#extractAttribute(artifactTag, 'type') || 'application/hedes';
            const artifactId = this.#extractAttribute(artifactTag, 'id') || `artifact-${Date.now()}`;

            state.insideArtifact = true;
            const currentArtifact: BoltArtifactData = {
              id: artifactId,
              title: artifactTitle,
              type,
            };

            state.currentArtifact = currentArtifact;
            this._options.callbacks?.onArtifactOpen?.({ messageId, ...currentArtifact });

            // Artifact placeholder
            newOutput += `\n<div class="__boltArtifact__" data-message-id="${messageId}"></div>\n\n`;
            i = openTagEnd + 1;
          } else {
            earlyBreak = true;
            break;
          }
        } else if (potentialMatch) {
          break;
        } else {
          newOutput += input[i];
          i++;
        }
      } else {
        newOutput += input[i];
        i++;
      }

      if (earlyBreak) break;
    }

    state.position = i;
    state.accumulatedOutput += newOutput;

    return state.accumulatedOutput;
  }

  flush(messageId: string) {
    const state = this.#messages.get(messageId);
    if (!state) return;

    if (state.insideAction && state.currentAction) {
      const currentAction = state.currentAction;
      let content = currentAction.content.trim();
      if (currentAction.type === 'file' && currentAction.filePath) {
        if (!currentAction.filePath.endsWith('.md')) {
          content = cleanoutMarkdownSyntax(content);
          content = cleanEscapedTags(content);
        }
        content += '\n';
      }
      currentAction.content = content;

      this._options.callbacks?.onActionClose?.({
        artifactId: state.currentArtifact?.id || 'unknown',
        messageId,
        actionId: String(state.actionId - 1),
        action: {
          id: String(state.actionId - 1),
          status: 'complete',
          ...currentAction,
        } as BoltAction,
      });
      state.insideAction = false;
    }

    if (state.insideArtifact && state.currentArtifact) {
      this._options.callbacks?.onArtifactClose?.({
        messageId,
        ...state.currentArtifact,
      });
      state.insideArtifact = false;
    }
  }

  reset(messageId?: string) {
    if (messageId) {
      this.#messages.delete(messageId);
    } else {
      this.#messages.clear();
    }
  }

  #parseActionTag(input: string, openIndex: number, endIndex: number) {
    const actionTag = input.slice(openIndex, endIndex + 1);
    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;
    const filePath = this.#extractAttribute(actionTag, 'filePath');

    return {
      type: actionType || 'file',
      filePath,
      content: '',
    };
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    const match = tag.match(new RegExp(`${attributeName}="([^"]*)"`, 'i'));
    return match ? match[1] : undefined;
  }
}
