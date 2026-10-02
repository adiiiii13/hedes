import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLED_CATALOG,
  getStoreCatalog,
  installStoreItem,
  toggleStoreItem,
  rollbackStoreItem,
  uninstallStoreItem,
  createBridgeSession,
  verifyBridgeSession,
} from '../app/utils/store.server.ts';

test('Stage 10: Bundled curated catalog is available offline and contains MCP, skills, and plugins', async () => {
  const catalog = await getStoreCatalog();
  assert.ok(catalog.items.length >= 6);

  const categories = new Set(catalog.items.map((i) => i.category));
  assert.equal(categories.has('mcp'), true);
  assert.equal(categories.has('skill'), true);
  assert.equal(categories.has('plugin'), true);

  for (const item of catalog.items) {
    assert.ok(item.id);
    assert.ok(item.name);
    assert.ok(item.publisher);
    assert.ok(item.repository);
    assert.ok(item.license);
    assert.ok(item.pinnedVersion);
    assert.ok(Array.isArray(item.supportedPlatforms));
    assert.ok(Array.isArray(item.requiredPermissions));
    assert.equal(typeof item.mayCharge, 'boolean');
  }
});

test('Stage 10: Store installation enforces permission approval gate', async () => {
  const targetId = 'mcp-filesystem';

  // Attempt install without required permissions
  await assert.rejects(
    async () => {
      await installStoreItem(targetId, []);
    },
    /unapproved permissions/
  );

  // Attempt install with required permissions approved
  const approved = await installStoreItem(targetId, ['fs:read', 'fs:write']);
  assert.equal(approved.success, true);
  assert.equal(approved.item.installedVersion, '0.6.2');
  assert.equal(approved.item.enabled, true);
});

test('Stage 10: Installed store item supports enable/disable toggle, rollback, and clean uninstall', async () => {
  const targetId = 'skill-git-workflow';

  // 1. Install
  await installStoreItem(targetId, ['terminal:git']);
  let catalog = await getStoreCatalog();
  let item = catalog.items.find((i) => i.id === targetId);
  assert.equal(item?.installedVersion, '1.0.0');
  assert.equal(item?.enabled, true);

  // 2. Disable
  await toggleStoreItem(targetId, false);
  catalog = await getStoreCatalog();
  item = catalog.items.find((i) => i.id === targetId);
  assert.equal(item?.enabled, false);

  // 3. Uninstall
  await uninstallStoreItem(targetId);
  catalog = await getStoreCatalog();
  item = catalog.items.find((i) => i.id === targetId);
  assert.equal(item?.installedVersion, null);
  assert.equal(item?.health, 'not_installed');
});

test('Stage 10: VS Code external bridge generates ephemeral session tokens and isolates projects', () => {
  const projA = 'project-alpha';
  const projB = 'project-beta';

  const sessionA = createBridgeSession(projA);
  assert.ok(sessionA.token);
  assert.equal(sessionA.projectId, projA);

  // Valid session for ProjA
  assert.equal(verifyBridgeSession(sessionA.token, projA), true);

  // Cross-project rejection: token for ProjA cannot access ProjB
  assert.equal(verifyBridgeSession(sessionA.token, projB), false);

  // Bogus token rejection
  assert.equal(verifyBridgeSession('non-existent-token', projA), false);
});
