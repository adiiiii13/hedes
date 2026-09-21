import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from './adapter';
import type { CustomProviderConfig, ModelInfo } from '~/types/model';

export class CustomProviderAdapter implements LLMAdapter {
  readonly id: string;
  readonly name: string;
  readonly icon = 'Cpu';
  readonly baseUrl: string;
  readonly modelId: string;
  readonly apiKey?: string;

  constructor(config: CustomProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.modelId = config.modelId;
    this.apiKey = config.apiKey;
  }

  getStaticModels(): ModelInfo[] {
    return [
      {
        name: this.modelId,
        label: `${this.name} (${this.modelId})`,
        provider: this.id,
        isCustom: true,
      },
    ];
  }

  async fetchDynamicModels(): Promise<ModelInfo[]> {
    try {
      const url = this.baseUrl.replace(/\/+$/, '') + '/models';
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) return this.getStaticModels();
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      if (!data.data || !Array.isArray(data.data)) return this.getStaticModels();
      return data.data.map((m) => ({
        name: m.id,
        label: `${this.name} (${m.id})`,
        provider: this.id,
        isCustom: true,
      }));
    } catch {
      return this.getStaticModels();
    }
  }

  getModel(modelId?: string, options?: LLMProviderOptions): LanguageModelV1 {
    const targetModel = modelId || this.modelId;
    const client = createOpenAI({
      baseURL: options?.baseUrl || this.baseUrl,
      apiKey: options?.apiKey || this.apiKey || 'custom-key',
    });
    return client(targetModel);
  }
}
