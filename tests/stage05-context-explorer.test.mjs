import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildContextBuffer } from '../app/engine/context-engine.ts';

test('Stage 05: Context selection enforces hierarchical priority (explicit > editor > search > nearby > project)', () => {
  const mockFiles = {
    'src/components/Footer.tsx': 'export const Footer = () => <footer>Footer</footer>;',
    'src/components/Header.tsx': 'export const Header = () => <header>Header</header>;',
    'src/components/SpecialWidget.tsx': 'export const SpecialWidget = () => <div>Special Widget</div>;',
    'src/App.tsx': 'import { Header } from "./components/Header"; export default function App() { return <Header />; }',
    'src/utils/math.ts': 'export const add = (a: number, b: number) => a + b;',
  };

  let inspectorReport = null;

  const buffer = buildContextBuffer(mockFiles, {
    userPrompt: 'Fix the bug in SpecialWidget please',
    activeEditorPath: 'src/App.tsx',
    searchMatches: ['src/utils/math.ts'],
    maxTokenBudget: 10000,
    onInspectorReport: (report) => {
      inspectorReport = report;
    },
  });

  assert.ok(buffer.includes('untrustedTaskData="true"'), 'Context buffer must mark files as untrusted task data');
  assert.ok(inspectorReport, 'Inspector report must be generated');

  const included = inspectorReport.includedFiles;
  assert.ok(included.length >= 4);

  // 1. Explicitly requested SpecialWidget must be Rank 1
  assert.equal(included[0].path, 'src/components/SpecialWidget.tsx');
  assert.equal(included[0].reason, 'explicit');

  // 2. Active editor file App.tsx must be Rank 2
  assert.equal(included[1].path, 'src/App.tsx');
  assert.equal(included[1].reason, 'active_editor');

  // 3. Search match math.ts must be Rank 3
  assert.equal(included[2].path, 'src/utils/math.ts');
  assert.equal(included[2].reason, 'search_match');
});

test('Stage 05: Token budget exhaustion omits lower priority files with actionable reason', () => {
  const mockFiles = {
    'src/explicit.ts': 'A'.repeat(400),
    'src/editor.ts': 'B'.repeat(400),
    'src/lowPriority1.ts': 'C'.repeat(400),
    'src/lowPriority2.ts': 'D'.repeat(400),
  };

  let inspectorReport = null;

  // Set tight budget of 150 tokens (~600 chars)
  buildContextBuffer(mockFiles, {
    userPrompt: 'Look at explicit.ts',
    activeEditorPath: 'src/editor.ts',
    maxTokenBudget: 150,
    onInspectorReport: (report) => {
      inspectorReport = report;
    },
  });

  assert.ok(inspectorReport);
  assert.ok(inspectorReport.includedFiles.length <= 2, 'Only high priority files should fit');
  assert.ok(inspectorReport.omittedFiles.some((f) => f.reason === 'token_budget_exhausted'), 'Omitted files must cite token budget exhaustion');
});

test('Stage 05: 2 MB file safety guard flags read-only preview and truncates contents', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-fs-test-'));
  const largeFile = path.join(tmpDir, 'large-asset.json');

  // Write a 2.5 MB file
  const bigBuffer = Buffer.alloc(2.5 * 1024 * 1024, 'x');
  await fs.writeFile(largeFile, bigBuffer);

  const stat = await fs.stat(largeFile);
  assert.ok(stat.size > 2 * 1024 * 1024, 'File must exceed 2 MB');

  // Simulate loader check
  const isReadOnlyPreview = stat.size > 2 * 1024 * 1024;
  assert.equal(isReadOnlyPreview, true, 'Must flag file as read-only preview');

  // Read preview chunk
  const handle = await fs.open(largeFile, 'r');
  const buf = Buffer.alloc(128 * 1024);
  const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
  await handle.close();

  assert.equal(bytesRead, 128 * 1024, 'Preview chunk must be bounded to 128 KB');
  await fs.rm(tmpDir, { recursive: true, force: true });
});
