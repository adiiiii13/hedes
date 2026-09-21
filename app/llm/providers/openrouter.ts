import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class OpenRouterAdapter implements LLMAdapter {
  readonly id = 'OpenRouter';
  readonly name = 'OpenRouter';
  readonly icon = 'Globe';
  readonly defaultBaseUrl = 'https://openrouter.ai/api/v1';
  readonly getApiKeyLink = 'https://openrouter.ai/keys';

  getStaticModels(): ModelInfo[] {
    return [
      { name: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B (FREE)', provider: this.id, maxTokenAllowed: 131072 },
      { name: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (FREE)', provider: this.id, maxTokenAllowed: 131072 },
      { name: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B (FREE)', provider: this.id, maxTokenAllowed: 131072 },
      { name: 'qwen/qwen3.8-27b:free', label: 'Qwen 3.8 27B (FREE)', provider: this.id, maxTokenAllowed: 131072 },
      { name: 'nex-agi/nex-n2.5-pro:free', label: 'Nex-N2.5-Pro (FREE)', provider: this.id, maxTokenAllowed: 65536 },
      { name: 'nex-agi/nex-n2.5-mini:free', label: 'Nex-N2.5-Mini (FREE)', provider: this.id, maxTokenAllowed: 65536 },
      { name: 'cohere/north-mini-code:free', label: 'Cohere North Mini Code (FREE)', provider: this.id, maxTokenAllowed: 65536 },
      { name: 'z-ai/glm-5.2:free', label: 'Z.ai GLM 5.2 (FREE)', provider: this.id, maxTokenAllowed: 65536 },
      { name: 'liquid/lfm-2.5-2.6b:free', label: 'Liquid LFM 2.5 (FREE)', provider: this.id, maxTokenAllowed: 32768 },
      { name: 'thinkingmachines/inkling-small:free', label: 'Thinking Machines Inkling (FREE)', provider: this.id, maxTokenAllowed: 32768 },
      { name: 'inclusionai/ling-3.0-flash-vl:free', label: 'Ling 3.0 Flash VL (FREE)', provider: this.id, maxTokenAllowed: 32768 },
      { name: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (FREE)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'deepseek/deepseek-r1', label: 'DeepSeek R1', provider: this.id, maxTokenAllowed: 64000 },
      { name: 'deepseek/deepseek-chat', label: 'DeepSeek V3', provider: this.id, maxTokenAllowed: 64000 },
      { name: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)', provider: this.id, maxTokenAllowed: 200000 },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.OPENROUTER_API_KEY;
    const client = createOpenAI({
      apiKey,
      baseURL: options?.baseUrl || this.defaultBaseUrl,
    });
    return client(modelId);
  }
}
