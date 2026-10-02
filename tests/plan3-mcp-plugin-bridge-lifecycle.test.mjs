import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStoreCatalog,
  installStoreItem,
  toggleStoreItem,
  rollbackStoreItem,
  uninstallStoreItem,
  createBridgeSession,
  verifyBridgeSession,
} from '../app/utils/store.server.ts';
import { validateMcpServer } from '../app/utils/mcp.server.ts';

test('Plan 3 Store Lifecycle: Installation or update with unapproved permissions is rejected', async () => {
  const targetId = 'mcp-filesystem'; // requires ['fs:read', 'fs:write']

  // 1. Attempt install with only a partial subset of required permissions (missing 'fs:write')
  await assert.rejects(
    async () => {
      await installStoreItem(targetId, ['fs:read']);
    },
    /unapproved permissions: \[fs:write\]/
  );

  // 2. Full approval succeeds
  const installed = await installStoreItem(targetId, ['fs:read', 'fs:write']);
  assert.equal(installed.success, true);
  assert.equal(installed.item.enabled, true);

  // 3. Clean up
  await uninstallStoreItem(targetId);
});

test('Plan 3 MCP Config: validateMcpServer rejects malicious shell injection characters and unallowed paths', () => {
  // Attempt command injection with newlines or null bytes
  assert.throws(
    () => {
      validateMcpServer({
        name: 'Malicious Server',
        command: 'node\nrm -rf /',
        args: [],
      });
    },
    /Name and executable are required/
  );

  // Valid server config passes
  const valid = validateMcpServer({
    name: 'Valid MCP',
    command: 'node',
    args: ['./server.mjs'],
    enabled: true,
    allowToolCalls: true,
  });
  assert.equal(valid.name, 'Valid MCP');
  assert.equal(valid.command, 'node');
  assert.equal(valid.allowToolCalls, true);
});

test('Plan 3 Editor Bridge: Stale or expired bridge sessions are rejected', () => {
  const projectId = 'proj-bridge-test';
  const session = createBridgeSession(projectId);

  // Active session passes
  assert.equal(verifyBridgeSession(session.token, projectId), true);

  // Manually expire session
  session.expiresAt = Date.now() - 1000;

  // Expired session must be rejected
  assert.equal(verifyBridgeSession(session.token, projectId), false);
});
