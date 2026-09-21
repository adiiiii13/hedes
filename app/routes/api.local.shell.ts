import { type ActionFunctionArgs } from '@remix-run/node';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveProjectDir } from '~/utils/project-dir.server';

const activeDevServers = new Map<string, { pid: number; kill: () => void }>();

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { chatId, command, cwd: requestedCwd, shellType = 'powershell' } = await request.json();

  if (!command && command !== '') {
    return new Response('command is required', { status: 400 });
  }

  const trimmed = (command || '').trim();
  const { projectDir, resolvedChatId } = await resolveProjectDir(chatId);

  // If starting a dev server, clean up any existing dev server for this project to prevent port proliferation
  const isDevServer = trimmed.includes('dev') || trimmed.includes('start') || trimmed.includes('vite');
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
      if (stats.isDirectory()) {
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
          if (s.isDirectory()) {
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

        if (process.platform === 'win32') {
          if (shellType === 'cmd') {
            child = spawn('cmd.exe', ['/d', '/s', '/c', trimmed], {
              cwd: workingDir,
              env: { ...process.env, FORCE_COLOR: '1' },
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
              env: { ...process.env, FORCE_COLOR: '1' },
            });
          }
        } else {
          child = spawn(trimmed, {
            shell: true,
            cwd: workingDir,
            env: { ...process.env, FORCE_COLOR: '1' },
            detached: true,
          });
        }

        const killChild = () => {
          try {
            if (process.platform === 'win32' && child.pid) {
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

