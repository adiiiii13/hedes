import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { PROJECTS_BASE } from './project-dir.server.ts';
import { getStoragePaths } from './runtime.server.ts';

export interface McpServerConfig {
  id: string;
  name: string;
  transport?: 'stdio' | 'sse' | 'http';
  url?: string;
  command: string;
  args: string[];
  enabled: boolean;
  allowToolCalls: boolean;
  pluginId?: string;
  allowedDirectories?: string[];
}

const configPath = path.join(getStoragePaths().mcp, 'mcp-servers.json');
const legacyConfigPath = path.join(PROJECTS_BASE, '.hedes-mcp.json');

export const RECOMMENDED_MCP = [
  { id: 'filesystem', name: 'Project Filesystem', description: 'Read and edit files in the active project folder.', packageName: '@modelcontextprotocol/server-filesystem@0.6.2' },
  { id: 'sequential-thinking', name: 'Sequential Thinking', description: 'Structured step by step reasoning tools.', packageName: '@modelcontextprotocol/server-sequential-thinking@0.6.2' },
  { id: 'memory', name: 'Knowledge Graph Memory', description: 'Persistent local knowledge graph tools.', packageName: '@modelcontextprotocol/server-memory@0.6.2' },
] as const;

export function recommendedMcpConfig(id: string): McpServerConfig {
  const item = RECOMMENDED_MCP.find((candidate) => candidate.id === id);
  if (!item) throw new Error('Recommended MCP server not found');
  const packageArgs = ['-y', item.packageName, ...(id === 'filesystem' ? [PROJECTS_BASE] : [])];
  return validateMcpServer({
    name: item.name,
    transport: 'stdio',
    command: process.platform === 'win32' ? 'cmd.exe' : 'npx',
    args: process.platform === 'win32' ? ['/d', '/s', '/c', 'npx', ...packageArgs] : packageArgs,
    enabled: true,
    allowToolCalls: true,
  });
}

export async function listMcpServers(): Promise<McpServerConfig[]> {
  try {
    let raw: string;
    try {
      raw = await fs.readFile(configPath, 'utf8');
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        raw = await fs.readFile(legacyConfigPath, 'utf8');
      } else {
        throw e;
      }
    }
    const value = JSON.parse(raw);
    return Array.isArray(value.servers) ? value.servers : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  const mcpDir = path.dirname(configPath);
  await fs.mkdir(mcpDir, { recursive: true });
  const temporary = `${configPath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ version: 1, servers }, null, 2));
  await fs.rename(temporary, configPath);
}

export function validateMcpServer(input: Partial<McpServerConfig>): McpServerConfig {
  const name = String(input.name || '').trim().slice(0, 80);
  const transport = input.transport === 'sse' || input.transport === 'http' ? input.transport : 'stdio';
  const url = typeof input.url === 'string' ? input.url.trim() : undefined;
  const command = String(input.command || '').trim();
  const args = Array.isArray(input.args) ? input.args : [];

  if (!name || (transport === 'stdio' && (!command || command.length > 500 || /[\r\n\0]/.test(command)))) {
    throw new Error('Name and executable are required');
  }
  if (transport === 'sse' || transport === 'http') {
    if (!url || !/^https?:\/\//i.test(url)) throw new Error('Valid HTTP or SSE URL is required');
  } else {
    if (args.length > 30 || args.some((arg) => typeof arg !== 'string' || arg.length > 1000 || arg.includes('\0'))) throw new Error('Arguments must be a JSON string array');
  }

  return {
    id: /^[a-f0-9-]{36}$/i.test(String(input.id || '')) ? String(input.id) : randomUUID(),
    name,
    transport,
    url,
    command: command || '',
    args,
    enabled: input.enabled === true,
    allowToolCalls: input.allowToolCalls === true,
    pluginId: typeof input.pluginId === 'string' ? input.pluginId : undefined,
    allowedDirectories: Array.isArray(input.allowedDirectories) ? input.allowedDirectories : undefined,
  };
}

export async function connectMcpServer(config: McpServerConfig, activeProjectDir?: string): Promise<Client> {
  if (!config.enabled) throw new Error('MCP server is disabled');
  if (!config.allowToolCalls) throw new Error('Tool calls are not permitted for this MCP server');

  const client = new Client({ name: 'hedes-studio', version: '1.0.0' });
  let transport: any;

  if (config.transport === 'sse' || (config.url && config.transport !== 'stdio')) {
    const { SSEClientTransport } = await import('@modelcontextprotocol/client');
    transport = new SSEClientTransport(new URL(config.url!));
  } else {
    const mcpCwd = activeProjectDir || getStoragePaths().userData;
    // Bind filesystem server strictly to activeProjectDir
    const effectiveArgs = [...(config.args || [])];
    if (config.id === 'filesystem' || config.name.toLowerCase().includes('filesystem')) {
      const targetDir = activeProjectDir || PROJECTS_BASE;
      const lastArg = effectiveArgs[effectiveArgs.length - 1];
      if (lastArg === PROJECTS_BASE && activeProjectDir) {
        effectiveArgs[effectiveArgs.length - 1] = activeProjectDir;
      }
    }
    transport = new StdioClientTransport({ command: config.command, args: effectiveArgs, cwd: mcpCwd, stderr: 'pipe' });
  }

  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('MCP connection timed out')), 10000)),
    ]);
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export async function checkMcpHealth(config: McpServerConfig, activeProjectDir?: string): Promise<{
  healthy: boolean;
  latencyMs: number;
  toolCount: number;
  error?: string;
}> {
  const start = Date.now();
  let client: Client | null = null;
  try {
    client = await connectMcpServer(config, activeProjectDir);
    const listed = await client.listTools();
    const latencyMs = Date.now() - start;
    return {
      healthy: true,
      latencyMs,
      toolCount: listed.tools.length,
    };
  } catch (err: any) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      toolCount: 0,
      error: err.message,
    };
  } finally {
    if (client) {
      await client.close().catch(() => undefined);
    }
  }
}
