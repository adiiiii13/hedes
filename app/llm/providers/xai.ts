import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class XAIAdapter implements LLMAdapter {
  readonly id = 'Grok';
  readonly name = 'Grok (xAI)';
  readonly icon = 'Sparkles';
  readonly getApiKeyLink = 'https://console.x.ai';

  getStaticModels(): ModelInfo[] {
    return [
      { name: 'grok-2-1212', label: 'Grok 2 (Latest)', provider: this.id, maxTokenAllowed: 131072 },
      { name: 'grok-2-vision-1212', label: 'Grok 2 Vision', provider: this.id, maxTokenAllowed: 32768 },
      { name: 'grok-beta', label: 'Grok Beta', provider: this.id, maxTokenAllowed: 131072 },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    const client = createOpenAI({
      apiKey,
      baseURL: options?.baseUrl || 'https://api.x.ai/v1',
    });
    return client(modelId);
  }
}
