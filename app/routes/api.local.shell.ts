import { type ActionFunctionArgs } from 'react-router';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveProjectDir } from '~/utils/project-dir.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { startWebsite, stopWebsite } from '~/utils/website-runner.server';
import { requireApproval } from '~/utils/approvals.server';

const activeDevServers = new Map<string, { pid: number; kill: () => void }>();

function getSanitizedProcessEnv(): Record<string, string> {
  const allowedKeys = new Set([
    'PATH', 'PATHEXT', 'TEMP', 'TMP', 'SYSTEMROOT', 'SYSTEMDRIVE',
    'COMSPEC', 'USERPROFILE', 'HOME', 'HOMEPATH', 'HOMEDRIVE',
    'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'NODE_ENV', 'APPDATA',
    'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
    'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)', 'WINDIR',
    'OS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER',
    'NUMBER_OF_PROCESSORS', 'PSMODULEPATH', 'SHELL', 'COLORTERM',
    'FORCE_COLOR', 'ELECTRON_NO_ATTACH_CONSOLE',
  ]);

  const cleanEnv: Record<string, string> = { FORCE_COLOR: '1' };
  for (const [key, value] of Object.entries(globalThis.process.env)) {
    if (typeof value !== 'string') continue;
    const upper = key.toUpperCase();
    if (
      upper.includes('KEY') ||
      upper.includes('SECRET') ||
      upper.includes('TOKEN') ||
      upper.includes('AUTH') ||
      upper.includes('PASS') ||
      upper.includes('CREDENTIAL') ||
      upper.includes('VAULT')
    ) {
      continue;
    }
    if (allowedKeys.has(upper) || (!upper.startsWith('npm_config_') && !upper.startsWith('HEDES_'))) {
      cleanEnv[key] = value;
    }
  }
  return cleanEnv;
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await request.json();
  const { chatId, command, cwd: requestedCwd, shellType = 'powershell', systemMode = false } = body;

  if (typeof command !== 'string' || command.length > 10000) {
    return new Response('command is required', { status: 400 });
  }

  const trimmed = command.trim();
  const { projectDir, resolvedChatId } = await resolveProjectDir(chatId);
  const approval = await requireApproval(request, 'command', { ...body, chatId: resolvedChatId });
  if (approval) return approval;

  const websiteCommand = /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:dev|start)(?:\s|$)|(?:npx\s+)?vite(?:\s|$))/i.test(trimmed);
  if (websiteCommand || /^stop\s+website$/i.test(trimmed)) {
    try {
      const status = websiteCommand ? await startWebsite(resolvedChatId) : await stopWebsite(resolvedChatId);
      const lines = websiteCommand
        ? [{ type: 'stdout', data: `Website running: ${status.url}\r\nCommand: ${status.command}\r\n${status.logs.slice(-8).join('\r\n')}\r\n` }, { type: 'url', data: status.url || '' }, { type: 'exit', data: '0' }]
        : [{ type: 'stdout', data: 'Website stopped.\r\n' }, { type: 'exit', data: '0' }];
      return new Response(lines.map((line) => JSON.stringify(line)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' } });
    } catch (error) {
      return new Response(`${JSON.stringify({ type: 'error', data: (error as Error).message })}\n${JSON.stringify({ type: 'exit', data: '1' })}\n`, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' } });
    }
  }

  // If starting a dev server, clean up any existing dev server for this project to prevent port proliferation
  const isDevServer = /(?:^|\s)(?:dev|start|vite)(?:\s|$)/i.test(trimmed);
  if (isDevServer && activeDevServers.has(resolvedChatId)) {
    const prev = activeDevServers.get(resolvedChatId);
    if (prev) {
      try {
        prev.kill();
      } catch {}
      activeDevServers.delete(resolvedChatId);
    }
  }

  // Validate working directory
  let workingDir = projectDir;
  if (requestedCwd && typeof requestedCwd === 'string') {
    try {
      const stats = await fs.stat(requestedCwd);
      const relative = path.relative(projectDir, path.resolve(requestedCwd));
      if (stats.isDirectory() && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        workingDir = requestedCwd;
      }
    } catch {
      workingDir = projectDir;
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (type: string, data: string) => {
        try {
          const payload = JSON.stringify({ type, data });
          controller.enqueue(encoder.encode(payload + '\n'));
        } catch {}
      };

      // ── Handle built-in "cd" command ───────────────────────────────────────
      if (trimmed === 'cd' || trimmed.startsWith('cd ')) {
        const target = trimmed === 'cd' ? projectDir : trimmed.slice(3).trim().replace(/^["']|["']$/g, '');

        if (!target || target === '~') {
          send('cwd', projectDir);
          send('exit', '0');
          controller.close();
          return;
        }

        const candidate = path.resolve(workingDir, target);
        try {
          const s = await fs.stat(candidate);
          const relative = path.relative(projectDir, candidate);
          if (s.isDirectory() && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            send('cwd', candidate);
            send('exit', '0');
          } else {
            send('stderr', `cd: not a directory: ${target}\r\n`);
            send('exit', '1');
          }
        } catch {
          send('stderr', `cd: no such file or directory: ${target}\r\n`);
          send('exit', '1');
        }
        controller.close();
        return;
      }


      // ── Spawn Process with appropriate shell ──────────────────────────────
      try {
        let child: any;
        const processEnv = getSanitizedProcessEnv() as NodeJS.ProcessEnv;

        if (globalThis.process.platform === 'win32') {
          if (shellType === 'cmd') {
            child = spawn('cmd.exe', ['/d', '/s', '/c', trimmed], {
              cwd: workingDir,
              env: processEnv,
            });
          } else {
            // Default to PowerShell for universal modern command support (ls, pwd, cat, dir, npm, git, etc.)
            child = spawn('powershell.exe', [
              '-NoLogo',
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-Command',
              trimmed,
            ], {
              cwd: workingDir,
              env: processEnv,
            });
          }
        } else {
          child = spawn(trimmed, [], {
            shell: true,
            cwd: workingDir,
            env: processEnv,
            detached: true,
          });
        }

        const killChild = () => {
          try {
            if (globalThis.process.platform === 'win32' && child.pid) {
              spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
            } else if (child.pid) {
              process.kill(-child.pid);
            }
          } catch {}
        };

        if (isDevServer && child.pid) {
          activeDevServers.set(resolvedChatId, { pid: child.pid, kill: killChild });
        }

        child.stdout.on('data', (data: Buffer) => {
          send('stdout', data.toString());
        });

        child.stderr.on('data', (data: Buffer) => {
          send('stderr', data.toString());
        });

        child.on('error', (error: Error) => {
          send('error', error.message);
        });

        child.on('close', (code: number | null) => {
          if (activeDevServers.get(resolvedChatId)?.pid === child.pid) {
            activeDevServers.delete(resolvedChatId);
          }
          send('exit', code !== null ? code.toString() : '0');
          controller.close();
        });

        // Long-running process notification
        if (isDevServer) {
          send('system', 'Long-running process started');
        }

        request.signal.addEventListener('abort', () => {
          killChild();
        });

      } catch (err: any) {
        send('error', err.message || 'Failed to spawn process');
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
