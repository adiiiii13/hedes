import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import type { LLMAdapter, LLMProviderOptions } from '../adapter';
import type { ModelInfo } from '~/types/model';

export class GroqAdapter implements LLMAdapter {
  readonly id = 'Groq';
  readonly name = 'Groq';
  readonly icon = 'Zap';
  readonly getApiKeyLink = 'https://console.groq.com/keys';

  getStaticModels(): ModelInfo[] {
    return [
      { name: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (Groq - Ultra Fast & Intelligent)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (Groq - High Speed)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B (Groq)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'groq/compound', label: 'Groq Compound (Groq Agentic Reasoning)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'groq/compound-mini', label: 'Groq Compound Mini (Groq)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Groq)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Groq - Ultra Fast)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B (Groq - Reasoning)', provider: this.id, maxTokenAllowed: 128000 },
      { name: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Groq - 32k Context)', provider: this.id, maxTokenAllowed: 32768 },
      { name: 'gemma2-9b-it', label: 'Gemma 2 9B (Groq)', provider: this.id, maxTokenAllowed: 8192 },
    ];
  }

  getModel(modelId: string, options?: LLMProviderOptions): LanguageModelV1 {
    const apiKey = options?.apiKey || process.env.GROQ_API_KEY;
    const client = createOpenAI({
      apiKey,
      baseURL: options?.baseUrl || 'https://api.groq.com/openai/v1',
    });
    return client(modelId);
  }
}
