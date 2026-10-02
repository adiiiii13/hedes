import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recallMemory,
  resolveMemoryConflicts,
  formatMemoryContext,
  exportMemoryToMarkdown,
} from '../app/engine/memory.ts';

test('Stage 06: Memory provenance tracks origin method and source references', () => {
  const node = {
    id: 'mem_1',
    parentId: null,
    title: 'Code Styling Rule',
    content: 'Always prefer TypeScript strict types with no implicit any.',
    tags: ['typescript', 'style'],
    pinned: true,
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
    scope: 'project',
    type: 'preference',
    status: 'active',
    revision: 1,
    verified: true,
    provenance: {
      sourceRunId: 'run_abc123',
      sourceChatId: 'chat_xyz',
      method: 'explicit_user',
      quote: 'I want strict TypeScript in this project.',
    },
  };

  const formatted = formatMemoryContext([node], [node]);
  assert.ok(formatted.includes('Provenance: explicit_user'), 'Formatted context must include provenance note');
  assert.ok(formatted.includes('Code Styling Rule'));
});

test('Stage 06: Contradictory preferences supersede older versions into one active preference', () => {
  const oldNode = {
    id: 'pref_1',
    parentId: null,
    title: 'CSS Framework Preference',
    content: 'Use TailwindCSS utility classes.',
    tags: ['css', 'styling'],
    pinned: false,
    createdAt: Date.now() - 50000,
    updatedAt: Date.now() - 50000,
    scope: 'project',
    type: 'preference',
    status: 'active',
    revision: 1,
    verified: true,
  };

  const newNode = {
    id: 'pref_2',
    parentId: null,
    title: 'CSS Framework Preference',
    content: 'Switch from Tailwind to Vanilla CSS with custom properties.',
    tags: ['css', 'styling'],
    pinned: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scope: 'project',
    type: 'preference',
    status: 'active',
    revision: 1,
    verified: true,
  };

  const { updatedNodes, isDuplicate } = resolveMemoryConflicts([oldNode], newNode);

  assert.equal(isDuplicate, false);
  assert.equal(updatedNodes.length, 2);

  const superseded = updatedNodes.find((n) => n.id === 'pref_1');
  const active = updatedNodes.find((n) => n.id === 'pref_2');

  assert.equal(superseded.status, 'superseded', 'Old preference must be marked superseded');
  assert.equal(active.status, 'active', 'New preference must be active');
  assert.equal(active.supersedesId, 'pref_1', 'New preference must link to superseded ID');

  // Verify recallMemory only returns active nodes
  const recalled = recallMemory(updatedNodes, 'CSS framework');
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].id, 'pref_2', 'Only the active superseded preference can be recalled');
});

test('Stage 06: Obsidian Markdown export formats YAML frontmatter and stable metadata', () => {
  const nodes = [
    {
      id: 'obs_1',
      parentId: null,
      title: 'Database Architecture Decision',
      content: 'Store primary chats on disk and use IndexedDB as a resilient mirror.',
      tags: ['storage', 'architecture'],
      pinned: true,
      createdAt: 1720000000000,
      updatedAt: 1720000500000,
      scope: 'project',
      type: 'decision',
      status: 'active',
      revision: 2,
      verified: true,
      provenance: {
        method: 'verified_task',
        sourceRunId: 'run_prod_001',
      },
    },
  ];

  const markdown = exportMemoryToMarkdown(nodes);
  assert.ok(markdown.startsWith('---'), 'Must start with YAML frontmatter delimiter');
  assert.ok(markdown.includes('id: "obs_1"'));
  assert.ok(markdown.includes('type: "decision"'));
  assert.ok(markdown.includes('status: "active"'));
  assert.ok(markdown.includes('provenance_method: "verified_task"'));
  assert.ok(markdown.includes('# Database Architecture Decision'));
  assert.ok(markdown.includes('Store primary chats on disk'));
});
