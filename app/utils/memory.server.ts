import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECTS_BASE, validateProjectId } from './project-dir.server.ts';
import { getStoragePaths } from './runtime.server.ts';
import {
  formatMemoryContext,
  recallMemory,
  validateMemoryTree,
  resolveMemoryConflicts,
  exportMemoryToMarkdown,
  type MemoryNode,
  type MemoryScope,
  type MemoryType,
  type MemoryStatus,
  type MemoryProvenance,
} from '../engine/memory.ts';

const memoryDir = getStoragePaths().memory;
const legacyMemoryDir = path.join(PROJECTS_BASE, '.hedes-memory');
const queues = new Map<string, Promise<unknown>>();

function memoryPath(projectId: string): string {
  const filename = `${validateProjectId(projectId)}.json`;
  return path.join(memoryDir, filename);
}

function normalizeNode(raw: any): MemoryNode {
  return {
    id: raw.id,
    parentId: raw.parentId || null,
    title: raw.title || 'Untitled note',
    content: raw.content || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    pinned: Boolean(raw.pinned),
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
    scope: (raw.scope as MemoryScope) || 'project',
    type: (raw.type as MemoryType) || 'fact',
    status: (raw.status as MemoryStatus) || 'active',
    revision: raw.revision || 1,
    verified: raw.verified ?? true,
    provenance: raw.provenance,
    supersedesId: raw.supersedesId,
  };
}

export async function listMemory(projectId: string): Promise<MemoryNode[]> {
  try {
    const primaryPath = memoryPath(projectId);
    let content: string;
    try {
      content = await fs.readFile(primaryPath, 'utf8');
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        const legacyPath = path.join(legacyMemoryDir, `${validateProjectId(projectId)}.json`);
        content = await fs.readFile(legacyPath, 'utf8');
      } else {
        throw e;
      }
    }
    const parsed = JSON.parse(content);
    const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    return rawNodes.map(normalizeNode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeMemory(projectId: string, nodes: MemoryNode[]): Promise<void> {
  validateMemoryTree(nodes);
  await fs.mkdir(memoryDir, { recursive: true });
  const target = memoryPath(projectId);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ version: 2, nodes }, null, 2), 'utf8');
  await fs.rename(temporary, target);
}

function serialize<T>(projectId: string, update: () => Promise<T>): Promise<T> {
  const previous = queues.get(projectId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(update);
  queues.set(projectId, current);
  void current.finally(() => {
    if (queues.get(projectId) === current) queues.delete(projectId);
  }).catch(() => undefined);
  return current;
}

export async function upsertMemory(projectId: string, input: Partial<MemoryNode>): Promise<MemoryNode[]> {
  return serialize(projectId, async () => {
    const nodes = await listMemory(projectId);
    if (nodes.length >= 500 && !input.id) throw new Error('Memory is full (500 nodes)');
    const title = String(input.title || '').trim().slice(0, 120);
    const content = String(input.content || '').trim().slice(0, 4000);
    if (!title || !content) throw new Error('Title and content are required');
    const now = Date.now();
    const existing = nodes.find((node) => node.id === input.id);

    const node: MemoryNode = {
      id: existing?.id || randomUUID(),
      parentId: input.parentId || null,
      title,
      content,
      tags: Array.isArray(input.tags)
        ? input.tags
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 12)
        : [],
      pinned: input.pinned === true,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      scope: input.scope || existing?.scope || 'project',
      type: input.type || existing?.type || 'fact',
      status: input.status || existing?.status || 'active',
      revision: (existing?.revision || 0) + 1,
      verified: input.verified !== undefined ? input.verified : true,
      provenance: input.provenance || existing?.provenance,
      supersedesId: existing?.supersedesId,
    };

    if (node.parentId && !nodes.some((candidate) => candidate.id === node.parentId)) {
      throw new Error('Parent memory does not exist');
    }

    if (existing) {
      nodes[nodes.indexOf(existing)] = node;
      await writeMemory(projectId, nodes);
      return nodes;
    }

    // Resolve conflicts and superseding on new insertions
    const { updatedNodes } = resolveMemoryConflicts(nodes, node);
    await writeMemory(projectId, updatedNodes);
    return updatedNodes;
  });
}

export async function deleteMemory(projectId: string, id: string): Promise<MemoryNode[]> {
  return serialize(projectId, async () => {
    const nodes = await listMemory(projectId);
    const target = nodes.find((node) => node.id === id);
    if (!target) throw new Error('Memory not found');
    const updated = nodes
      .filter((node) => node.id !== id)
      .map((node) => (node.parentId === id ? { ...node, parentId: target.parentId } : node));
    await writeMemory(projectId, updated);
    return updated;
  });
}

/**
 * Forget removes active nodes completely from active retrieval.
 */
export async function forgetMemory(projectId: string, id: string): Promise<boolean> {
  try {
    await deleteMemory(projectId, id);
    return true;
  } catch {
    return false;
  }
}

export async function memoryForPrompt(projectId: string, query: string, maxTokens = 1500): Promise<string> {
  const nodes = await listMemory(projectId);
  return formatMemoryContext(recallMemory(nodes, query, 6, maxTokens), nodes);
}

/**
 * Export selected memory as Markdown with YAML frontmatter.
 */
export async function exportMemoryMarkdown(projectId: string): Promise<string> {
  const nodes = await listMemory(projectId);
  return exportMemoryToMarkdown(nodes);
}
