import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import lockfile from 'proper-lockfile';
import { atomicWriteFile, contentRevision } from './atomic-write.server.ts';
import { getStoragePaths } from './runtime.server.ts';
import { resolveProjectDir, resolveProjectFilePath, assertProjectPathSafe, validateProjectId } from './project-dir.server.ts';

interface ReviewedEdit {
  id: string; projectId: string; runId: string | null; approvalId: string; filePath: string;
  originalContent: string | null; proposedContent: string; status: 'prepared' | 'applied' | 'reverted'; createdAt: number;
}
function recordPath(projectId: string, id: string) {
  validateProjectId(projectId);
  if (!/^edit-[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid edit ID');
  return path.join(getStoragePaths().userData, 'changesets', projectId, `${id}.json`);
}
export async function readReviewedEdit(projectId: string, id: string): Promise<ReviewedEdit> {
  return JSON.parse(await fs.readFile(recordPath(projectId, id), 'utf8'));
}
export async function applyReviewedEdit(input: Omit<ReviewedEdit, 'id' | 'status' | 'createdAt'>) {
  const record: ReviewedEdit = { ...input, id: `edit-${crypto.randomUUID()}`, status: 'prepared', createdAt: Date.now() };
  const target = recordPath(record.projectId, record.id);
  await atomicWriteFile(target, JSON.stringify(record));
  const { projectDir } = await resolveProjectDir(record.projectId);
  const { fullPath } = resolveProjectFilePath(projectDir, record.filePath, record.projectId);
  await assertProjectPathSafe(projectDir, fullPath);
  const revision = await atomicWriteFile(fullPath, record.proposedContent, record.originalContent === null ? null : contentRevision(record.originalContent));
  record.status = 'applied';
  await atomicWriteFile(target, JSON.stringify(record));
  return { revision, changeSetId: record.id };
}
export async function undoReviewedEdit(projectId: string, id: string) {
  const record = await readReviewedEdit(projectId, id);
  if (record.status === 'reverted') throw new Error('Edit already reverted');
  const { projectDir } = await resolveProjectDir(projectId);
  const { fullPath } = resolveProjectFilePath(projectDir, record.filePath, projectId);
  await assertProjectPathSafe(projectDir, fullPath);
  if (record.originalContent === null) {
    const release = await lockfile.lock(fullPath, { realpath: false, retries: 20 });
    try {
      if (contentRevision(await fs.readFile(fullPath)) !== contentRevision(record.proposedContent)) throw new Error('File revision conflict: changed after this edit');
      await fs.unlink(fullPath);
    } finally { await release(); }
  } else {
    await atomicWriteFile(fullPath, record.originalContent, contentRevision(record.proposedContent));
  }
  record.status = 'reverted';
  await atomicWriteFile(recordPath(projectId, id), JSON.stringify(record));
  return record;
}
