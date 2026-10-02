import type { LanguageModel } from 'ai';
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

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModel;
  getStaticModels(): ModelInfo[];
  fetchDynamicModels?(options?: LLMProviderOptions): Promise<ModelInfo[]>;
}
