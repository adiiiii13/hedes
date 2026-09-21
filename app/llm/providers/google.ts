import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class GoogleAdapter implements LLMAdapter {
  readonly id = 'Google';
  readonly name = 'Google Gemini';
  readonly icon = 'Zap';
  readonly getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  getStaticModels(): ModelInfo[] {
    return [
      { name: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Fast & Capable)', provider: this.id, maxTokenAllowed: 1000000 },
      { name: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro', provider: this.id, maxTokenAllowed: 2000000 },
      { name: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash', provider: this.id, maxTokenAllowed: 1000000 },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const client = createGoogleGenerativeAI({
      apiKey,
      baseURL: options?.baseUrl,
    });
    return client(modelId);
  }
}
