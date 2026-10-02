import { data as json, type ActionFunctionArgs } from 'react-router';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { listMcpServers, saveMcpServers } from '~/utils/mcp.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';

import { getStoragePaths } from '~/utils/runtime.server';

const appRoot = path.resolve(process.env.HEDES_APP_PATH || process.cwd());
const bundledPluginsDir = path.join(appRoot, 'plugins');
const userPluginsDir = getStoragePaths().plugins;

interface Plugin { id: string; name: string; description: string; entry: string; installed?: boolean }

async function scanPluginsDir(dir: string, allowedRoot: string, configured: any[]): Promise<Plugin[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const list: Plugin[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) continue;
    try {
      const pluginFolder = path.join(dir, entry.name);
      const manifestPath = path.join(pluginFolder, 'hedes-plugin.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      if (manifest.id !== entry.name || typeof manifest.name !== 'string' || typeof manifest.description !== 'string' || typeof manifest.entry !== 'string') continue;
      const resolved = path.resolve(pluginFolder, manifest.entry);
      const relative = path.relative(path.resolve(allowedRoot), resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !resolved.endsWith('.mjs')) continue;
      if (!(await fs.stat(resolved)).isFile()) continue;
      list.push({
        id: manifest.id,
        name: manifest.name.slice(0, 80),
        description: manifest.description.slice(0, 300),
        entry: resolved,
        installed: configured.some((item) => item.pluginId === manifest.id),
      });
    } catch { /* Ignore invalid local manifests */ }
  }
  return list;
}

async function catalog(): Promise<Plugin[]> {
  const configured = await listMcpServers();
  const bundled = await scanPluginsDir(bundledPluginsDir, appRoot, configured);
  const userInstalled = await scanPluginsDir(userPluginsDir, userPluginsDir, configured);

  const merged = new Map<string, Plugin>();
  for (const p of bundled) merged.set(p.id, p);
  for (const p of userInstalled) merged.set(p.id, p);

  return Array.from(merged.values());
}

export async function loader({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  return json({ plugins: await catalog() });
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    const plugin = (await catalog()).find((item) => item.id === body.id);
    if (!plugin) throw new Error('Plugin not found');
    let servers = await listMcpServers();
    if (body.action === 'install' && !plugin.installed) servers.push({ id: randomUUID(), name: plugin.name, command: 'node', args: [plugin.entry], enabled: true, allowToolCalls: false, pluginId: plugin.id });
    else if (body.action === 'uninstall') servers = servers.filter((server) => server.pluginId !== plugin.id);
    else if (body.action !== 'install') throw new Error('Unknown plugin action');
    await saveMcpServers(servers);
    return json({ plugins: await catalog() });
  } catch (error) { return json({ error: (error as Error).message }, { status: 400 }); }
}
