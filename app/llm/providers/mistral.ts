import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class MistralAdapter implements LLMAdapter {
  readonly id = 'Mistral';
  readonly name = 'Mistral AI';
  readonly icon = 'Cpu';
  readonly defaultBaseUrl = 'https://api.mistral.ai/v1';
  readonly getApiKeyLink = 'https://console.mistral.ai/api-keys';

  getStaticModels(): ModelInfo[] {
    return [
      {
        name: 'mistral-large-latest',
        label: 'Mistral Large (Flagship)',
        provider: this.id,
        maxTokenAllowed: 128000,
      },
      {
        name: 'codestral-latest',
        label: 'Codestral (Code Specialist)',
        provider: this.id,
        maxTokenAllowed: 128000,
      },
      {
        name: 'mistral-small-latest',
        label: 'Mistral Small (Fast & Light)',
        provider: this.id,
        maxTokenAllowed: 32000,
      },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.MISTRAL_API_KEY;
    const client = createOpenAI({
      apiKey,
      baseURL: options?.baseUrl || this.defaultBaseUrl,
    });
    return client(modelId);
  }
}
