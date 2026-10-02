/**
 * HedesStudio
 * memory.ts
 * Implements evidence-based tree memory with provenance tracking,
 * conflict superseding, bounded retrieval, and Obsidian Markdown interoperability.
 */

export type MemoryType = 'preference' | 'fact' | 'decision' | 'task_episode' | 'skill_reference';
export type MemoryStatus = 'active' | 'superseded' | 'archived' | 'pending_review';
export type MemoryScope = 'project' | 'global';

export interface MemoryProvenance {
  sourceRunId?: string;
  sourceChatId?: string;
  sourceFile?: string;
  sourceMessageId?: string;
  quote?: string;
  capturedAt?: number;
  method: 'explicit_user' | 'verified_task' | 'inferred' | 'obsidian_import';
}

export interface MemoryNode {
  id: string;
  parentId: string | null;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;

  // Evidence & Provenance Extensions (P2)
  scope: MemoryScope;
  type: MemoryType;
  status: MemoryStatus;
  revision: number;
  verified: boolean;
  provenance?: MemoryProvenance;
  supersedesId?: string;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'for', 'from', 'how', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'what', 'with',
]);

export function memoryTerms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || []).filter((word) => !STOP_WORDS.has(word)))];
}

export function validateMemoryTree(nodes: MemoryNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error('Memory IDs must be unique');
  for (const node of nodes) {
    if (node.parentId && !byId.has(node.parentId)) throw new Error(`Missing parent for ${node.title}`);
    const seen = new Set<string>([node.id]);
    let parent = node.parentId;
    while (parent) {
      if (seen.has(parent)) throw new Error('Memory tree contains a cycle');
      seen.add(parent);
      parent = byId.get(parent)?.parentId || null;
    }
  }
}

/**
 * Resolves conflicts by marking older contradictory preferences as 'superseded'.
 * Also deduplicates identical content.
 */
export function resolveMemoryConflicts(
  existingNodes: MemoryNode[],
  newNode: MemoryNode
): { updatedNodes: MemoryNode[]; isDuplicate: boolean } {
  const normTitle = newNode.title.trim().toLowerCase();
  const normContent = newNode.content.trim().toLowerCase();

  // 1. Check for exact duplicate
  const exactDup = existingNodes.find(
    (n) => n.status === 'active' && n.title.trim().toLowerCase() === normTitle && n.content.trim().toLowerCase() === normContent
  );
  if (exactDup) {
    exactDup.updatedAt = Date.now();
    exactDup.revision++;
    return { updatedNodes: existingNodes, isDuplicate: true };
  }

  const updatedNodes = existingNodes.map((node) => {
    // If newNode is a preference and conflicts with an existing preference with the same title or specific tag
    if (
      newNode.type === 'preference' &&
      node.type === 'preference' &&
      node.status === 'active' &&
      (node.title.trim().toLowerCase() === normTitle || (node.tags.length > 0 && node.tags.some((t) => newNode.tags.includes(t))))
    ) {
      newNode.supersedesId = node.id;
      return {
        ...node,
        status: 'superseded' as MemoryStatus,
        updatedAt: Date.now(),
        revision: node.revision + 1,
      };
    }
    return node;
  });

  return { updatedNodes: [...updatedNodes, newNode], isDuplicate: false };
}

/**
 * Recall active memory nodes ranked by relevance, excluding superseded/archived nodes.
 */
export function recallMemory(
  nodes: MemoryNode[],
  query: string,
  limit = 6,
  maxBudgetTokens = 1500
): MemoryNode[] {
  // Only search active nodes (or legacy nodes where status is undefined)
  const activeNodes = nodes.filter((n) => !n.status || n.status === 'active');
  const terms = memoryTerms(query);

  let candidates: MemoryNode[];
  if (terms.length === 0) {
    candidates = activeNodes.filter((node) => node.pinned).slice(0, limit);
  } else {
    const scored = activeNodes.map((node) => {
      const title = node.title.toLowerCase();
      const tags = node.tags.join(' ').toLowerCase();
      const content = node.content.toLowerCase();
      let score = node.pinned ? 2 : 0;

      for (const term of terms) {
        if (title.includes(term)) score += 5;
        if (tags.includes(term)) score += 3;
        if (content.includes(term)) score += 1;
      }
      const phrase = query.trim().toLowerCase();
      if (phrase.length >= 4 && (title.includes(phrase) || content.includes(phrase))) {
        score += 6;
      }
      return { node, score };
    });

    candidates = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.node.updatedAt - a.node.updatedAt)
      .slice(0, limit)
      .map((item) => item.node);
  }

  // Token bounding (1 token ~= 4 chars)
  const maxChars = maxBudgetTokens * 4;
  let usedChars = 0;
  const bounded: MemoryNode[] = [];

  for (const node of candidates) {
    const nodeChars = node.title.length + node.content.length + 50;
    if (usedChars + nodeChars <= maxChars) {
      bounded.push(node);
      usedChars += nodeChars;
    }
  }

  return bounded;
}

export function formatMemoryContext(nodes: MemoryNode[], allNodes: MemoryNode[], maxChars = 5000): string {
  const byId = new Map(allNodes.map((node) => [node.id, node]));
  const lines: string[] = [];

  for (const node of nodes) {
    if (node.status && node.status !== 'active') continue;

    const path = [node.title];
    let parent = node.parentId;
    while (parent && path.length < 8) {
      const ancestor = byId.get(parent);
      if (!ancestor) break;
      path.unshift(ancestor.title);
      parent = ancestor.parentId;
    }

    const why = node.provenance?.method ? ` (Provenance: ${node.provenance.method})` : '';
    const header = `- **${path.join(' / ')}**${why}: ${node.content}`;
    lines.push(header);
    if (lines.join('\n').length >= maxChars) break;
  }

  return lines.join('\n');
}

/**
 * Export selected memory nodes to Obsidian-compatible Markdown with YAML frontmatter.
 */
export function exportMemoryToMarkdown(nodes: MemoryNode[]): string {
  return nodes
    .map((node) => {
      const frontmatter = [
        '---',
        `id: "${node.id}"`,
        `title: "${node.title.replace(/"/g, '\\"')}"`,
        `type: "${node.type}"`,
        `status: "${node.status}"`,
        `scope: "${node.scope}"`,
        `revision: ${node.revision}`,
        `verified: ${node.verified}`,
        node.parentId ? `parentId: "${node.parentId}"` : null,
        node.tags.length > 0 ? `tags: [${node.tags.map((t) => `"${t}"`).join(', ')}]` : 'tags: []',
        node.provenance?.method ? `provenance_method: "${node.provenance.method}"` : null,
        node.provenance?.sourceRunId ? `sourceRunId: "${node.provenance.sourceRunId}"` : null,
        node.createdAt ? `createdAt: ${node.createdAt}` : null,
        node.updatedAt ? `updatedAt: ${node.updatedAt}` : null,
        '---',
      ]
        .filter(Boolean)
        .join('\n');

      return `${frontmatter}\n\n# ${node.title}\n\n${node.content}\n`;
    })
    .join('\n---\n\n');
}
