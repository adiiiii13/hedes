import { data as json, type ActionFunctionArgs } from 'react-router';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { PROJECTS_BASE, validateProjectId } from '~/utils/project-dir.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';

const execFileAsync = promisify(execFile);

function githubUrl(input: unknown): string {
  if (typeof input !== 'string') throw new Error('A GitHub repository URL is required');
  const value = input.trim();
  const expanded = /^[\w.-]+\/[\w.-]+$/.test(value) ? `https://github.com/${value}` : value;
  const url = new URL(expanded);
  const match = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.search || url.hash || !match || ['.', '..'].includes(match[1]) || ['.', '..'].includes(match[2])) {
    throw new Error('Use a public https://github.com/owner/repo URL');
  }
  return `https://github.com/${match[1]}/${match[2]}.git`;
}

export async function action({ request }: ActionFunctionArgs) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let temporaryDir: string | undefined;
  try {
    const body = await request.json();
    const repoUrl = githubUrl(body.repoUrl);
    const cleanChatId = validateProjectId(body.chatId || `chat-${Date.now()}`);
    const projectDir = path.join(PROJECTS_BASE, cleanChatId);
    await fs.mkdir(PROJECTS_BASE, { recursive: true });

    const existing = await fs.readdir(projectDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    if (existing.length > 0) {
      return json({ error: 'This project already has files. Import into a new project to keep your work safe.' }, { status: 409 });
    }

    temporaryDir = await fs.mkdtemp(path.join(PROJECTS_BASE, '.hedes-import-'));
    await execFileAsync('git', ['clone', '--depth', '1', repoUrl, temporaryDir], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    await fs.rmdir(projectDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await fs.rename(temporaryDir, projectDir);
    temporaryDir = undefined;

    return json({ success: true, message: 'Repository cloned successfully', projectDir, resolvedChatId: cleanChatId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, { status: /URL|Invalid|GitHub/.test(message) ? 400 : 500 });
  } finally {
    if (temporaryDir) await fs.rm(temporaryDir, { recursive: true, force: true });
  }
}
