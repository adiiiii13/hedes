import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { getStoragePaths } from './runtime.server.ts';
import { assertProjectPathSafe } from './project-dir.server.ts';
import { atomicWriteFile } from './atomic-write.server.ts';
import { readBoundedZip } from './bounded-zip.server.ts';
import { beginRestore } from './restore-recovery.server.ts';

export interface BackupManifest {
  version: '2.0';
  createdAt: number;
  filesCount: number;
  totalBytes: number;
  manifestHash: string;
  excludedPatterns: string[];
  files: Record<string, { size: number; sha256: string }>;
}

const EXCLUDED_PATTERNS = [
  'node_modules',
  '.git',
  '.vite',
  'dist',
  'build',
  '.next',
  '.hedes-vault.enc',
  'hedes-vault.enc',
  '.env',
];

function shouldExclude(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(normalized);

  if (base.startsWith('.env')) return true;
  if (base === '.hedes-vault.enc' || base === 'hedes-vault.enc') return true;

  for (const pattern of EXCLUDED_PATTERNS) {
    if (
      normalized === pattern ||
      normalized.startsWith(`${pattern}/`) ||
      normalized.includes(`/${pattern}/`) ||
      normalized.endsWith(`/${pattern}`)
    ) {
      return true;
    }
  }
  return false;
}

function computeBufferSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function createFullBackupArchive(customUserData?: string): Promise<{ archiveBuffer: Buffer; manifest: BackupManifest }> {
  const storage = getStoragePaths(customUserData);
  const zip = new JSZip();
  const fileManifest: Record<string, { size: number; sha256: string }> = {};
  let totalBytes = 0;
  let filesCount = 0;

  async function addDirectory(dirPath: string, zipPrefix: string): Promise<void> {
    const exists = await fs.stat(dirPath).catch(() => null);
    if (!exists || !exists.isDirectory()) return;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relative = path.join(zipPrefix, entry.name).replace(/\\/g, '/');

      if (shouldExclude(relative)) continue;

      if (entry.isDirectory()) {
        await addDirectory(fullPath, relative);
      } else if (entry.isFile()) {
        const fileStat = await fs.stat(fullPath);
        // Exclude single files over 50MB from backup
        if (fileStat.size > 50 * 1024 * 1024) continue;

        const content = await fs.readFile(fullPath);
        const sha256 = computeBufferSha256(content);
        fileManifest[relative] = { size: fileStat.size, sha256 };
        zip.file(relative, content);
        totalBytes += fileStat.size;
        filesCount += 1;
        if (totalBytes > 500 * 1024 * 1024 || filesCount > 50000) throw new Error('Backup exceeds 500MB or 50000 files');
      }
    }
  }

  // 1. Projects
  await addDirectory(storage.projects, 'projects');
  // 2. Memory
  await addDirectory(storage.memory, 'memory');
  // 3. Skills
  await addDirectory(storage.skills, 'skills');
  // 4. Sessions
  await addDirectory(storage.sessions, 'sessions');
  // 5. Settings (excluding secrets)
  await addDirectory(storage.settings, 'settings');
  for (const category of ['mcp', 'plugins', 'tasks', 'store', 'changesets']) {
    await addDirectory(path.join(storage.userData, category), category);
  }

  const rawManifest: Omit<BackupManifest, 'manifestHash'> = {
    version: '2.0',
    createdAt: Date.now(),
    filesCount,
    totalBytes,
    excludedPatterns: EXCLUDED_PATTERNS,
    files: fileManifest,
  };

  const manifestHash = crypto.createHash('sha256').update(JSON.stringify(rawManifest)).digest('hex');
  const finalManifest: BackupManifest = { ...rawManifest, manifestHash };

  zip.file('manifest.json', JSON.stringify(finalManifest, null, 2));

  const archiveBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { archiveBuffer, manifest: finalManifest };
}

export async function restoreFullBackupArchive(archiveBuffer: Buffer, customUserData?: string): Promise<{
  restoredCount: number;
  conflicts: string[];
  manifest: BackupManifest;
}> {
  // Enforce size limit on archive
  if (archiveBuffer.length > 500 * 1024 * 1024) {
    throw new Error('Backup archive exceeds 500MB safety limit');
  }

  const zip = await readBoundedZip(archiveBuffer).catch(error => { throw new Error(`Invalid backup archive: ${error.message}`); });
  const manifestFile = zip.get('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup archive: manifest.json is missing');
  }

  const manifestContent = manifestFile.toString('utf8');
  const manifest = JSON.parse(manifestContent) as BackupManifest;

  if (manifest.version !== '2.0') {
    throw new Error(`Unsupported backup version: ${manifest.version}`);
  }
  const { manifestHash, ...unsignedManifest } = manifest;
  if (!manifest.files || typeof manifest.files !== 'object' ||
      crypto.createHash('sha256').update(JSON.stringify(unsignedManifest)).digest('hex') !== manifestHash) {
    throw new Error('Backup manifest integrity check failed');
  }
  if (Object.keys(manifest.files).length > 50000 || manifest.totalBytes > 500 * 1024 * 1024) {
    throw new Error('Backup expanded size or file count exceeds safety limit');
  }

  const storage = getStoragePaths(customUserData);
  const stagingDir = path.join(storage.backups, `restore-staging-${Date.now()}`);
  await fs.mkdir(stagingDir, { recursive: true });

  const conflicts: string[] = [];
  let transaction: Awaited<ReturnType<typeof beginRestore>> | undefined;
  let restoredCount = 0;
  let expandedBytes = 0;

  try {
    for (const [relativePath, buffer] of zip) {
      if (relativePath === 'manifest.json') continue;

      // Prevent directory traversal or absolute escapes
      const originalPath = relativePath.replace(/\\/g, '/');
      const normalized = path.normalize(relativePath);
      if (path.isAbsolute(normalized) || /^[a-z]:/i.test(originalPath) ||
          originalPath.startsWith('/') || originalPath.split('/').includes('..') ||
          !/^(projects|memory|skills|sessions|settings|mcp|plugins|tasks|store|changesets)\//.test(originalPath)) {
        throw new Error(`Path traversal attempt detected in archive: ${relativePath}`);
      }

      if (shouldExclude(normalized)) continue;

      const expectedInfo = manifest.files[relativePath];
      if (!expectedInfo || !Number.isSafeInteger(expectedInfo.size) || expectedInfo.size < 0 || expectedInfo.size > 50 * 1024 * 1024) {
        throw new Error(`Unmanifested or oversized backup file: ${relativePath}`);
      }
      expandedBytes += buffer.length;
      if (buffer.length !== expectedInfo.size || expandedBytes > 500 * 1024 * 1024) {
        throw new Error('Backup expanded size does not match manifest or exceeds safety limit');
      }

      if (expectedInfo) {
        const actualHash = computeBufferSha256(buffer);
        if (actualHash !== expectedInfo.sha256) {
          throw new Error(`Checksum mismatch for file in archive: ${relativePath}`);
        }
      }

      const stagingFilePath = path.join(stagingDir, normalized);
      await fs.mkdir(path.dirname(stagingFilePath), { recursive: true });
      await fs.writeFile(stagingFilePath, buffer);
      restoredCount += 1;
    }

    if (restoredCount !== Object.keys(manifest.files).length || restoredCount !== manifest.filesCount || expandedBytes !== manifest.totalBytes) {
      throw new Error('Backup is incomplete: file count or total size does not match manifest');
    }
    // Move from staging to authoritative destinations, rolling back if any commit fails.
    transaction = await beginRestore(storage.userData);
    async function commitStagedDir(srcDir: string, destDir: string): Promise<void> {
      const exists = await fs.stat(srcDir).catch(() => null);
      if (!exists || !exists.isDirectory()) return;

      await fs.mkdir(destDir, { recursive: true });
      const entries = await fs.readdir(srcDir, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        await assertProjectPathSafe(storage.userData, destPath);

        if (entry.isDirectory()) {
          await commitStagedDir(srcPath, destPath);
        } else if (entry.isFile()) {
          // If dest exists and differs, note conflict
          const destStat = await fs.stat(destPath).catch(() => null);
          if (destStat) {
            conflicts.push(path.relative(storage.userData, destPath));
          }
          const original = destStat ? await fs.readFile(destPath) : null;
          await transaction!.record(destPath, original);
          await atomicWriteFile(destPath, await fs.readFile(srcPath));
        }
      }
    }

    await commitStagedDir(path.join(stagingDir, 'projects'), storage.projects);
    await commitStagedDir(path.join(stagingDir, 'memory'), storage.memory);
    await commitStagedDir(path.join(stagingDir, 'skills'), storage.skills);
    await commitStagedDir(path.join(stagingDir, 'sessions'), storage.sessions);
    await commitStagedDir(path.join(stagingDir, 'settings'), storage.settings);
    for (const category of ['mcp', 'plugins', 'tasks', 'store', 'changesets']) {
      await commitStagedDir(path.join(stagingDir, category), path.join(storage.userData, category));
    }

    await transaction.finish();
    transaction = undefined;
    return { restoredCount, conflicts, manifest };
  } catch (error) {
    await transaction?.abort();
    throw error;
  } finally {
    // Cleanup staging
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
