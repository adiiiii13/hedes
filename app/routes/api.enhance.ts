import { type ActionFunctionArgs } from '@remix-run/node';
import { generateText } from 'ai';
import { providerRegistry } from '~/llm/registry';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';

function resolveServerApiKey(provider: string, clientKey?: string): string | undefined {
  if (clientKey && clientKey.trim()) return clientKey.trim();

  const p = provider.toLowerCase();
  if (p === 'groq') return process.env.GROQ_API_KEY;
  if (p === 'grok' || p === 'xai') return process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (p === 'openai') return process.env.OPENAI_API_KEY;
  if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (p === 'google') return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (p === 'openrouter') return process.env.OPENROUTER_API_KEY;

  return undefined;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const {
      prompt,
      provider = DEFAULT_PROVIDER,
      model = DEFAULT_MODEL,
      apiKey,
      customProviders,
    } = await request.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), { status: 400 });
    }

    const resolvedApiKey = resolveServerApiKey(provider, apiKey);

    const languageModel = providerRegistry.getModel(
      provider,
      model,
      { apiKey: resolvedApiKey },
      customProviders,
    );

    const { text } = await generateText({
      model: languageModel,
      system: `You are an expert prompt engineer and software architect. Your task is to expand the user's raw idea into a rich, detailed, and production-ready technical specification for building a full-stack modern web application.

Rules:
1. Preserve the user's core idea and requirements faithfully.
2. Outline specific UI/UX details (aesthetic theme, typography, color palette, animations, micro-interactions).
3. Detail key interactive components, user flows, and state management.
4. Mention realistic mock data or API integrations if relevant.
5. Keep the enhanced prompt concise, structured with clean markdown bullet points, and directly usable as an input for an AI web application generator.
6. Do NOT write boilerplate code or preamble like "Here is the prompt:". Output ONLY the enhanced prompt itself.`,
      prompt: `Original idea: ${prompt}`,
      maxTokens: 1000,
      temperature: 0.7,
    });

    return new Response(JSON.stringify({ enhancedPrompt: text.trim() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Enhance prompt error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
