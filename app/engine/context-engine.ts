/**
 * HedesStudio
 * context-engine.ts
 * Implements memory formulas for persistent AI memory across conversation turns.
 *
 * Formula 1: simplifyHedesActions  — prune old file code bodies to "..." to save tokens
 * Formula 2: buildContextBuffer    — inject current workspace files into system prompt
 * Formula 3: pruneMessages         — clean up assistant history before sending to LLM
 */

export interface SimpleMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula 1: Collapse file-action bodies in OLD assistant messages
// This reduces massive code dumps to lightweight file-path references.
// AI still knows the files exist — but doesn't re-read 10,000 tokens of history.
// ─────────────────────────────────────────────────────────────────────────────
export function simplifyHedesActions(content: string): string {
  // Collapse <hedesAction type="file"> bodies to "..."
  let result = content.replace(
    /(<hedesAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/hedesAction>)/g,
    (_match, openTag, _body, closeTag) => `${openTag}\n  ...\n${closeTag}`,
  );

  // Also handle boltAction format (for compatibility)
  result = result.replace(
    /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g,
    (_match, openTag, _body, closeTag) => `${openTag}\n  ...\n${closeTag}`,
  );

  // Remove <think>...</think> blocks from reasoning models (saves a lot of tokens)
  result = result.replace(/<think>[\s\S]*?<\/think>/g, '');

  // Remove <div class="__boltThought__">...</div> blocks
  result = result.replace(/<div\s+class=["']__boltThought__["'][^>]*>[\s\S]*?<\/div>/gi, '');
  result = result.replace(/<div\s+class=["']__boltThought__["'][^>]*\/>/gi, '');

  // Remove any __boltArtifact__ div tags so the LLM never sees them in prompt history
  result = result.replace(/<div\s+class=["']__boltArtifact__["'][^>]*>[\s\S]*?<\/div>/gi, '');
  result = result.replace(/<div\s+class=["']__boltArtifact__["'][^>]*\/>/gi, '');

  return result.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula 2: Build the CONTEXT BUFFER from current workspace files
// This is injected into the system prompt so the AI knows exactly what
// code is currently on disk — even if turn 1 messages are pruned.
// ─────────────────────────────────────────────────────────────────────────────
const IGNORE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm',
  '.zip', '.tar', '.gz', '.rar',
  '.pdf', '.doc', '.docx',
  '.lock', // package-lock.json, yarn.lock
];

const IGNORE_PATHS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  '.vite/',
  'coverage/',
  '.env',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

function shouldIgnoreFile(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();

  // Check ignored path prefixes
  for (const ignorePath of IGNORE_PATHS) {
    if (lowerPath.includes(ignorePath)) return true;
  }

  // Check ignored extensions
  for (const ext of IGNORE_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) return true;
  }

  return false;
}

export function buildContextBuffer(files: Record<string, string>): string {
  if (!files || Object.keys(files).length === 0) return '';

  const fileEntries = Object.entries(files)
    .filter(([path]) => !shouldIgnoreFile(path))
    .filter(([, content]) => content && content.length > 0)
    // Sort by path for consistent ordering
    .sort(([a], [b]) => a.localeCompare(b));

  if (fileEntries.length === 0) return '';

  const fileActions = fileEntries
    .map(([path, content]) => {
      // Truncate very large files to avoid blowing up the context window
      const truncated = content.length > 8000
        ? content.slice(0, 8000) + '\n\n... [file truncated for context]'
        : content;
      return `<hedesAction type="file" filePath="${path}">\n${truncated}\n</hedesAction>`;
    })
    .join('\n');

  return `<hedesArtifact id="context-buffer" title="Current Project Files">\n${fileActions}\n</hedesArtifact>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula 3: Prune messages before sending to LLM
// Apply simplification to all past assistant messages to minimize token usage.
// Keep the last 2 user messages and last 2 assistant messages in full detail.
// All older assistant messages get their file code collapsed.
// ─────────────────────────────────────────────────────────────────────────────
export function pruneMessagesForLLM(messages: SimpleMessage[]): SimpleMessage[] {
  if (messages.length === 0) return [];

  // Always keep the last N messages intact — only prune older ones
  const KEEP_LAST_FULL = 4; // last 4 messages stay untouched

  return messages.map((msg, idx) => {
    const isRecent = idx >= messages.length - KEEP_LAST_FULL;

    if (msg.role === 'assistant') {
      if (!isRecent) {
        return {
          ...msg,
          content: simplifyHedesActions(msg.content),
        };
      }
      // Even for recent messages, strip raw UI placeholder div tags
      let cleanContent = msg.content
        .replace(/<div\s+class=["']__boltArtifact__["'][^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<div\s+class=["']__boltArtifact__["'][^>]*\/>/gi, '')
        .replace(/<div\s+class=["']__boltThought__["'][^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<div\s+class=["']__boltThought__["'][^>]*\/>/gi, '')
        .trim();
      return {
        ...msg,
        content: cleanContent,
      };
    }

    return msg;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Determine if this is a follow-up (modification) turn
// Used by prompt builder to switch from "build from scratch" to "modify only"
// ─────────────────────────────────────────────────────────────────────────────
export function isFollowUpTurn(messages: SimpleMessage[]): boolean {
  const userMessages = messages.filter((m) => m.role === 'user');
  return userMessages.length > 1;
}
