import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  connectMcpServer,
  listMcpServers,
  saveMcpServers,
  validateMcpServer,
  RECOMMENDED_MCP,
  recommendedMcpConfig,
  checkMcpHealth,
} from '~/utils/mcp.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { requireApproval } from '~/utils/approvals.server';
import { resolveProjectDir } from '~/utils/project-dir.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  return json({ servers: await listMcpServers(), recommended: RECOMMENDED_MCP });
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    const servers = await listMcpServers();
    if (body.action === 'install-recommended') {
      const config = recommendedMcpConfig(String(body.id || ''));
      if (!servers.some((server) => server.name === config.name)) {
        if (servers.length >= 20) throw new Error('Maximum of 20 MCP servers');
        servers.push(config);
        await saveMcpServers(servers);
      }
      return json({ servers: await listMcpServers() });
    }
    if (body.action === 'save') {
      const config = validateMcpServer(body.server || {});
      const index = servers.findIndex((server) => server.id === config.id);
      if (index < 0 && servers.length >= 20) throw new Error('Maximum of 20 MCP servers');
      if (index >= 0) servers[index] = config;
      else servers.push(config);
      await saveMcpServers(servers);
      return json({ servers });
    }
    if (body.action === 'delete') {
      await saveMcpServers(servers.filter((server) => server.id !== body.id));
      return json({ servers: await listMcpServers() });
    }
    if (body.action === 'health' || body.action === 'health-check') {
      const server = servers.find((item) => item.id === body.id);
      if (!server) throw new Error('MCP server not found');
      let projectDir: string | undefined;
      if (body.projectId) {
        const resolved = await resolveProjectDir(body.projectId);
        projectDir = resolved.projectDir;
      }
      const health = await checkMcpHealth(server, projectDir);
      return json(health);
    }
    if (body.action === 'test') {
      const server = servers.find((item) => item.id === body.id);
      if (!server) throw new Error('MCP server not found');
      const approval = await requireApproval(request, 'MCP connection', { serverId: server.id, command: server.command, args: server.args });
      if (approval) return approval;
      let projectDir: string | undefined;
      if (body.projectId) {
        const resolved = await resolveProjectDir(body.projectId);
        projectDir = resolved.projectDir;
      }
      const client = await connectMcpServer(server, projectDir);
      try {
        const result = await client.listTools();
        return json({ tools: result.tools.map((item) => ({ name: item.name, description: item.description || '' })) });
      } finally {
        await client.close();
      }
    }
    throw new Error('Unknown MCP action');
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 400 });
  }
}
