import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class TogetherAdapter implements LLMAdapter {
  readonly id = 'Together';
  readonly name = 'Together AI';
  readonly icon = 'Server';
  readonly defaultBaseUrl = 'https://api.together.xyz/v1';
  readonly getApiKeyLink = 'https://api.together.xyz/settings/api-keys';

  getStaticModels(): ModelInfo[] {
    return [
      {
        name: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        label: 'Llama 3.3 70B Turbo',
        provider: this.id,
        maxTokenAllowed: 128000,
      },
      {
        name: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        label: 'Qwen 2.5 Coder 32B',
        provider: this.id,
        maxTokenAllowed: 32000,
      },
      {
        name: 'deepseek-ai/DeepSeek-R1',
        label: 'DeepSeek R1 (Full 671B)',
        provider: this.id,
        maxTokenAllowed: 64000,
      },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.TOGETHER_API_KEY;
    const client = createOpenAI({
      apiKey,
      baseURL: options?.baseUrl || this.defaultBaseUrl,
    });
    return client(modelId);
  }
}
