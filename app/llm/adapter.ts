import type { LanguageModelV1 } from 'ai';
import type { ModelInfo } from '~/types/model';

export interface LLMProviderOptions {
  apiKey?: string;
  baseUrl?: string;
}

export interface LLMAdapter {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly defaultBaseUrl?: string;
  readonly getApiKeyLink?: string;

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1;
  getStaticModels(): ModelInfo[];
  fetchDynamicModels?(options?: LLMProviderOptions): Promise<ModelInfo[]>;
}
