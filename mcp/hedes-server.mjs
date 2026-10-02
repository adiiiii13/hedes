import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsBase = path.join(root, 'projects');
const validId = (id) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id) && id !== '..';
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

function createServer() {
  const server = new McpServer({ name: 'hedes-studio', version: '1.0.0' });
  server.registerTool('list_projects', { description: 'List Hedes Studio projects stored locally', inputSchema: z.object({}) }, async () => {
    const entries = await fs.readdir(projectsBase, { withFileTypes: true }).catch(() => []);
    return text(entries.filter((entry) => entry.isDirectory() && validId(entry.name) && !entry.name.startsWith('.')).map((entry) => entry.name));
  });
  server.registerTool('search_memory', { description: 'Search user-maintained Hedes project memory notes by keyword', inputSchema: z.object({ projectId: z.string(), query: z.string() }) }, async ({ projectId, query }) => {
    if (!validId(projectId)) throw new Error('Invalid project ID');
    const source = await fs.readFile(path.join(projectsBase, '.hedes-memory', `${projectId}.json`), 'utf8').catch(() => '{"nodes":[]}');
    const nodes = JSON.parse(source).nodes || [];
    const terms = String(query).toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [];
    const hits = nodes.map((node) => ({ node, score: terms.reduce((score, term) => score + (String(node.title).toLowerCase().includes(term) ? 5 : 0) + (String(node.content).toLowerCase().includes(term) ? 1 : 0), 0) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(({ node }) => ({ title: node.title, content: node.content, tags: node.tags }));
    return text(hits);
  });
  return server;
}

serveStdio(createServer);
