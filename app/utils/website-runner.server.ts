import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { resolveProjectDir } from './project-dir.server.ts';

export interface WebsiteStatus {
  running: boolean;
  url: string | null;
  command: string | null;
  error: string | null;
  logs: string[];
}

interface WebsiteSession extends WebsiteStatus { child: ChildProcess; port: number; }
const sessions = new Map<string, WebsiteSession>();
const starts = new Map<string, Promise<WebsiteStatus>>();

(globalThis as typeof globalThis & { __hedesStopWebsites?: () => void }).__hedesStopWebsites = () => {
  for (const session of sessions.values()) stopProcess(session.child);
  sessions.clear();
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not choose a preview port'));
      server.close(() => resolve(address.port));
    });
  });
}

function stopProcess(child: ChildProcess): void {
  if (!child.pid) return;
  if (globalThis.process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true });
    killer.on('error', () => undefined);
  } else {
    child.kill('SIGTERM');
  }
}

export function getWebsiteStatus(projectId: string): WebsiteStatus {
  const session = sessions.get(projectId);
  if (!session) return { running: false, url: null, command: null, error: null, logs: [] };
  const { running, url, command, error, logs } = session;
  return { running, url, command, error, logs: [...logs] };
}

export async function stopWebsite(projectId: string): Promise<WebsiteStatus> {
  const session = sessions.get(projectId);
  if (session) {
    sessions.delete(projectId);
    stopProcess(session.child);
  }
  return getWebsiteStatus(projectId);
}

export async function startWebsite(projectId: string): Promise<WebsiteStatus> {
  const existingStart = starts.get(projectId);
  if (existingStart) return existingStart;
  const existing = sessions.get(projectId);
  if (existing?.running) return getWebsiteStatus(projectId);
  const operation = startWebsiteOnce(projectId);
  starts.set(projectId, operation);
  try { return await operation; }
  finally { starts.delete(projectId); }
}

async function startWebsiteOnce(projectId: string): Promise<WebsiteStatus> {
  await stopWebsite(projectId);
  const { projectDir } = await resolveProjectDir(projectId);
  const packagePath = path.join(projectDir, 'package.json');
  let manifest: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try { manifest = JSON.parse(await fs.readFile(packagePath, 'utf8')); }
  catch { throw new Error('No package.json found. Create a web project before starting its server.'); }
  const script = manifest.scripts?.dev ? 'dev' : manifest.scripts?.start ? 'start' : null;
  if (!script) throw new Error('package.json needs a dev or start script.');
  const needsDependencies = Object.keys(manifest.dependencies || {}).length + Object.keys(manifest.devDependencies || {}).length > 0;
  if (needsDependencies && !(await fs.stat(path.join(projectDir, 'node_modules')).catch(() => null))?.isDirectory()) {
    throw new Error('Dependencies are missing. Run npm install in the project terminal first.');
  }
  const port = await freePort();
  const isVite = /\bvite\b/i.test(manifest.scripts?.[script] || '') || Boolean(manifest.dependencies?.vite || manifest.devDependencies?.vite);
  const isNext = /\bnext\b/i.test(manifest.scripts?.[script] || '');
  const command = isVite ? `npm run ${script} -- --host 127.0.0.1 --port ${port} --strictPort` : isNext ? `npm run ${script} -- --hostname 127.0.0.1 --port ${port}` : `npm run ${script}`;
  const projectEnv = Object.fromEntries(Object.entries(globalThis.process.env).filter(([key]) =>
    !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|HEDES_/i.test(key))) as NodeJS.ProcessEnv;
  const child = globalThis.process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd: projectDir, windowsHide: true, env: { ...projectEnv, PORT: String(port), BROWSER: 'none', FORCE_COLOR: '0' } })
    : spawn('sh', ['-c', command], { cwd: projectDir, env: { ...projectEnv, PORT: String(port), BROWSER: 'none', FORCE_COLOR: '0' } });
  const session: WebsiteSession = { child, port, running: false, url: null, command, error: null, logs: [] };
  sessions.set(projectId, session);
  const addLog = (chunk: Buffer) => {
    const lines = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    session.logs.push(...lines);
    session.logs = session.logs.slice(-60);
    const found = lines.join(' ').match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i);
    if (found && !isVite && !isNext) {
      try {
        const parsed = new URL(found[0]);
        const hedesPort = Number(globalThis.process.env.PORT || '5174');
        if (parsed.port !== String(hedesPort) && parsed.port !== '5173') {
          session.url = found[0].replace('localhost', '127.0.0.1');
        }
      } catch {}
    }
  };
  child.stdout?.on('data', addLog);
  child.stderr?.on('data', addLog);
  child.on('error', (error) => { session.error = error.message; session.running = false; });
  child.on('close', (code) => {
    session.running = false;
    if (!session.error) session.error = `Website process exited with code ${code ?? 'unknown'}.`;
  });

  const candidate = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (session.error) break;
    try {
      const response = await fetch(session.url || candidate, { signal: AbortSignal.timeout(800) });
      if (response.ok) {
        session.running = true;
        session.url = session.url || candidate;
        return getWebsiteStatus(projectId);
      }
    } catch { /* Wait for the actual project server. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const reason = session.error || `Website did not become ready. ${session.logs.slice(-5).join(' ')}`;
  await stopWebsite(projectId);
  throw new Error(reason);
}
