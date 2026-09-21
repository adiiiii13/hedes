import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class AnthropicAdapter implements LLMAdapter {
  readonly id = 'Anthropic';
  readonly name = 'Anthropic';
  readonly icon = 'Cpu';
  readonly getApiKeyLink = 'https://console.anthropic.com/settings/keys';

  getStaticModels(): ModelInfo[] {
    return [
      { name: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', provider: this.id, maxTokenAllowed: 200000 },
      { name: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', provider: this.id, maxTokenAllowed: 200000 },
      { name: 'claude-3-opus-latest', label: 'Claude 3 Opus', provider: this.id, maxTokenAllowed: 200000 },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
    const client = createAnthropic({
      apiKey,
      baseURL: options?.baseUrl,
    });
    return client(modelId);
  }
}
