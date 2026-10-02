import { type ActionFunctionArgs } from 'react-router';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveProjectDir, resolveProjectFilePath, assertProjectPathSafe } from '~/utils/project-dir.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { atomicWriteFile, contentRevision } from '~/utils/atomic-write.server';
import { requireApproval } from '~/utils/approvals.server';
import { createCheckpoint } from '~/utils/checkpoints.server';
import { applyReviewedEdit } from '~/utils/reviewed-edits.server';

export async function loader({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId');
  const mode = url.searchParams.get('mode');
  const requestedDir = url.searchParams.get('dir');
  const requestedFile = url.searchParams.get('file');
  const searchQuery = url.searchParams.get('search');

  try {
    const { projectDir, resolvedChatId } = await resolveProjectDir(chatId);

    // 1. Lazy Directory Listing
    if (mode === 'list' || requestedDir !== null) {
      const targetRel = requestedDir || '';
      const targetAbs = path.resolve(projectDir, targetRel);
      await assertProjectPathSafe(projectDir, targetAbs);

      try {
        const rawEntries = await fs.readdir(targetAbs, { withFileTypes: true });
        const entries = [];
        for (const entry of rawEntries) {
          if (
            entry.isSymbolicLink() ||
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name.startsWith('.hedes')
          ) {
            continue;
          }
          const fullPath = path.join(targetAbs, entry.name);
          const relPath = path.relative(projectDir, fullPath).replace(/\\/g, '/');
          let size = 0;
          let mtime = 0;
          try {
            const stat = await fs.stat(fullPath);
            size = stat.size;
            mtime = stat.mtimeMs;
          } catch {}

          entries.push({
            name: entry.name,
            path: relPath,
            isDirectory: entry.isDirectory(),
            size,
            mtime,
          });
        }

        return new Response(JSON.stringify({ dir: targetRel, entries, resolvedChatId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 404 });
      }
    }

    // 2. Single File Read with 2 MB Read-Only Preview Guard
    if (requestedFile) {
      const projectName = path.basename(projectDir);
      const { fullPath } = resolveProjectFilePath(projectDir, requestedFile, projectName);
      await assertProjectPathSafe(projectDir, fullPath);
      const stat = await fs.stat(fullPath);
      const MAX_PREVIEW_BYTES = 2 * 1024 * 1024; // 2 MB
      const isReadOnlyPreview = stat.size > MAX_PREVIEW_BYTES;

      if (isReadOnlyPreview) {
        // Read bounded preview chunk (first 128 KB)
        const handle = await fs.open(fullPath, 'r');
        const buf = Buffer.alloc(128 * 1024);
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
        await handle.close();
        const previewContent = buf.subarray(0, bytesRead).toString('utf-8');

        return new Response(
          JSON.stringify({
            filePath: requestedFile,
            size: stat.size,
            isReadOnlyPreview: true,
            truncated: true,
            content: previewContent,
            message: 'File exceeds 2 MB. Showing read-only bounded preview.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return new Response(
        JSON.stringify({
          filePath: requestedFile,
          size: stat.size,
          isReadOnlyPreview: false,
          truncated: false,
          content,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Global Text Search across Project Files
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matches: Array<{ file: string; line: number; snippet: string }> = [];

      async function searchDir(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.isSymbolicLink() ||
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name.startsWith('.hedes')
          ) {
            continue;
          }
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await searchDir(full);
          } else {
            try {
              const stat = await fs.stat(full);
              if (stat.size > 1_000_000) continue;
              const content = await fs.readFile(full, 'utf-8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(query)) {
                  matches.push({
                    file: path.relative(projectDir, full).replace(/\\/g, '/'),
                    line: i + 1,
                    snippet: lines[i].trim().slice(0, 120),
                  });
                  if (matches.length >= 100) return;
                }
              }
            } catch {}
          }
        }
      }

      await searchDir(projectDir);
      return new Response(JSON.stringify({ query: searchQuery, matches }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Default: Backward-Compatible File Tree
    const result: Record<string, string> = {};
    let totalBytes = 0;

    async function readDirRecursive(dir: string, base: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isSymbolicLink() ||
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === '.vite' ||
          entry.name === 'dist' ||
          entry.name.startsWith('.env') ||
          entry.name.startsWith('.hedes')
        ) {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(base, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (totalBytes < 5_000_000) await readDirRecursive(fullPath, base);
        } else {
          try {
            const stat = await fs.stat(fullPath);
            if (stat.size > 500_000 || totalBytes + stat.size > 5_000_000) continue;
            const content = await fs.readFile(fullPath, 'utf-8');
            result[relPath] = content;
            totalBytes += stat.size;
          } catch (e) {}
        }
      }
    }

    try {
      await fs.access(projectDir);
      await readDirRecursive(projectDir, projectDir);
    } catch {}

    const revisions = Object.fromEntries(Object.entries(result).map(([name, content]) => [name, contentRevision(content)]));
    return new Response(JSON.stringify({ files: result, revisions, resolvedChatId, projectDir }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: /Invalid/.test(err.message) ? 400 : 500,
    });
  }
}

function isProtectedPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(norm);
  return (
    base === '.hedes_project.json' ||
    base === '.hedes_project.json.bak' ||
    base === '.hedes-vault.enc' ||
    base === 'hedes-vault.enc' ||
    base === '.hedes_settings.json' ||
    base === '.hedes_profile.json' ||
    base === '.hedes-mcp.json' ||
    norm.startsWith('.git/') ||
    norm === '.git'
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const { chatId, filePath, content, type } = body;

    const { projectDir, resolvedChatId } = await resolveProjectDir(chatId);

    if (request.method === 'DELETE' || type === 'delete') {
      const approval = await requireApproval(request, 'delete', { ...body, chatId: resolvedChatId });
      if (approval) return approval;
      if (filePath) {
        const { fullPath, cleanPath } = resolveProjectFilePath(projectDir, filePath, resolvedChatId);
        if (isProtectedPath(cleanPath)) throw new Error('Protected system/metadata files cannot be deleted');
        await assertNoSymlink(projectDir, fullPath);
        await createCheckpoint(projectDir, `Before deleting ${cleanPath}`);
        await fs.rm(fullPath, { recursive: true, force: true });
        return new Response('File deleted successfully', { status: 200 });
      } else {
        // Delete entire project
        if (!chatId || chatId === 'latest') throw new Error('An explicit project ID is required to delete a project');
        
        // Take a recovery snapshot before permanently removing project from disk
        try {
          const { getStoragePaths } = await import('~/utils/runtime.server.ts');
          const backupDest = path.join(getStoragePaths().backups, `pre-delete-${resolvedChatId}-${Date.now()}`);
          await fs.cp(projectDir, backupDest, { recursive: true });
        } catch (error) { throw new Error(`Recovery backup failed; deletion cancelled: ${(error as Error).message}`); }

        await fs.rm(projectDir, { recursive: true, force: true });
        return new Response('Project deleted successfully', { status: 200 });
      }
    }

    if (request.method === 'POST') {
      if (!filePath) {
        return new Response('filePath is required', { status: 400 });
      }

      const { cleanPath, fullPath } = resolveProjectFilePath(projectDir, filePath, resolvedChatId);
      if (isProtectedPath(cleanPath)) throw new Error('Protected system/metadata files cannot be modified directly');
      await assertNoSymlink(projectDir, fullPath);
      const originalContent = await fs.readFile(fullPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      const baseline = originalContent === null ? null : contentRevision(originalContent);
      if (body.expectedRevision !== undefined && body.expectedRevision !== baseline) throw new Error('File revision conflict: reload before saving');
      const approval = await requireApproval(request, 'file change', { ...body, chatId: resolvedChatId, filePath: cleanPath, originalContent });
      if (approval) return approval;
      const checkpoint = await createCheckpoint(projectDir, `Before editing ${cleanPath}`);

      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      
      const { revision, changeSetId } = await applyReviewedEdit({ projectId: resolvedChatId, runId: body.runId || null,
        approvalId: request.headers.get('X-Hedes-Approval')!, filePath: cleanPath, originalContent, proposedContent: typeof content === 'string' ? content : '' });
      
      return new Response(JSON.stringify({ success: true, revision, changeSetId, checkpointId: checkpoint.id, fullPath, cleanPath, resolvedChatId, projectDir }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

  } catch (err: any) {
    console.error('api.local.fs error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: /revision conflict/.test(err.message) ? 409 : /Invalid|must stay|Symbolic|explicit project ID/.test(err.message) ? 400 : 500 });
  }
}

async function assertNoSymlink(projectDir: string, fullPath: string): Promise<void> {
  await assertProjectPathSafe(projectDir, fullPath);
  let current = projectDir;
  for (const segment of path.relative(projectDir, fullPath).split(path.sep)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error('Symbolic links are not allowed in file actions');
  }
}
