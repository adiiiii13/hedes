import { type ActionFunctionArgs } from '@remix-run/node';
import { streamText } from 'ai';
import { providerRegistry } from '~/llm/registry';
import { buildHedesSystemPrompt } from '~/engine/prompt-builder';
import { buildContextBuffer, pruneMessagesForLLM, isFollowUpTurn } from '~/engine/context-engine';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import type { CustomProviderConfig } from '~/types/model';

function resolveServerApiKey(provider: string, clientKey?: string): string | undefined {
  if (clientKey && clientKey.trim()) return clientKey.trim();

  const p = provider.toLowerCase();
  if (p === 'groq') return process.env.GROQ_API_KEY;
  if (p === 'grok' || p === 'xai') return process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (p === 'openai') return process.env.OPENAI_API_KEY;
  if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (p === 'google') return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (p === 'openrouter') return process.env.OPENROUTER_API_KEY;
  if (p.includes('deepseek')) return process.env.DEEPSEEK_API_KEY;
  if (p.includes('mistral')) return process.env.MISTRAL_API_KEY;
  if (p.includes('together')) return process.env.TOGETHER_API_KEY;

  return undefined;
}
import { resolveProjectDir } from '~/utils/project-dir.server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function action({ request }: ActionFunctionArgs) {
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

    const resolvedApiKey = resolveServerApiKey(provider, apiKey);

    // Resolve the active project directory on host disk
    const { projectDir, resolvedChatId } = await resolveProjectDir(chatId);

    // If client files are empty, read current files directly from active project on disk
    let activeFiles = files || {};
    if (Object.keys(activeFiles).length === 0) {
      try {
        const diskFiles: Record<string, string> = {};
        async function scanDir(dir: string, base: string) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.vite' || entry.name === 'dist') continue;
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(base, fullPath).replace(/\\/g, '/');
            if (entry.isDirectory()) {
              await scanDir(fullPath, base);
            } else {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                diskFiles[relPath] = content;
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

    const result = streamText({
      model: languageModel,
      system: systemPrompt,
      messages: formattedMessages,
      maxTokens: 8192,
      temperature: 0.2,
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
