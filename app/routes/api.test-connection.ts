import { data as json, type ActionFunctionArgs } from 'react-router';
import { generateText } from 'ai';
import { providerRegistry } from '~/llm/registry';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { resolveModelKey } from '~/utils/vault.server.ts';

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { provider, apiKey, model, baseUrl, customProviders } = await request.json();

    if (!provider) {
      return json({ ok: false, error: 'Provider is required' }, { status: 400 });
    }

    // Specialized fast health & model check for Ollama local service
    if (provider.toLowerCase().includes('ollama')) {
      const rawBase = (baseUrl || process.env.OLLAMA_API_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
      const startTime = Date.now();
      try {
        const res = await fetch(`${rawBase}/api/tags`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) {
          return json({
            ok: false,
            error: `Ollama returned HTTP ${res.status}: ${res.statusText}`,
          });
        }
        const data = (await res.json()) as { models?: Array<{ name: string; size?: number; details?: { parameter_size?: string } }> };
        const latency = Date.now() - startTime;
        const models = (data.models || []).map((m) => {
          const param = m.details?.parameter_size ? ` (${m.details.parameter_size})` : '';
          return {
            name: m.name,
            label: `${m.name}${param} [Local]`,
            provider: 'Ollama',
          };
        });

        return json({
          ok: true,
          provider: 'Ollama',
          latencyMs: latency,
          models,
          message: `Connected to Ollama in ${latency}ms! Found ${models.length} installed model(s).`,
        });
      } catch (ollamaErr: any) {
        return json({
          ok: false,
          error: `Could not connect to Ollama at ${rawBase}. Ensure Ollama is running ('ollama serve').`,
        });
      }
    }

    const adapter = providerRegistry.getAdapter(provider, Array.isArray(customProviders) ? customProviders : []);
    if (!adapter) {
      return json({ ok: false, error: `Provider ${provider} not found in registry` }, { status: 400 });
    }

    const staticModels = adapter.getStaticModels();
    const testModel = model || staticModels[0]?.name;

    if (!testModel) {
      return json({ ok: false, error: 'No models available for provider' }, { status: 400 });
    }

    const startTime = Date.now();
    const finalKey = await resolveModelKey(provider, apiKey, (await request.clone().json().catch(() => ({}))).credentialId);
    const languageModel = adapter.getModel(testModel, { apiKey: finalKey });

    const result = await generateText({
      model: languageModel,
      prompt: 'Respond with exactly the word "pong".',
      maxOutputTokens: 24,
      abortSignal: AbortSignal.timeout(15000),
    });

    const latency = Date.now() - startTime;

    return json({
      ok: Boolean(result.text.trim()),
      provider,
      model: testModel,
      latencyMs: latency,
      sampleResponse: result.text.trim(),
      message: result.text.trim() ? `Model answered in ${latency}ms.` : 'Model returned an empty response.',
    });
  } catch (err: any) {
    console.error('Test connection error:', err);
    return json(
      {
        ok: false,
        error: err?.message || 'Failed to connect to provider',
      },
      { status: 500 },
    );
  }
}
