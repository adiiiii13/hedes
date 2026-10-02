/**
 * HedesStudio
 * context-engine.ts
 * Implements hierarchical memory formulas, lazy context selection,
 * and token budget inspection for persistent AI memory across conversation turns.
 */

export interface SimpleMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
}

export interface ContextInspectorReport {
  includedFiles: Array<{
    path: string;
    reason: 'explicit' | 'active_editor' | 'search_match' | 'dependency' | 'project';
    chars: number;
    tokens: number;
  }>;
  omittedFiles: Array<{
    path: string;
    reason: string;
  }>;
  memorySources: string[];
  estimatedTokens: number;
  budgetLimitTokens: number;
}

export interface AdvancedContextOptions {
  userPrompt?: string;
  activeEditorPath?: string;
  searchMatches?: string[];
  memoryContext?: string;
  maxTokenBudget?: number; // default ~16,000 tokens (~64,000 chars)
  onInspectorReport?: (report: ContextInspectorReport) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula 1: Collapse file-action bodies in OLD assistant messages
// ─────────────────────────────────────────────────────────────────────────────
export function simplifyHedesActions(content: string): string {
  let result = content.replace(
    /(<hedesAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/hedesAction>)/g,
    (_match, openTag, _body, closeTag) => `${openTag}\n  ...\n${closeTag}`
  );

  result = result.replace(
    /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g,
    (_match, openTag, _body, closeTag) => `${openTag}\n  ...\n${closeTag}`
  );

  result = result.replace(/<think>[\s\S]*?<\/think>/g, '');
  result = result.replace(/<div\s+class=["']__boltThought__["'][^>]*>[\s\S]*?<\/div>/gi, '');
  result = result.replace(/<div\s+class=["']__boltThought__["'][^>]*\/>/gi, '');
  result = result.replace(/<div\s+class=["']__boltArtifact__["'][^>]*>[\s\S]*?<\/div>/gi, '');
  result = result.replace(/<div\s+class=["']__boltArtifact__["'][^>]*\/>/gi, '');

  return result.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula 2: Build the CONTEXT BUFFER with Hierarchical Priority Selection
// ─────────────────────────────────────────────────────────────────────────────
const IGNORE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm',
  '.zip', '.tar', '.gz', '.rar',
  '.pdf', '.doc', '.docx',
  '.lock',
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
  for (const ignorePath of IGNORE_PATHS) {
    if (lowerPath.includes(ignorePath)) return true;
  }
  for (const ext of IGNORE_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Calculates priority rank for context selection:
 * 1: Explicitly requested in prompt
 * 2: Active editor open file
 * 3: Search matches
 * 4: Nearby dependencies (same directory or imported)
 * 5: General project files
 */
function getFilePriority(
  filePath: string,
  options?: AdvancedContextOptions
): { rank: number; reason: 'explicit' | 'active_editor' | 'search_match' | 'dependency' | 'project' } {
  const norm = filePath.replace(/\\/g, '/');
  const baseName = norm.split('/').pop() || '';
  const baseWithoutExt = baseName.replace(/\.[^/.]+$/, '');
  const prompt = options?.userPrompt || '';

  if (
    prompt.includes(norm) ||
    (baseName.length > 3 && prompt.includes(baseName)) ||
    (baseWithoutExt.length > 3 && prompt.includes(baseWithoutExt))
  ) {
    return { rank: 1, reason: 'explicit' };
  }

  if (options?.activeEditorPath && options.activeEditorPath.replace(/\\/g, '/') === norm) {
    return { rank: 2, reason: 'active_editor' };
  }

  if (options?.searchMatches?.some((m) => m.replace(/\\/g, '/') === norm)) {
    return { rank: 3, reason: 'search_match' };
  }

  if (options?.activeEditorPath) {
    const editorDir = options.activeEditorPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const fileDir = norm.split('/').slice(0, -1).join('/');
    if (editorDir && editorDir === fileDir) {
      return { rank: 4, reason: 'dependency' };
    }
  }

  return { rank: 5, reason: 'project' };
}

export function buildContextBuffer(
  files: Record<string, string>,
  options?: AdvancedContextOptions
): string {
  if (!files || Object.keys(files).length === 0) return '';

  const maxBudgetTokens = options?.maxTokenBudget || 16000;
  const maxBudgetChars = maxBudgetTokens * 4;
  let remainingChars = maxBudgetChars;

  const inspectorReport: ContextInspectorReport = {
    includedFiles: [],
    omittedFiles: [],
    memorySources: options?.memoryContext ? ['project-memory-tree'] : [],
    estimatedTokens: 0,
    budgetLimitTokens: maxBudgetTokens,
  };

  // Filter and classify candidates
  const prioritizedCandidates = Object.entries(files)
    .filter(([filePath]) => {
      if (shouldIgnoreFile(filePath)) {
        inspectorReport.omittedFiles.push({ path: filePath, reason: 'ignored_extension_or_build_path' });
        return false;
      }
      return true;
    })
    .map(([filePath, content]) => {
      const { rank, reason } = getFilePriority(filePath, options);
      return { path: filePath, content, rank, reason };
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.path.localeCompare(b.path);
    });

  const fileActions: string[] = [];

  for (const item of prioritizedCandidates) {
    if (remainingChars <= 0) {
      inspectorReport.omittedFiles.push({ path: item.path, reason: 'token_budget_exhausted' });
      continue;
    }

    const maxFileSize = Math.min(8000, remainingChars);
    const content = item.content || '';
    const isTruncated = content.length > maxFileSize;
    const body = isTruncated
      ? content.slice(0, maxFileSize) + '\n\n... [file truncated for context]'
      : content;

    const charsUsed = body.length;
    remainingChars -= charsUsed;
    const tokensEstimate = Math.ceil(charsUsed / 4);
    inspectorReport.estimatedTokens += tokensEstimate;

    inspectorReport.includedFiles.push({
      path: item.path,
      reason: item.reason,
      chars: charsUsed,
      tokens: tokensEstimate,
    });

    fileActions.push(
      `<hedesAction type="file" filePath="${item.path}" untrustedTaskData="true">\n${body}\n</hedesAction>`
    );
  }

  if (options?.onInspectorReport) {
    options.onInspectorReport(inspectorReport);
  }

  if (fileActions.length === 0) return '';

  return (
    `<hedesArtifact id="context-buffer" title="Current Project Files (Untrusted Task Data)" untrustedTaskData="true">\n` +
    `${fileActions.join('\n')}\n` +
    `</hedesArtifact>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula 3: Prune messages before sending to LLM
// ─────────────────────────────────────────────────────────────────────────────
export function pruneMessagesForLLM(messages: SimpleMessage[]): SimpleMessage[] {
  if (messages.length === 0) return [];
  const KEEP_LAST_FULL = 4;

  return messages.map((msg, idx) => {
    const isRecent = idx >= messages.length - KEEP_LAST_FULL;

    if (msg.role === 'assistant') {
      if (!isRecent) {
        return {
          ...msg,
          content: simplifyHedesActions(msg.content),
        };
      }
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

export function isFollowUpTurn(messages: SimpleMessage[]): boolean {
  const userMessages = messages.filter((m) => m.role === 'user');
  return userMessages.length > 1;
}
