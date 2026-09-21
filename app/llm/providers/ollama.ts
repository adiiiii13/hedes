import { createOllama } from 'ollama-ai-provider';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class OllamaAdapter implements LLMAdapter {
  readonly id = 'Ollama';
  readonly name = 'Ollama (Local)';
  readonly icon = 'HardDrive';
  readonly defaultBaseUrl = 'http://127.0.0.1:11434';
  readonly getApiKeyLink = 'https://ollama.com/download';

  getStaticModels(): ModelInfo[] {
    return [
      { name: 'llama3.2', label: 'Llama 3.2 (Local)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'llama3.1', label: 'Llama 3.1 (Local)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B (Local)', provider: this.id, maxTokenAllowed: 32000 },
      { name: 'deepseek-r1:8b', label: 'DeepSeek R1 8B (Local)', provider: this.id, maxTokenAllowed: 64000 },
      { name: 'mistral', label: 'Mistral 7B (Local)', provider: this.id, maxTokenAllowed: 32000 },
    ];
  }

  async fetchDynamicModels(options?: LLMProviderOptions): Promise<ModelInfo[]> {
    const raw = (options?.baseUrl || process.env.OLLAMA_API_BASE_URL || this.defaultBaseUrl).replace(/\/+$/, '');
    try {
      const res = await fetch(`${raw}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return this.getStaticModels();
      const data = (await res.json()) as { models?: Array<{ name: string; size?: number; details?: { parameter_size?: string } }> };
      if (!data.models || !data.models.length) return this.getStaticModels();
      return data.models.map((m) => {
        const paramSize = m.details?.parameter_size ? ` (${m.details.parameter_size})` : '';
        return {
          name: m.name,
          label: `${m.name}${paramSize} [Local]`,
          provider: this.id,
        };
      });
    } catch {
      return this.getStaticModels();
    }
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const raw = (options?.baseUrl || process.env.OLLAMA_API_BASE_URL || this.defaultBaseUrl).replace(/\/+$/, '');
    const baseURL = raw.endsWith('/api') ? raw : `${raw}/api`;
    const client = createOllama({
      baseURL,
    });
    return client(modelId);
  }
}
