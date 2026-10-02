import { type ActionFunctionArgs } from 'react-router';
import { generateText } from 'ai';
import { HUMAN_PERSONAS_100 } from '~/engine/personifications';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import type { CustomProviderConfig } from '~/types/model';
import { executeWithGateway } from '~/llm/gateway.server';

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    if (body.mode !== 'direct') return new Response('Use /api/agents for the 100-agent relay', { status: 400 });
    const persona = HUMAN_PERSONAS_100.find((item) => item.id === Number(body.personaId));
    if (!persona) return new Response('Persona not found', { status: 400 });
    const provider = String(body.provider || DEFAULT_PROVIDER);
    const model = String(body.model || DEFAULT_MODEL);
    const customProviders: CustomProviderConfig[] = Array.isArray(body.customProviders) ? body.customProviders : [];
    const messages = Array.isArray(body.messages) ? body.messages.filter((item: any) => ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-30) : [];
    if (!messages.length || messages.at(-1).role !== 'user') return new Response('A user message is required', { status: 400 });

    const text = await executeWithGateway({
      provider,
      model,
      credentialId: body.credentialId,
      explicitApiKey: body.apiKey,
      baseUrl: body.ollamaBaseUrl || body.baseUrl,
      customProviders,
      signal: request.signal,
      reservedOutputTokens: 1200,
      estimatedInputTokens: Math.ceil(JSON.stringify(messages).length / 3),
      operation: async (languageModel, abortSignal) => {
        const result = await generateText({
          model: languageModel,
          system: `You are an AI assistant speaking from the professional perspective of ${persona.name}, ${persona.archetype} (${persona.role}). Perspective guidance: ${persona.prompt}. Give concrete, useful analysis. Do not claim to be a real human or invent personal experience.`,
          messages,
          maxOutputTokens: 1200,
          temperature: 0.5,
          abortSignal,
        });
        return result.text;
      },
    });

    if (!text || !text.trim()) throw new Error('Model returned an empty response');
    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (error) {
    return new Response(`Council model failed: ${(error as Error).message}`, { status: 502 });
  }
}
