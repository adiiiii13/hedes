import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class OpenAIAdapter implements LLMAdapter {
  readonly id = 'OpenAI';
  readonly name = 'OpenAI';
  readonly icon = 'Sparkles';
  readonly getApiKeyLink = 'https://platform.openai.com/api-keys';

  getStaticModels(): ModelInfo[] {
    return [
      { name: 'gpt-4o', label: 'GPT-4o (Omni)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'o3-mini', label: 'o3-mini (Reasoning)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'o1', label: 'o1 (Deep Thought)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: this.id, maxTokenAllowed: 128000 },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
    const client = createOpenAI({
      apiKey,
      baseURL: options?.baseUrl,
    });
    return client(modelId);
  }
}
