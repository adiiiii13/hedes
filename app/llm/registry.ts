import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from './adapter';
import { GroqAdapter } from './providers/groq';
import { XAIAdapter } from './providers/xai';
import { OpenAIAdapter } from './providers/openai';
import { AnthropicAdapter } from './providers/anthropic';
import { GoogleAdapter } from './providers/google';
import { OllamaAdapter } from './providers/ollama';
import { OpenRouterAdapter } from './providers/openrouter';
import { DeepSeekAdapter } from './providers/deepseek';
import { MistralAdapter } from './providers/mistral';
import { TogetherAdapter } from './providers/together';
import { CustomProviderAdapter } from './custom-provider';
import type { CustomProviderConfig, ModelInfo, ProviderInfo } from '~/types/model';

class ProviderRegistry {
  private builtInAdapters: Map<string, LLMAdapter> = new Map();

  constructor() {
    this.registerBuiltIn(new GroqAdapter());
    this.registerBuiltIn(new XAIAdapter());
    this.registerBuiltIn(new OpenAIAdapter());
    this.registerBuiltIn(new AnthropicAdapter());
    this.registerBuiltIn(new GoogleAdapter());
    this.registerBuiltIn(new OllamaAdapter());
    this.registerBuiltIn(new OpenRouterAdapter());
    this.registerBuiltIn(new DeepSeekAdapter());
    this.registerBuiltIn(new MistralAdapter());
    this.registerBuiltIn(new TogetherAdapter());
  }

  private registerBuiltIn(adapter: LLMAdapter) {
    this.builtInAdapters.set(adapter.id.toLowerCase(), adapter);
  }

  getAdapter(providerId: string, customConfigs: CustomProviderConfig[] = []): LLMAdapter | null {
    let key = providerId.toLowerCase();
    if (key === 'xai') key = 'grok';
    if (key === 'ollama (local)' || key === 'local' || key.includes('ollama')) key = 'ollama';
    if (key.includes('deepseek')) key = 'deepseek';
    if (key.includes('mistral')) key = 'mistral';
    if (key.includes('together')) key = 'together';
    if (this.builtInAdapters.has(key)) {
      return this.builtInAdapters.get(key)!;
    }

    const custom = customConfigs.find((c) => c.id.toLowerCase() === key || c.name.toLowerCase() === key);
    if (custom) {
      return new CustomProviderAdapter(custom);
    }

    return null;
  }

  getModel(
    providerId: string,
    modelId: string,
    options?: LLMProviderOptions,
    customConfigs: CustomProviderConfig[] = [],
  ): LanguageModelV1 {
    const adapter = this.getAdapter(providerId, customConfigs);
    if (!adapter) {
      // Fallback: if it's an unrecognized provider, assume standard OpenAI adapter or default OpenAI
      const fallback = this.builtInAdapters.get('openai')!;
      return fallback.getModel(modelId, options);
    }
    return adapter.getModel(modelId, options);
  }

  getAllProviders(customConfigs: CustomProviderConfig[] = []): ProviderInfo[] {
    const list: ProviderInfo[] = [];

    for (const adapter of this.builtInAdapters.values()) {
      list.push({
        name: adapter.name,
        staticModels: adapter.getStaticModels(),
        getApiKeyLink: adapter.getApiKeyLink,
        icon: adapter.icon,
      });
    }

    for (const custom of customConfigs) {
      if (!custom.enabled) continue;
      const customAdapter = new CustomProviderAdapter(custom);
      list.push({
        name: custom.name,
        staticModels: customAdapter.getStaticModels(),
        icon: 'Cpu',
      });
    }

    return list;
  }

  async getAllModels(customConfigs: CustomProviderConfig[] = []): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];

    for (const adapter of this.builtInAdapters.values()) {
      models.push(...adapter.getStaticModels());
    }

    for (const custom of customConfigs) {
      if (!custom.enabled) continue;
      const customAdapter = new CustomProviderAdapter(custom);
      models.push(...customAdapter.getStaticModels());
    }

    return models;
  }
}

export const providerRegistry = new ProviderRegistry();
