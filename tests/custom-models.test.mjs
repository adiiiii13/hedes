import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCustomModels, normalizeCustomBaseUrl } from '../app/utils/custom-models.ts';

test('custom model URL accepts API bases and full model URLs', () => {
  assert.equal(normalizeCustomBaseUrl('http://localhost:11434'), 'http://localhost:11434/v1');
  assert.equal(normalizeCustomBaseUrl('https://example.com/openai/v1/models'), 'https://example.com/openai/v1');
  assert.equal(normalizeCustomBaseUrl('https://example.com/v1/chat/completions'), 'https://example.com/v1');
  assert.throws(() => normalizeCustomBaseUrl('file:///secrets'), /HTTP or HTTPS/);
  assert.throws(() => normalizeCustomBaseUrl('https://user:pass@example.com/v1'), /HTTP or HTTPS/);
});

test('custom model scan ignores invalid and duplicate entries', () => {
  assert.deepEqual(extractCustomModels({ data: [{ id: 'model-a' }, { id: 'model-a' }, {}, { id: 'model-b' }] }), [
    { id: 'model-a', label: 'model-a' },
    { id: 'model-b', label: 'model-b' },
  ]);
  assert.deepEqual(extractCustomModels({ data: 'bad' }), []);
});
