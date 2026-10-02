import { type ActionFunctionArgs } from 'react-router';
import { jsonSchema, streamText, tool, stepCountIs } from 'ai';
import { providerRegistry } from '~/llm/registry';
import { buildHedesSystemPrompt } from '~/engine/prompt-builder';
import { buildContextBuffer, pruneMessagesForLLM, isFollowUpTurn } from '~/engine/context-engine';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import type { CustomProviderConfig } from '~/types/model';

import { resolveModelKey } from '~/utils/vault.server.ts';
import { resolveProjectDir } from '~/utils/project-dir.server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { memoryForPrompt } from '~/utils/memory.server';
import { connectMcpServer, listMcpServers } from '~/utils/mcp.server';
import type { Client } from '@modelcontextprotocol/client';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { listSkills, skillsForPrompt } from '~/utils/skills.server';
import { proposeApproval, readApproval, consumeApproval } from '~/utils/approvals.server';
import { acquireGatewaySlot } from '~/llm/gateway.server';

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const {
      messages,
      model = DEFAULT_MODEL,
      provider = DEFAULT_PROVIDER,
      apiKey,
      customProviders = [] as CustomProviderConfig[],
      hiveMindPlan,
      files = {} as Record<string, string>,    // Formula 2: current workspace files
      customSystemPrompt = '',                  // User-defined system prompt extension
      chatId,
      userProfile,
    } = body;

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200 || messages.some((message) => !message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 1_000_000)) {
      return new Response('Invalid chat messages', { status: 400 });
    }
    if (typeof provider !== 'string' || typeof model !== 'string' || !Array.isArray(customProviders)) {
      return new Response('Invalid model configuration', { status: 400 });
    }

    const resolvedApiKey = await resolveModelKey(provider, apiKey, body.credentialId);
    const isCustomProvider = customProviders.some((item: CustomProviderConfig) => item.id.toLowerCase() === String(provider).toLowerCase() || item.name.toLowerCase() === String(provider).toLowerCase());
    if (!String(provider).toLowerCase().includes('ollama') && !isCustomProvider && !resolvedApiKey) {
      return new Response('Configure an API key for the selected provider, or choose local Ollama.', { status: 400 });
    }

    // Resolve the active project directory on host disk
    const { projectDir, resolvedChatId } = await resolveProjectDir(chatId);
    const latestUserText = [...(messages || [])].reverse().find((message: any) => message.role === 'user')?.content || '';
    const memoryContext = await memoryForPrompt(resolvedChatId, String(latestUserText));
    const skillContext = skillsForPrompt(await listSkills(), String(latestUserText));

    // If client files are empty, read current files directly from active project on disk
    let activeFiles = files || {};
    if (Object.keys(activeFiles).length === 0) {
      try {
        const diskFiles: Record<string, string> = {};
        let scannedBytes = 0;
        async function scanDir(dir: string, base: string) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isSymbolicLink() || entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.vite' || entry.name === 'dist' || entry.name.startsWith('.env') || entry.name.startsWith('.hedes')) continue;
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(base, fullPath).replace(/\\/g, '/');
            if (entry.isDirectory()) {
              if (scannedBytes < 2_000_000) await scanDir(fullPath, base);
            } else {
              try {
                const stat = await fs.stat(fullPath);
                if (stat.size > 200_000 || scannedBytes + stat.size > 2_000_000) continue;
                const content = await fs.readFile(fullPath, 'utf-8');
                diskFiles[relPath] = content;
                scannedBytes += stat.size;
              } catch {}
            }
          }
        }
        await scanDir(projectDir, projectDir);
        activeFiles = diskFiles;
      } catch {}
    }

    // ── Formula 1 & 3: Prune messages — collapse old file code to "..." ─────
    const prunedMessages = pruneMessagesForLLM(messages || []);

    // ── Determine if this is a follow-up turn (modification mode) ────────────
    // Only true when conversation already has multiple turns in this chat
    const followUp = isFollowUpTurn(messages || []);

    // ── Formula 2: Build context buffer from current workspace files ─────────
    // Only provide active files context buffer when modifying an existing conversation
    const contextBuffer = followUp ? buildContextBuffer(activeFiles) : '';

    // ── Build system prompt with context, mode, and explicit project directory ─
    const systemPrompt = buildHedesSystemPrompt({
      hiveMindPlan,
      contextBuffer,
      memoryContext,
      skillContext,
      isFollowUp: followUp,
      customSystemPrompt,
      projectDir,
      projectName: resolvedChatId,
      userProfile,
    });

    const languageModel = providerRegistry.getModel(
      provider,
      model,
      {
        apiKey: resolvedApiKey,
        baseUrl: body.ollamaBaseUrl || body.baseUrl,
      },
      customProviders,
    );

    // Format pruned messages for LLM (supporting multimodal image parts)
    const formattedMessages = prunedMessages.map((m: any) => {
      if (m.images && Array.isArray(m.images) && m.images.length > 0) {
        return {
          role: m.role,
          content: [
            {
              type: 'text',
              text: m.content || 'Please analyze this image, extract all UI/UX components, layout, styling, and generate complete code for it.',
            },
            ...m.images.map((img: string) => ({
              type: 'image',
              image: img,
            })),
          ],
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    const mcpClients: Client[] = [];
    const mcpTools: Record<string, any> = {};
    for (const server of (await listMcpServers()).filter((item) => item.enabled && item.allowToolCalls)) {
      try {
        const connectionPayload = { projectId: resolvedChatId, operation: 'connect', serverId: server.id, command: server.command, args: server.args };
        const connectionApproval = await proposeApproval('mcp', connectionPayload);
        for (;;) {
          if (request.signal.aborted) throw new Error('MCP connection cancelled');
          const decision = await readApproval(connectionApproval.id);
          if (decision.status === 'rejected') throw new Error('MCP connection rejected');
          if (decision.status === 'approved') break;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        await consumeApproval(connectionApproval.id, 'mcp', connectionPayload);
        const client = await connectMcpServer(server);
        mcpClients.push(client);
        const listed = await client.listTools();
        for (const remoteTool of listed.tools) {
          const localName = `mcp_${server.id.replace(/-/g, '').slice(0, 8)}_${remoteTool.name.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 64);
          mcpTools[localName] = tool({
            description: `${server.name}: ${remoteTool.description || remoteTool.name}`,
            inputSchema: jsonSchema(remoteTool.inputSchema as any),
            execute: async (args) => {
              const payload = { projectId: resolvedChatId, runId: body.runId || null, serverId: server.id, tool: remoteTool.name, arguments: args };
              const approval = await proposeApproval('mcp', payload);
              for (;;) {
                if (request.signal.aborted) throw new Error('MCP request cancelled');
                const current = await readApproval(approval.id);
                if (current.status === 'rejected') return { error: 'User rejected this MCP action' };
                if (current.status === 'approved') break;
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              await consumeApproval(approval.id, 'mcp', payload);
              const result = await client.callTool({ name: remoteTool.name, arguments: args as Record<string, unknown> });
              return result;
            },
          });
        }
      } catch (error) {
        console.warn(`MCP server ${server.name} unavailable:`, error);
      }
    }

    const slot = await acquireGatewaySlot({
      provider,
      credentialId: body.credentialId,
      explicitApiKey: apiKey,
      estimatedTokens: 2048,
      signal: request.signal,
    });

    const result = streamText({
      model: languageModel,
      system: systemPrompt,
      messages: formattedMessages,
      tools: mcpTools,
      stopWhen: stepCountIs(4),
      maxOutputTokens: 8192,
      temperature: 0.2,
      onFinish: async () => {
        slot.release();
        await Promise.allSettled(mcpClients.map((client) => client.close()));
      },
    });

    return result.toTextStreamResponse();
  } catch (err: any) {
    console.error('api.chat action error:', err);
    return new Response(
      err?.message || 'Internal error while contacting LLM provider',
      { status: 500 },
    );
  }
}
