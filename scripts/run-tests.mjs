import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Every test run gets its own profile: voice and queue fixtures must never touch user data.
const files = process.argv.slice(2);
const selected = files.length ? files : (await readdir('tests')).filter(f => f.endsWith('.test.mjs')).map(f => path.join('tests', f));
let failed = false;
async function worker() {
  for (;;) {
    const file = selected.shift(); if (!file) return;
    const profile = await mkdtemp(path.join(tmpdir(), 'hedes-review-tests-'));
    try {
      const child = spawn(process.execPath, ['--experimental-strip-types', '--test', file], {
        stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', HEDES_USER_DATA_DIR: profile, HEDES_PROJECTS_DIR: path.join(profile, 'projects') },
      });
      const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
      if (code !== 0) failed = true;
    } finally { await rm(profile, { recursive: true, force: true }); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
process.exitCode = failed ? 1 : 0;
