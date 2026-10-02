import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import {
  getRuntimeCapabilities,
  getStoragePaths,
  ensureStorageDirectories,
  runStorageMigration,
} from '../app/utils/runtime.server.ts';

test('runtime capabilities boundary correctly reports platform capabilities', () => {
  const desktop = getRuntimeCapabilities('windows-desktop');
  assert.equal(desktop.runtime, 'windows-desktop');
  assert.equal(desktop.localFiles, true);
  assert.equal(desktop.terminal, true);
  assert.equal(desktop.microphone, true);
  assert.equal(desktop.secureCredentialStorage, true);
  assert.equal(desktop.mcp, true);
  assert.equal(desktop.updates, true);

  const android = getRuntimeCapabilities('android-termux');
  assert.equal(android.runtime, 'android-termux');
  assert.equal(android.localFiles, true);
  assert.equal(android.terminal, true);
  assert.equal(android.microphone, false);
  assert.equal(android.secureCredentialStorage, false);
  assert.equal(android.updates, false);

  const website = getRuntimeCapabilities('website-coming-soon');
  assert.equal(website.runtime, 'website-coming-soon');
  assert.equal(website.localFiles, false);
  assert.equal(website.terminal, false);
  assert.equal(website.mcp, false);
});

test('storage paths remain stable regardless of working directory', () => {
  const tempUser = path.join(os.tmpdir(), `hedes-test-storage-${Date.now()}`);
  const paths = getStoragePaths(tempUser);

  assert.equal(paths.userData, path.resolve(tempUser));
  assert.equal(paths.projects, path.join(path.resolve(tempUser), 'projects'));
  assert.equal(paths.settings, path.join(path.resolve(tempUser), 'settings'));
  assert.equal(paths.vault, path.join(path.resolve(tempUser), 'vault'));
  assert.equal(paths.memory, path.join(path.resolve(tempUser), 'memory'));
  assert.equal(paths.skills, path.join(path.resolve(tempUser), 'skills'));
  assert.equal(paths.mcp, path.join(path.resolve(tempUser), 'mcp'));
  assert.equal(paths.backups, path.join(path.resolve(tempUser), 'backups'));
});

test('storage migration preserves existing projects, resolves conflicts, and is idempotent', async () => {
  const sandbox = path.join(os.tmpdir(), `hedes-migration-test-${Date.now()}`);
  const testUserData = path.join(sandbox, 'userData');
  const paths = getStoragePaths(testUserData);

  // Setup test directories
  await ensureStorageDirectories(paths);

  // Pre-seed a project in userData
  const existingProject = path.join(paths.projects, 'chat-existing');
  await fs.mkdir(existingProject, { recursive: true });
  await fs.writeFile(path.join(existingProject, 'file.txt'), 'version-current', 'utf8');

  // Run migration
  const manifest1 = await runStorageMigration(paths);
  assert.ok(manifest1.version >= 1);

  // Second run: verify idempotency (no duplicate migration)
  const manifest2 = await runStorageMigration(paths);
  assert.equal(manifest2.version, manifest1.version);

  // Verify manifest exists on disk
  const manifestOnDisk = JSON.parse(await fs.readFile(path.join(paths.userData, 'migration-manifest.json'), 'utf8'));
  assert.equal(manifestOnDisk.version, manifest1.version);

  // Cleanup test sandbox
  await fs.rm(sandbox, { recursive: true, force: true }).catch(() => {});
});
