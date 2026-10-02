import { atomicWriteFile } from './atomic-write.server.ts';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDefaultUserDataDir } from './runtime.server.ts';
import { listMcpServers, saveMcpServers, type McpServerConfig, validateMcpServer } from './mcp.server.ts';
import { saveSkill, listSkills, deleteSkill } from './skills.server.ts';

export type StoreCategory = 'mcp' | 'skill' | 'plugin';

export interface StoreItem {
  id: string;
  name: string;
  category: StoreCategory;
  description: string;
  publisher: string;
  repository: string;
  license: string;
  pinnedVersion: string;
  supportedPlatforms: Array<'win32' | 'linux' | 'darwin' | 'android'>;
  requiredRuntime: 'node' | 'python' | 'binary' | 'builtin';
  requiredPermissions: string[];
  requiredCredentials: string[];
  mayCharge: boolean;
  installedVersion: string | null;
  enabled: boolean;
  health: 'healthy' | 'unhealthy' | 'not_installed' | 'connecting';
  hasUpdate: boolean;
  availableVersion?: string;
  permissionEscalation?: boolean;
}

export interface StoreCatalogState {
  items: StoreItem[];
  externalEditor: {
    preferred: 'vscode' | 'vscodium' | 'cursor' | 'custom';
    customPath?: string;
    installed: boolean;
  };
}

export interface BridgeSession {
  token: string;
  projectId: string;
  expiresAt: number;
}

// In-memory ephemeral bridge sessions
const activeBridgeSessions = new Map<string, BridgeSession>();

// Curated Bundled Catalog (Always available 100% offline)
export const BUNDLED_CATALOG: StoreItem[] = [
  {
    id: 'mcp-filesystem',
    name: 'Project Filesystem Server',
    category: 'mcp',
    description: 'Model Context Protocol server for secure project file access and navigation.',
    publisher: 'Anthropic / MCP Core',
    repository: 'https://github.com/modelcontextprotocol/servers',
    license: 'MIT',
    pinnedVersion: '0.6.2',
    supportedPlatforms: ['win32', 'linux', 'darwin', 'android'],
    requiredRuntime: 'node',
    requiredPermissions: ['fs:read', 'fs:write'],
    requiredCredentials: [],
    mayCharge: false,
    installedVersion: null,
    enabled: false,
    health: 'not_installed',
    hasUpdate: false,
  },
  {
    id: 'mcp-sequential-thinking',
    name: 'Sequential Thinking Server',
    category: 'mcp',
    description: 'Dynamic step-by-step reasoning and hypothesis revision tool for complex tasks.',
    publisher: 'Anthropic / MCP Core',
    repository: 'https://github.com/modelcontextprotocol/servers',
    license: 'MIT',
    pinnedVersion: '0.6.2',
    supportedPlatforms: ['win32', 'linux', 'darwin', 'android'],
    requiredRuntime: 'node',
    requiredPermissions: ['memory:read', 'memory:write'],
    requiredCredentials: [],
    mayCharge: false,
    installedVersion: null,
    enabled: false,
    health: 'not_installed',
    hasUpdate: false,
  },
  {
    id: 'mcp-fetch',
    name: 'Contextual Web Fetch Server',
    category: 'mcp',
    description: 'Safe web page fetching and markdown conversion tool.',
    publisher: 'Anthropic / MCP Core',
    repository: 'https://github.com/modelcontextprotocol/servers',
    license: 'MIT',
    pinnedVersion: '0.6.2',
    supportedPlatforms: ['win32', 'linux', 'darwin'],
    requiredRuntime: 'node',
    requiredPermissions: ['network:http'],
    requiredCredentials: [],
    mayCharge: false,
    installedVersion: null,
    enabled: false,
    health: 'not_installed',
    hasUpdate: false,
  },
  {
    id: 'skill-git-workflow',
    name: 'Git Branch & Release Automation',
    category: 'skill',
    description: 'Standardized git flow instructions for staging, branch creation, and conflict handling.',
    publisher: 'Hedes Team',
    repository: 'https://github.com/adiiiii13/hedes',
    license: 'MIT',
    pinnedVersion: '1.0.0',
    supportedPlatforms: ['win32', 'linux', 'darwin', 'android'],
    requiredRuntime: 'builtin',
    requiredPermissions: ['terminal:git'],
    requiredCredentials: [],
    mayCharge: false,
    installedVersion: null,
    enabled: false,
    health: 'not_installed',
    hasUpdate: false,
  },
  {
    id: 'skill-code-review',
    name: 'Rigorous Architecture Review',
    category: 'skill',
    description: 'Evaluation framework for analyzing code changes against security and performance gates.',
    publisher: 'Hedes Team',
    repository: 'https://github.com/adiiiii13/hedes',
    license: 'MIT',
    pinnedVersion: '1.0.0',
    supportedPlatforms: ['win32', 'linux', 'darwin', 'android'],
    requiredRuntime: 'builtin',
    requiredPermissions: ['fs:read'],
    requiredCredentials: [],
    mayCharge: false,
    installedVersion: null,
    enabled: false,
    health: 'not_installed',
    hasUpdate: false,
  },
  {
    id: 'plugin-syntax-diagnostics',
    name: 'TypeScript & JavaScript Local Diagnostics',
    category: 'plugin',
    description: 'Native background diagnostic provider using local compiler diagnostics.',
    publisher: 'Hedes Team',
    repository: 'https://github.com/adiiiii13/hedes',
    license: 'MIT',
    pinnedVersion: '1.0.0',
    supportedPlatforms: ['win32', 'linux', 'darwin'],
    requiredRuntime: 'node',
    requiredPermissions: ['fs:read', 'lsp:diagnostics'],
    requiredCredentials: [],
    mayCharge: false,
    installedVersion: null,
    enabled: false,
    health: 'not_installed',
    hasUpdate: false,
  },
];

function getStoreDataPath(): string {
  return path.join(getDefaultUserDataDir(), 'store', 'installed.json');
}

export interface InstalledStoreRecord {
  id: string;
  version: string;
  approvedPermissions: string[];
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
  health: 'healthy' | 'unhealthy' | 'not_installed' | 'connecting';
  previousVersion?: string;
}

export async function listInstalledRecords(): Promise<Record<string, InstalledStoreRecord>> {
  const storePath = getStoreDataPath();
  try {
    const raw = await fs.readFile(storePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveInstalledRecords(records: Record<string, InstalledStoreRecord>): Promise<void> {
  const storePath = getStoreDataPath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await atomicWriteFile(storePath, JSON.stringify(records, null, 2));
}

export async function getStoreCatalog(): Promise<StoreCatalogState> {
  const installed = await listInstalledRecords();
  const mcpServers = await listMcpServers();

  const items = BUNDLED_CATALOG.map((item) => {
    const record = installed[item.id];
    const isMcp = item.category === 'mcp';
    const mcpConfig = isMcp ? mcpServers.find((s) => s.id === item.id || s.pluginId === item.id) : null;

    let installedVersion = record ? record.version : null;
    let enabled = record ? record.enabled : false;
    let health = record ? record.health : 'not_installed';

    if (mcpConfig) {
      installedVersion = item.pinnedVersion;
      enabled = mcpConfig.enabled;
      health = record?.health || 'connecting';
    }

    // Detect permission escalation if availableVersion needs more permissions than approved
    let permissionEscalation = false;
    if (record && item.availableVersion && item.availableVersion !== record.version) {
      const extraPermissions = item.requiredPermissions.filter((p) => !record.approvedPermissions.includes(p));
      if (extraPermissions.length > 0) {
        permissionEscalation = true;
      }
    }

    return {
      ...item,
      installedVersion,
      enabled,
      health: (installedVersion ? health : 'not_installed') as StoreItem['health'],
      hasUpdate: Boolean(item.availableVersion && item.availableVersion !== installedVersion),
      permissionEscalation,
    };
  });

  return {
    items,
    externalEditor: {
      preferred: 'vscode',
      installed: true,
    },
  };
}

export async function installStoreItem(
  itemId: string,
  approvedPermissions: string[]
): Promise<{ success: boolean; item: StoreItem; error?: string }> {
  const catalog = await getStoreCatalog();
  const target = catalog.items.find((i) => i.id === itemId);
  if (!target) {
    throw new Error(`Store item not found: ${itemId}`);
  }

  // Validate that all required permissions were explicitly approved
  const unapproved = target.requiredPermissions.filter((p) => !approvedPermissions.includes(p));
  if (unapproved.length > 0) {
    throw new Error(`Cannot install ${target.name}: unapproved permissions: [${unapproved.join(', ')}]`);
  }

  const installed = await listInstalledRecords();
  const previous = installed[itemId];

  // Perform lightweight health verification on installation
  let health: 'healthy' | 'unhealthy' | 'connecting' = 'connecting';
  try {
    if (target.category === 'mcp') {
      if (target.id === 'mcp-fetch') throw new Error('Fetch server requires a separate Python runtime; use a custom MCP configuration.');
      const packageName = `@modelcontextprotocol/server-${target.id.replace(/^mcp-/, '')}@${target.pinnedVersion}`;
      const packageArgs = ['-y', packageName, ...(target.id === 'mcp-filesystem' ? [path.join(getDefaultUserDataDir(), 'projects')] : [])];
      let mcpList = await listMcpServers();
      const existingIdx = mcpList.findIndex((s) => s.id === itemId || s.pluginId === itemId);
      const newConfig: McpServerConfig = {
        id: itemId,
        name: target.name,
        command: process.platform === 'win32' ? 'cmd.exe' : 'npx',
        args: process.platform === 'win32' ? ['/d', '/s', '/c', 'npx', ...packageArgs] : packageArgs,
        enabled: true,
        allowToolCalls: approvedPermissions.includes('tools:execute'),
        pluginId: itemId,
      };

      if (existingIdx >= 0) {
        mcpList[existingIdx] = newConfig;
      } else {
        mcpList.push(newConfig);
      }
      await saveMcpServers(mcpList);
    } else if (target.category === 'skill') {
      await saveSkill({ name: target.id, description: target.description, status: 'installed', enabled: true,
        permissions: approvedPermissions, version: target.pinnedVersion,
        instructions: target.id === 'skill-git-workflow'
          ? 'Inspect git status and the diff before editing. Preserve unrelated work. Verify changes before commit. Do not force push or publish without authorization. Report conflicts and actual test evidence.'
          : 'Read changed code and its callers. Reproduce suspected defects. Prioritize correctness, security and data preservation. Report concrete findings with file references. Never claim tests were run without execution evidence.' });
      health = 'healthy';
    } else {
      throw new Error('This diagnostic plugin has no executable implementation yet.');
    }
  } catch (err) {
    throw err;
  }

  installed[itemId] = {
    id: itemId,
    version: target.pinnedVersion,
    approvedPermissions,
    enabled: true,
    installedAt: previous?.installedAt || Date.now(),
    updatedAt: Date.now(),
    health,
    previousVersion: previous?.version,
  };

  await saveInstalledRecords(installed);

  const updatedCatalog = await getStoreCatalog();
  const updatedItem = updatedCatalog.items.find((i) => i.id === itemId)!;

  return { success: true, item: updatedItem };
}

export async function toggleStoreItem(itemId: string, enabled: boolean): Promise<StoreItem> {
  const installed = await listInstalledRecords();
  const record = installed[itemId];
  if (!record) {
    throw new Error(`Item ${itemId} is not installed`);
  }

  record.enabled = enabled;
  const skill = (await listSkills()).find(s => s.name === itemId);
  if (skill) await saveSkill({ ...skill, enabled });
  record.updatedAt = Date.now();
  await saveInstalledRecords(installed);

  // If MCP, update MCP servers config
  let mcpList = await listMcpServers();
  const mcpConfig = mcpList.find((s) => s.id === itemId || s.pluginId === itemId);
  if (mcpConfig) {
    mcpConfig.enabled = enabled;
    await saveMcpServers(mcpList);
  }

  const catalog = await getStoreCatalog();
  return catalog.items.find((i) => i.id === itemId)!;
}

export async function rollbackStoreItem(itemId: string): Promise<StoreItem> {
  const installed = await listInstalledRecords();
  const record = installed[itemId];
  if (!record || !record.previousVersion) {
    throw new Error(`No previous version to rollback to for item: ${itemId}`);
  }

  record.version = record.previousVersion;
  record.updatedAt = Date.now();
  delete record.previousVersion;
  await saveInstalledRecords(installed);

  const catalog = await getStoreCatalog();
  return catalog.items.find((i) => i.id === itemId)!;
}

export async function uninstallStoreItem(itemId: string): Promise<void> {
  if ((await listSkills()).some(s => s.name === itemId)) await deleteSkill(itemId);
  const installed = await listInstalledRecords();
  delete installed[itemId];
  await saveInstalledRecords(installed);

  // Remove from MCP servers if it was an MCP server
  let mcpList = await listMcpServers();
  const filtered = mcpList.filter((s) => s.id !== itemId && s.pluginId !== itemId);
  if (filtered.length !== mcpList.length) {
    await saveMcpServers(filtered);
  }
}

/**
 * Ephemeral bridge session management for VS Code / VSCodium companion
 */
export function createBridgeSession(projectId: string): BridgeSession {
  const token = crypto.randomBytes(24).toString('hex');
  const session: BridgeSession = {
    token,
    projectId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 4, // 4 hours
  };
  activeBridgeSessions.set(token, session);
  return session;
}

export function verifyBridgeSession(token: string, projectId: string): boolean {
  const session = activeBridgeSessions.get(token);
  if (!session) return false;
  if (session.projectId !== projectId) return false;
  if (Date.now() > session.expiresAt) {
    activeBridgeSessions.delete(token);
    return false;
  }
  return true;
}
