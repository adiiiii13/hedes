import { type ActionFunctionArgs } from '@remix-run/node';
import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const PROJECTS_BASE = path.resolve(process.cwd(), 'projects');

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { chatId, repoUrl } = await request.json();

    if (!chatId || !repoUrl) {
      return new Response('chatId and repoUrl are required', { status: 400 });
    }

    let cleanUrl = repoUrl.trim();
    // Handle owner/repo shorthand (e.g., "facebook/react" or "vitejs/vite")
    if (/^[\w.-]+\/[\w.-]+$/.test(cleanUrl)) {
      cleanUrl = `https://github.com/${cleanUrl}`;
    }
    // Handle github.com/owner/repo without protocol
    if (/^github\.com\/[\w.-]+\/[\w.-]+/.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }
    // Strip trailing .git
    cleanUrl = cleanUrl.replace(/\.git\/?$/, '');

    // Validate GitHub URL
    if (!/^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(cleanUrl)) {
      return new Response(JSON.stringify({ error: 'Invalid GitHub repository URL. Use https://github.com/owner/repo or owner/repo' }), { status: 400 });
    }

    const cleanChatId = path.basename(chatId);
    const projectDir = path.join(PROJECTS_BASE, cleanChatId);

    // Make sure projects base exists
    await fs.mkdir(PROJECTS_BASE, { recursive: true });

    // Remove existing directory to ensure clean clone
    await fs.rm(projectDir, { recursive: true, force: true });
    
    // Fast shallow clone of main/master branch into project directory
    await execAsync(`git clone --depth 1 "${cleanUrl}.git" "${projectDir}"`);

    // Remove .git folder so we don't nest repos or confuse the AI
    const gitFolder = path.join(projectDir, '.git');
    await fs.rm(gitFolder, { recursive: true, force: true }).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      message: 'Repository cloned successfully',
      projectDir,
      resolvedChatId: cleanChatId,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('api.local.github error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
