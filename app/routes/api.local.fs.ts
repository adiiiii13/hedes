import { type ActionFunctionArgs } from '@remix-run/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeFilePath, resolveProjectDir } from '~/utils/project-dir.server';

export async function loader({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId');

  const { projectDir, resolvedChatId } = await resolveProjectDir(chatId);

  try {
    const result: Record<string, string> = {};
    
    async function readDirRecursive(dir: string, base: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.vite' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(base, fullPath).replace(/\\/g, '/');
        
        if (entry.isDirectory()) {
          await readDirRecursive(fullPath, base);
        } else {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            result[relPath] = content;
          } catch (e) {}
        }
      }
    }
    
    try {
      await fs.access(projectDir);
      await readDirRecursive(projectDir, projectDir);
    } catch {}
    
    return new Response(JSON.stringify({ files: result, resolvedChatId, projectDir }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, resolvedChatId, projectDir }), { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const { chatId, filePath, content, type } = body;

    const { projectDir, resolvedChatId } = await resolveProjectDir(chatId);

    if (request.method === 'DELETE' || type === 'delete') {
      if (filePath) {
        const cleanPath = normalizeFilePath(filePath, resolvedChatId);
        const fullPath = path.join(projectDir, cleanPath);
        // Security check
        if (!fullPath.startsWith(projectDir)) {
          return new Response('Invalid path', { status: 403 });
        }
        await fs.rm(fullPath, { recursive: true, force: true });
        return new Response('File deleted successfully', { status: 200 });
      } else {
        // Delete entire project
        await fs.rm(projectDir, { recursive: true, force: true });
        return new Response('Project deleted successfully', { status: 200 });
      }
    }

    if (request.method === 'POST') {
      if (!filePath) {
        return new Response('filePath is required', { status: 400 });
      }

      const cleanPath = normalizeFilePath(filePath, resolvedChatId);
      const fullPath = path.join(projectDir, cleanPath);
      
      // Prevent directory traversal
      if (!fullPath.startsWith(projectDir)) {
        return new Response('Invalid path', { status: 403 });
      }

      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(fullPath, content || '', 'utf-8');
      
      return new Response(JSON.stringify({ success: true, fullPath, cleanPath, resolvedChatId, projectDir }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

  } catch (err: any) {
    console.error('api.local.fs error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
