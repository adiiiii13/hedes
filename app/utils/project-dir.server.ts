import { promises as fs } from 'node:fs';
import path from 'node:path';

// We store projects inside projects/ on the actual host filesystem.
// e.g., C:/Users/adity/OneDrive/Desktop/HedesStudio/projects/<chatId>
export const PROJECTS_BASE = path.resolve(process.cwd(), 'projects');

export function normalizeFilePath(rawPath: string, projectName: string): string {
  let p = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  // Strip /home/project or home/project
  p = p.replace(/^(?:\/)?home\/project\//i, '');
  // Strip project/ if present
  if (p.toLowerCase().startsWith('project/')) {
    p = p.slice('project/'.length);
  }
  // Strip projects/<projectName>/ or <projectName>/
  if (p.toLowerCase().startsWith(`projects/${projectName.toLowerCase()}/`)) {
    p = p.slice(`projects/${projectName}/`.length);
  } else if (p.toLowerCase().startsWith(`${projectName.toLowerCase()}/`)) {
    p = p.slice(`${projectName}/`.length);
  }
  // Strip leading ./
  p = p.replace(/^\.\//, '');
  return p;
}

export async function resolveProjectDir(chatId?: string | null): Promise<{ projectDir: string; resolvedChatId: string }> {
  await fs.mkdir(PROJECTS_BASE, { recursive: true });

  // Handle absolute path passed directly as chatId
  if (chatId && path.isAbsolute(chatId)) {
    try {
      await fs.access(chatId);
      return { projectDir: chatId, resolvedChatId: path.basename(chatId) };
    } catch {}
  }

  if (chatId && chatId !== 'undefined' && chatId !== 'null' && chatId !== 'latest') {
    const cleanId = path.basename(chatId);
    const candidate = path.join(PROJECTS_BASE, cleanId);
    await fs.mkdir(candidate, { recursive: true });
    return { projectDir: candidate, resolvedChatId: cleanId };
  }

  // Find existing projects in PROJECTS_BASE
  try {
    const entries = await fs.readdir(PROJECTS_BASE, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && e.name.startsWith('chat-'));
    if (dirs.length > 0) {
      const dirsWithTime = await Promise.all(
        dirs.map(async (d) => {
          const stat = await fs.stat(path.join(PROJECTS_BASE, d.name));
          return { name: d.name, mtime: stat.mtimeMs };
        })
      );
      dirsWithTime.sort((a, b) => b.mtime - a.mtime);
      const latest = dirsWithTime[0].name;
      return { projectDir: path.join(PROJECTS_BASE, latest), resolvedChatId: latest };
    }
  } catch {}

  const newId = chatId && chatId !== 'latest' ? path.basename(chatId) : `chat-${Date.now()}`;
  const fallbackDir = path.join(PROJECTS_BASE, newId);
  await fs.mkdir(fallbackDir, { recursive: true });
  return { projectDir: fallbackDir, resolvedChatId: newId };
}
