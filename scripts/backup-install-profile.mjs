import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const source = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'hedes-studio');
const destination = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Hedes Studio Recovery', 'review-2026-10-01', 'profile');
const excluded = new Set(['node_modules', '.git', 'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'logs', 'Logs', 'Shared Dictionary', 'lockfile']);
await mkdir(path.dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true, force: false, errorOnExist: false,
  filter: entry => !path.relative(source, entry).split(path.sep).some(segment => excluded.has(segment)),
});
await writeFile('output/review-profile-backup.json', JSON.stringify({ completedAt: new Date().toISOString(), source, destination, excluded: [...excluded] }, null, 2));
console.log('Profile backup completed:', destination);
