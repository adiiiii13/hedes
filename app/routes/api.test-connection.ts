import { json, type ActionFunctionArgs } from '@remix-run/node';
import { generateText } from 'ai';
import { providerRegistry } from '~/llm/registry';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { provider, apiKey, model, baseUrl } = await request.json();

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

    const adapter = providerRegistry.getAdapter(provider);
    if (!adapter) {
      return json({ ok: false, error: `Provider ${provider} not found in registry` }, { status: 400 });
    }

    const staticModels = adapter.getStaticModels();
    const testModel = model || staticModels[0]?.name;

    if (!testModel) {
      return json({ ok: false, error: 'No models available for provider' }, { status: 400 });
    }

    const startTime = Date.now();
    const languageModel = adapter.getModel(testModel, { apiKey });

    const result = await generateText({
      model: languageModel,
      prompt: 'Respond with exactly the word "pong".',
      maxTokens: 10,
    });

    const latency = Date.now() - startTime;

    return json({
      ok: true,
      provider,
      model: testModel,
      latencyMs: latency,
      sampleResponse: result.text.trim(),
      message: `Successfully connected to ${provider} (${testModel}) in ${latency}ms!`,
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
