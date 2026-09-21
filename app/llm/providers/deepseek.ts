import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class DeepSeekAdapter implements LLMAdapter {
  readonly id = 'DeepSeek';
  readonly name = 'DeepSeek';
  readonly icon = 'Bot';
  readonly defaultBaseUrl = 'https://api.deepseek.com/v1';
  readonly getApiKeyLink = 'https://platform.deepseek.com/api_keys';

  getStaticModels(): ModelInfo[] {
    return [
      {
        name: 'deepseek-chat',
        label: 'DeepSeek-V3 (Chat & Code)',
        provider: this.id,
        maxTokenAllowed: 64000,
      },
      {
        name: 'deepseek-reasoner',
        label: 'DeepSeek-R1 (Deep Reasoning)',
        provider: this.id,
        maxTokenAllowed: 64000,
      },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.DEEPSEEK_API_KEY;
    const client = createOpenAI({
      apiKey,
      baseURL: options?.baseUrl || this.defaultBaseUrl,
    });
    return client(modelId);
  }
}
