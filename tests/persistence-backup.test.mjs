import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createFullBackupArchive, restoreFullBackupArchive } from '../app/utils/backup.server.ts';
import { getStoragePaths } from '../app/utils/runtime.server.ts';

test('backup archive excludes secrets and computes manifest hashes', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-backup-test-'));
  const storage = getStoragePaths(tmpRoot);

  // Setup mock project with normal files and secret files
  const projectDir = path.join(storage.projects, 'test-project');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'index.html'), '<h1>Hello</h1>', 'utf-8');
  await fs.writeFile(path.join(projectDir, '.env'), 'SECRET_API_KEY=supersecret', 'utf-8');
  await fs.writeFile(path.join(projectDir, '.env.local'), 'PRIVATE_KEY=xyz', 'utf-8');
  
  // Setup node_modules that should be excluded
  const nodeModulesDir = path.join(projectDir, 'node_modules', 'foo');
  await fs.mkdir(nodeModulesDir, { recursive: true });
  await fs.writeFile(path.join(nodeModulesDir, 'package.json'), '{}', 'utf-8');

  // Setup vault that should be excluded
  await fs.mkdir(storage.vault, { recursive: true });
  await fs.writeFile(path.join(storage.vault, '.hedes-vault.enc'), 'ENCRYPTED_VAULT_BYTES', 'utf-8');

  try {
    const { archiveBuffer, manifest } = await createFullBackupArchive(tmpRoot);

    assert.equal(manifest.version, '2.0');
    assert.ok(manifest.filesCount >= 1);
    assert.ok(manifest.manifestHash.length === 64);

    // Verify .env and vault are NOT in manifest
    const paths = Object.keys(manifest.files);
    assert.ok(!paths.some((p) => p.includes('.env')), 'Manifest must not contain .env');
    assert.ok(!paths.some((p) => p.includes('.hedes-vault')), 'Manifest must not contain vault');
    assert.ok(!paths.some((p) => p.includes('node_modules')), 'Manifest must not contain node_modules');
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('restoreFullBackupArchive verifies checksums and stages files safely', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hedes-restore-test-'));
  const storage = getStoragePaths(tmpRoot);

  const projectDir = path.join(storage.projects, 'restore-proj');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'app.js'), 'console.log("hello")', 'utf-8');

  try {
    const { archiveBuffer } = await createFullBackupArchive(tmpRoot);
    
    // Now restore into target
    const result = await restoreFullBackupArchive(archiveBuffer, tmpRoot);
    assert.ok(result.restoredCount >= 1);
    assert.equal(result.manifest.version, '2.0');
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
