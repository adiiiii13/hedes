import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.HEDES_PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.HEDES_PLAYWRIGHT_MODULE).href) : await import('playwright');
const profile = await mkdtemp(path.join(os.tmpdir(), 'hedes-p0-desktop-'));
const executable = path.resolve(process.env.HEDES_PACKAGED_PATH || 'dist/win-unpacked/Hedes Studio.exe');
const child = spawn(executable, ['--remote-debugging-port=9226'], { windowsHide: true, env: { ...process.env, APP_PATH_ROOT: profile }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stdout.on('data', chunk => logs += chunk); child.stderr.on('data', chunk => logs += chunk);
let browser;
const checks = {};
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9226'); break; }
    catch { if (child.exitCode !== null) throw new Error(logs); await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  assert.ok(browser, logs);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent('page');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(30000);
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
  checks.startup = 'Electron 44 packaged application loaded';
  const post = (route, body) => page.evaluate(async ({ route, body }) => {
    const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, text: await response.text() };
  }, { route, body });
  const decide = async accepted => {
    const dialog = page.getByRole('dialog', { name: 'Review action', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: accepted ? 'Approve once' : 'Reject', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const denied = post('/api/local/shell', { chatId: 'p0-smoke', command: 'echo SHOULD_NOT_RUN' });
  await decide(false); assert.equal((await denied).status, 403);
  const command = post('/api/local/shell', { chatId: 'p0-smoke', command: 'echo HEDES_P0_TERMINAL_OK' });
  await decide(true); const commandResult = await command;
  assert.equal(commandResult.status, 200, commandResult.text); assert.match(commandResult.text, /HEDES_P0_TERMINAL_OK/);
  checks.approvalAndTerminal = 'Rejected command blocked; approved command actually executed';
  const write = post('/api/local/fs', { chatId: 'p0-smoke', filePath: 'review.txt', content: 'P0 persisted file' });
  await page.getByRole('heading', { name: 'Review file change' }).waitFor();
  await page.getByText('Proposed file', { exact: true }).waitFor();
  await decide(true); const written = await write; assert.equal(written.status, 200, written.text);
  const edit = JSON.parse(written.text);
  assert.ok(edit.changeSetId);
  const undo = post('/api/local/edits', { action: 'undo', chatId: 'p0-smoke', id: edit.changeSetId });
  await decide(true); assert.equal((await undo).status, 200);
  checks.reviewAndUndo = 'Actual reviewed file edit and conflict-aware undo passed';
  const meta = await post('/api/local/projects', { chatId: 'p0-smoke', title: 'P0 persisted history', messages: [{ id: 'p0-message', role: 'user', content: 'Saved history test', createdAt: Date.now() }] });
  assert.equal(meta.status, 200);
  const revision = JSON.parse(meta.text).revision;
  const concurrent = await Promise.all(['first', 'second'].map(title => post('/api/local/projects', { chatId: 'p0-smoke', title, messages: [], expectedRevision: revision })));
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
  checks.concurrentHistory = 'Only one simultaneous writer succeeds; other receives 409';
  for (const [filePath, content] of Object.entries({
    'package.json': JSON.stringify({ scripts: { dev: 'node server.cjs' } }),
    'server.cjs': "require('node:http').createServer((req,res)=>res.end('<h1>P0 PREVIEW WORKING</h1>')).listen(Number(process.env.PORT),'127.0.0.1');",
  })) { const pending = post('/api/local/fs', { chatId: 'p0-smoke', filePath, content }); await decide(true); assert.equal((await pending).status, 200); }
  const start = post('/api/local/website', { chatId: 'p0-smoke', action: 'start' }); await decide(true);
  const status = JSON.parse((await start).text); assert.equal(status.running, true);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('textbox', { name: 'Preview URL' }).fill(status.url);
  await page.getByRole('textbox', { name: 'Preview URL' }).press('Enter');
  await page.frameLocator('iframe').getByRole('heading', { name: 'P0 PREVIEW WORKING' }).waitFor();
  checks.preview = 'Actual project child server visible in iframe';
  const stop = post('/api/local/website', { chatId: 'p0-smoke', action: 'stop' }); await decide(true); await stop;
  await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
  const disk = await page.evaluate(async () => (await fetch('/api/local/projects')).json());
  assert.ok(disk.projects.find(project => project.id === 'p0-smoke'));
  checks.persistence = 'Project survives page reload';
  assert.deepEqual(errors, []);
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/p0-desktop.png' });
  await writeFile('output/p0-desktop-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), executable, checks, pageErrors: errors }, null, 2));
  console.log(JSON.stringify(checks));
} finally {
  await mkdir('output', { recursive: true });
  await writeFile('output/p0-desktop-process.log', logs);
  await browser?.close(); child.kill();
}
