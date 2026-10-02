import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getStoragePaths } from './runtime.server.ts';

// We store projects inside projects/ in the authoritative userData directory.
// Outside the replaceable app/installer folder, so upgrades cannot erase work.
export const PROJECTS_BASE = path.resolve(process.env.HEDES_PROJECTS_DIR || getStoragePaths().projects);

export async function assertProjectPathSafe(projectDir: string, fullPath: string): Promise<void> {
  const relative = path.relative(projectDir, fullPath);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Path must stay inside the project');
  }
  let current = projectDir;
  for (const segment of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error('Symbolic links are not allowed in project access');
  }
}

export function validateProjectId(chatId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(chatId) || chatId === '.' || chatId === '..') {
    throw new Error('Invalid project ID');
  }
  return chatId;
}

export function normalizeFilePath(rawPath: string, projectName: string): string {
  if (typeof rawPath !== 'string' || !rawPath || rawPath.includes('\0')) {
    throw new Error('Invalid file path');
  }
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
  if (/^[a-zA-Z]:/.test(p) || p.split('/').some((part) => part === '..')) {
    throw new Error('File path must stay inside the project');
  }
  const normalized = path.posix.normalize(p);
  if (normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    throw new Error('Invalid file path');
  }
  return normalized;
}

export function resolveProjectFilePath(projectDir: string, filePath: string, projectName: string): { fullPath: string; cleanPath: string } {
  const cleanPath = normalizeFilePath(filePath, projectName);
  const fullPath = path.resolve(projectDir, cleanPath);
  const relative = path.relative(projectDir, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('File path must stay inside the project');
  }
  return { fullPath, cleanPath };
}

export async function resolveProjectDir(chatId?: string | null): Promise<{ projectDir: string; resolvedChatId: string }> {
  await fs.mkdir(PROJECTS_BASE, { recursive: true });

  if (chatId && chatId !== 'undefined' && chatId !== 'null' && chatId !== 'latest') {
    const cleanId = validateProjectId(chatId);
    const candidate = path.join(PROJECTS_BASE, cleanId);
    await assertProjectPathSafe(PROJECTS_BASE, candidate);
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

  const newId = `chat-${Date.now()}`;
  const fallbackDir = path.join(PROJECTS_BASE, newId);
  await fs.mkdir(fallbackDir, { recursive: true });
  return { projectDir: fallbackDir, resolvedChatId: newId };
}
