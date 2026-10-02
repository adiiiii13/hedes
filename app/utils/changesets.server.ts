import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveProjectFilePath } from './project-dir.server.ts';
import { createCheckpoint, restoreCheckpoint } from './checkpoints.server.ts';
import { getStoragePaths } from './runtime.server.ts';

export interface FileChange {
  filePath: string;
  originalContent?: string;
  proposedContent: string;
  expectedHash?: string;
  status: 'pending' | 'applied' | 'conflict' | 'reverted';
  diff?: string;
}

export interface ProposedChangeSet {
  changeSetId: string;
  projectId: string;
  runId: string;
  createdAt: number;
  status: 'proposed' | 'applied' | 'rejected' | 'reverted';
  checkpointId?: string;
  changes: FileChange[];
  testResults?: {
    passed: boolean;
    command?: string;
    output?: string;
    verifiedAt?: number;
  };
}

function getChangeSetDir(projectId: string): string {
  const { userData } = getStoragePaths();
  return path.join(userData, 'changesets', projectId);
}

function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Create a proposed change set with expected baseline hashes.
 */
export async function createChangeSet(options: {
  projectId: string;
  projectDir: string;
  runId: string;
  changes: Array<{ filePath: string; proposedContent: string }>;
}): Promise<ProposedChangeSet> {
  const { projectId, projectDir, runId, changes } = options;
  const projectName = path.basename(projectDir);
  const enrichedChanges: FileChange[] = [];

  for (const ch of changes) {
    const { fullPath, cleanPath } = resolveProjectFilePath(projectDir, ch.filePath, projectName);
    let original = '';
    let hash = '';
    try {
      original = await fs.readFile(fullPath, 'utf8');
      hash = computeContentHash(original);
    } catch {
      // New file creation
    }

    enrichedChanges.push({
      filePath: cleanPath,
      originalContent: original,
      proposedContent: ch.proposedContent,
      expectedHash: hash,
      status: 'pending',
    });
  }

  const changeSetId = `cs_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const changeSet: ProposedChangeSet = {
    changeSetId,
    projectId,
    runId,
    createdAt: Date.now(),
    status: 'proposed',
    changes: enrichedChanges,
  };

  const dir = getChangeSetDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${changeSetId}.json`), JSON.stringify(changeSet, null, 2), 'utf8');

  return changeSet;
}

/**
 * Apply a proposed change set atomically with pre-application checkpoint and conflict rejection.
 */
export async function applyChangeSet(options: {
  changeSetId: string;
  projectId: string;
  projectDir: string;
}): Promise<{ success: boolean; changeSet: ProposedChangeSet; error?: string }> {
  const { changeSetId, projectId, projectDir } = options;
  const dir = getChangeSetDir(projectId);
  const filePath = path.join(dir, `${changeSetId}.json`);

  const raw = await fs.readFile(filePath, 'utf8');
  const changeSet: ProposedChangeSet = JSON.parse(raw);

  if (changeSet.status === 'applied') {
    return { success: true, changeSet, error: 'ChangeSet already applied' };
  }

  const projectName = path.basename(projectDir);

  // 1. Check for conflicts against current physical disk contents
  for (const ch of changeSet.changes) {
    const { fullPath } = resolveProjectFilePath(projectDir, ch.filePath, projectName);
    let currentContent = '';
    try {
      currentContent = await fs.readFile(fullPath, 'utf8');
    } catch {
      // New file
    }
    const currentHash = computeContentHash(currentContent);
    if (ch.expectedHash && currentHash !== ch.expectedHash) {
      ch.status = 'conflict';
      changeSet.status = 'rejected';
      await fs.writeFile(filePath, JSON.stringify(changeSet, null, 2), 'utf8');
      return {
        success: false,
        changeSet,
        error: `Conflict detected on ${ch.filePath}: file was modified since AI proposal`,
      };
    }
  }

  // 2. Create pre-apply recovery checkpoint
  const checkpoint = await createCheckpoint(projectDir, `Before ChangeSet ${changeSetId}`);
  changeSet.checkpointId = checkpoint.id;

  // 3. Commit file writes
  for (const ch of changeSet.changes) {
    const { fullPath } = resolveProjectFilePath(projectDir, ch.filePath, projectName);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, ch.proposedContent, 'utf8');
    ch.status = 'applied';
  }

  changeSet.status = 'applied';
  await fs.writeFile(filePath, JSON.stringify(changeSet, null, 2), 'utf8');

  return { success: true, changeSet };
}

/**
 * Revert an applied change set using its pre-apply checkpoint.
 */
export async function revertChangeSet(options: {
  changeSetId: string;
  projectId: string;
  projectDir: string;
}): Promise<{ success: boolean; changeSet: ProposedChangeSet }> {
  const { changeSetId, projectId, projectDir } = options;
  const dir = getChangeSetDir(projectId);
  const filePath = path.join(dir, `${changeSetId}.json`);

  const raw = await fs.readFile(filePath, 'utf8');
  const changeSet: ProposedChangeSet = JSON.parse(raw);

  if (!changeSet.checkpointId) {
    throw new Error('No pre-apply checkpoint recorded for this change set');
  }

  // Restore the pre-apply checkpoint
  await restoreCheckpoint(projectDir, changeSet.checkpointId);

  for (const ch of changeSet.changes) {
    ch.status = 'reverted';
  }
  changeSet.status = 'reverted';
  await fs.writeFile(filePath, JSON.stringify(changeSet, null, 2), 'utf8');

  return { success: true, changeSet };
}

/**
 * Record verified test/command execution results beside a change set.
 */
export async function attachTestResultToChangeSet(options: {
  changeSetId: string;
  projectId: string;
  passed: boolean;
  command: string;
  output: string;
}): Promise<ProposedChangeSet> {
  const { changeSetId, projectId, passed, command, output } = options;
  const dir = getChangeSetDir(projectId);
  const filePath = path.join(dir, `${changeSetId}.json`);

  const raw = await fs.readFile(filePath, 'utf8');
  const changeSet: ProposedChangeSet = JSON.parse(raw);

  changeSet.testResults = {
    passed,
    command,
    output: output.slice(0, 5000),
    verifiedAt: Date.now(),
  };

  await fs.writeFile(filePath, JSON.stringify(changeSet, null, 2), 'utf8');
  return changeSet;
}
