import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { memoryTerms, recallMemory, validateMemoryTree, formatMemoryContext } from '../app/engine/memory.ts';
import { validateProjectId, resolveProjectFilePath } from '../app/utils/project-dir.server.ts';
import { buildContextBuffer, pruneMessagesForLLM } from '../app/engine/context-engine.ts';

test('project paths cannot escape through traversal or sibling prefixes', () => {
  const root = path.resolve('projects', 'safe');
  assert.equal(resolveProjectFilePath(root, 'src/main.ts', 'safe').cleanPath, 'src/main.ts');
  assert.throws(() => resolveProjectFilePath(root, '../safe2/secret.txt', 'safe'));
  assert.throws(() => resolveProjectFilePath(root, 'src/../../secret.txt', 'safe'));
  assert.throws(() => validateProjectId('..'));
  assert.throws(() => validateProjectId('C:\\outside'));
});

test('memory recall ranks title matches and keeps parent context', () => {
  const nodes = [
    { id: 'root', parentId: null, title: 'Architecture', content: 'General plan', tags: [], pinned: false, createdAt: 1, updatedAt: 1 },
    { id: 'child', parentId: 'root', title: 'Database cache', content: 'Use SQLite for cache', tags: ['storage'], pinned: false, createdAt: 2, updatedAt: 2 },
    { id: 'other', parentId: null, title: 'UI', content: 'Database word only in content', tags: [], pinned: false, createdAt: 3, updatedAt: 3 },
  ];
  validateMemoryTree(nodes);
  assert.equal(recallMemory(nodes, 'database cache')[0].id, 'child');
  assert.match(formatMemoryContext(recallMemory(nodes, 'database cache'), nodes), /Architecture \/ Database cache/);
  assert.deepEqual(memoryTerms('the database and cache'), ['database', 'cache']);
});

test('memory tree rejects cycles', () => {
  const a = { id: 'a', parentId: 'b', title: 'A', content: 'a', tags: [], pinned: false, createdAt: 1, updatedAt: 1 };
  const b = { ...a, id: 'b', parentId: 'a', title: 'B' };
  assert.throws(() => validateMemoryTree([a, b]), /cycle/);
});

test('project context excludes secrets and remains bounded', () => {
  const context = buildContextBuffer({ '.env': 'SECRET=abc', 'src/large.ts': 'x'.repeat(200000), 'src/second.ts': 'y'.repeat(200000) });
  assert.doesNotMatch(context, /SECRET/);
  assert.ok(context.length < 70000);
  assert.match(context, /file truncated for context/);
});

test('old generated file bodies are removed from chat history', () => {
  const messages = [{ role: 'assistant', content: '<hedesAction type="file" filePath="x.ts">secret-long-code</hedesAction>' }, ...Array.from({ length: 4 }, () => ({ role: 'user', content: 'next' }))];
  const pruned = pruneMessagesForLLM(messages);
  assert.doesNotMatch(pruned[0].content, /secret-long-code/);
});
