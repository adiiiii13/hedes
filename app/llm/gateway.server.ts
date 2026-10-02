import crypto from 'node:crypto';
import type { LanguageModel } from 'ai';
import { providerRegistry } from './registry.ts';
import { resolveModelKey } from '../utils/vault.server.ts';
import type { CustomProviderConfig } from '../types/model.ts';
import { logDiagnostic } from '../utils/diagnostic-logger.server.ts';

export type GatewayErrorKind =
  | 'UNAUTHORIZED'
  | 'INVALID_MODEL'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PROVIDER_ERROR';

export class GatewayError extends Error {
  kind: GatewayErrorKind;
  statusCode: number;
  retryAfterMs?: number;
  retryable: boolean;

  constructor(
    kind: GatewayErrorKind,
    message: string,
    statusCode: number,
    retryable: boolean,
    retryAfterMs?: number
  ) {
    super(message);
    this.name = 'GatewayError';
    this.kind = kind;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface GatewayBudget {
  key: string;
  activeRequests: number;
  maxConcurrency: number;
  requestsLastMinute: number;
  tokensLastMinute: number;
  pausedUntil: number;
  isPaused: boolean;
}

interface BudgetEntry {
  hardQuotaUntil?: number;
  activeRequests: number;
  maxConcurrency: number;
  requestTimestamps: number[];
  tokenUsage: Array<{ timestamp: number; tokens: number }>;
  pausedUntil: number;
}

export interface GatewayExecutionOptions<T> {
  provider: string;
  model: string;
  credentialId?: string;
  explicitApiKey?: string;
  baseUrl?: string;
  customProviders?: CustomProviderConfig[];
  reservedOutputTokens?: number;
  estimatedInputTokens?: number;
  signal?: AbortSignal;
  onRetryState?: (info: {
    attempt: number;
    maxAttempts: number;
    reason: string;
    retryAfterMs: number;
  }) => void;
  operation: (model: LanguageModel, signal: AbortSignal) => Promise<T>;
}

// Track provider budgets per account/credential key
const providerBudgets = new Map<string, BudgetEntry>();

// Cache discovered custom models: key -> { timestamp, models }
const customDiscoveryCache = new Map<string, { timestamp: number; models: string[] }>();

function getBudgetAccountKey(provider: string, credentialId?: string, apiKey?: string): string {
  const normProvider = provider.toLowerCase();
  if (credentialId) return `${normProvider}:cred:${credentialId}`;
  if (apiKey) {
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
    return `${normProvider}:key:${hash}`;
  }
  return `${normProvider}:default`;
}

function getOrCreateBudget(key: string, provider: string): BudgetEntry {
  let budget = providerBudgets.get(key);
  if (!budget) {
    const isGroq = provider.toLowerCase().includes('groq');
    const isOllama = provider.toLowerCase().includes('ollama');
    const maxConcurrency = isOllama ? 2 : isGroq ? 2 : 4;

    budget = {
      activeRequests: 0,
      maxConcurrency,
      requestTimestamps: [],
      tokenUsage: [],
      pausedUntil: 0,
    };
    providerBudgets.set(key, budget);
  }
  return budget;
}

function pruneOldMetrics(budget: BudgetEntry): void {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  budget.requestTimestamps = budget.requestTimestamps.filter((t) => t > oneMinuteAgo);
  budget.tokenUsage = budget.tokenUsage.filter((u) => u.timestamp > oneMinuteAgo);
}

/**
 * Normalize provider error response into typed GatewayError.
 */
export function normalizeProviderError(error: any): GatewayError {
  if (error instanceof GatewayError) return error;

  const status = error.statusCode || error.status || 500;
  const msg = String(error.message || error || 'Unknown provider error');
  const lowerMsg = msg.toLowerCase();

  if (error.name === 'AbortError' || lowerMsg.includes('cancelled') || lowerMsg.includes('aborted')) {
    return new GatewayError('CANCELLED', 'Request was cancelled by user', 499, false);
  }

  if (status === 401 || lowerMsg.includes('invalid api key') || lowerMsg.includes('unauthorized') || lowerMsg.includes('authentication failed')) {
    return new GatewayError('UNAUTHORIZED', 'Invalid or missing API key for provider', 401, false);
  }

  if (status === 404 || lowerMsg.includes('model not found') || lowerMsg.includes('does not exist')) {
    return new GatewayError('INVALID_MODEL', `Requested model not found: ${msg}`, 404, false);
  }

  if (lowerMsg.includes('quota') || lowerMsg.includes('insufficient_quota') || lowerMsg.includes('credit limit')) {
    return new GatewayError('QUOTA_EXHAUSTED', 'Provider billing/daily quota exhausted', 402, false);
  }

  if (status === 429 || lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
    // Check for Retry-After header
    let retryAfterMs = 2000;
    const retryHeader = error.headers?.['retry-after'] || error.response?.headers?.get?.('retry-after');
    if (retryHeader) {
      const parsedSeconds = parseFloat(retryHeader);
      if (!isNaN(parsedSeconds)) {
        retryAfterMs = Math.round(parsedSeconds * 1000);
      }
    }
    return new GatewayError('RATE_LIMITED', `Provider rate limit exceeded. Retry in ${Math.round(retryAfterMs / 1000)}s`, 429, true, retryAfterMs);
  }

  if (status === 408 || lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
    return new GatewayError('TIMEOUT', 'Provider request timed out', 408, true, 2000);
  }

  return new GatewayError('PROVIDER_ERROR', msg, status, status >= 500);
}

/**
 * Execute an LLM operation through the shared rate, token, and retry gateway.
 */
export async function executeWithGateway<T>(options: GatewayExecutionOptions<T>): Promise<T> {
  const {
    provider,
    model,
    credentialId,
    explicitApiKey,
    baseUrl,
    customProviders = [],
    reservedOutputTokens = 512,
    estimatedInputTokens = 256,
    signal,
    onRetryState,
    operation,
  } = options;

  const apiKey = await resolveModelKey(provider, explicitApiKey, credentialId);
  const isCustom = customProviders.some((c) => c.id.toLowerCase() === provider.toLowerCase() || c.name.toLowerCase() === provider.toLowerCase());

  if (!provider.toLowerCase().includes('ollama') && !isCustom && !apiKey) {
    throw new GatewayError('UNAUTHORIZED', `No API key configured for provider ${provider}`, 401, false);
  }

  const budgetKey = getBudgetAccountKey(provider, credentialId, apiKey);
  const budget = getOrCreateBudget(budgetKey, provider);

  const languageModel = providerRegistry.getModel(
    provider,
    model,
    { apiKey, baseUrl },
    customProviders
  );

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if ((budget.hardQuotaUntil || 0) > Date.now()) throw new GatewayError('QUOTA_EXHAUSTED', 'Provider quota exhausted; wait or choose another provider', 402, false);
    if (signal?.aborted) {
      throw new GatewayError('CANCELLED', 'Request aborted prior to attempt', 499, false);
    }

    // Check if account is in a rate-limit cooldown
    const now = Date.now();
    if (budget.pausedUntil > now) {
      const waitMs = budget.pausedUntil - now;
      if (attempt === 1 && onRetryState) {
        onRetryState({
          attempt,
          maxAttempts,
          reason: 'Cooldown active due to prior rate limit',
          retryAfterMs: waitMs,
        });
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, waitMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new GatewayError('CANCELLED', 'Cancelled while waiting for rate limit', 499, false));
        }, { once: true });
      });
    }

    // Wait if concurrency limit reached
    while (budget.activeRequests >= budget.maxConcurrency) {
      await new Promise((r) => setTimeout(r, 50));
      if (signal?.aborted) {
        throw new GatewayError('CANCELLED', 'Cancelled while queued for concurrency', 499, false);
      }
    }

    budget.activeRequests++;
    pruneOldMetrics(budget);
    budget.requestTimestamps.push(Date.now());
    const totalTokens = estimatedInputTokens + reservedOutputTokens;
    budget.tokenUsage.push({ timestamp: Date.now(), tokens: totalTokens });

    try {
      const timeout = AbortSignal.timeout(120000);
      const result = await operation(languageModel, signal ? AbortSignal.any([signal, timeout]) : timeout);
      return result;
    } catch (rawError: any) {
      const normalized = normalizeProviderError(rawError);

      if (normalized.kind === 'QUOTA_EXHAUSTED') {
        budget.hardQuotaUntil = Date.now() + 300000;
        await logDiagnostic('error', 'GATEWAY_QUOTA', `Quota exhausted on ${budgetKey}`);
        throw normalized;
      }

      if (!normalized.retryable || attempt >= maxAttempts) {
        throw normalized;
      }

      // Compute backoff
      const retryDelayMs = normalized.retryAfterMs || Math.min(60000, 1000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500));
      budget.pausedUntil = Date.now() + retryDelayMs;

      if (onRetryState) {
        onRetryState({
          attempt,
          maxAttempts,
          reason: normalized.message,
          retryAfterMs: retryDelayMs,
        });
      }

      await logDiagnostic('warn', 'GATEWAY_RETRY', `Retrying ${provider}/${model} in ${retryDelayMs}ms (attempt ${attempt}/${maxAttempts}): ${normalized.message}`);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, retryDelayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new GatewayError('CANCELLED', 'Cancelled during retry delay', 499, false));
        }, { once: true });
      });
    } finally {
      budget.activeRequests = Math.max(0, budget.activeRequests - 1);
    }
  }

  throw new GatewayError('TIMEOUT', `Operation failed after ${maxAttempts} attempts`, 504, false);
}

/**
 * Acquire a concurrency & rate-limit slot for streaming operations.
 */
export async function acquireGatewaySlot(options: {
  provider: string;
  credentialId?: string;
  explicitApiKey?: string;
  estimatedTokens?: number;
  signal?: AbortSignal;
}): Promise<{ release: () => void }> {
  const { provider, credentialId, explicitApiKey, estimatedTokens = 512, signal } = options;
  const apiKey = await resolveModelKey(provider, explicitApiKey, credentialId);
  const budgetKey = getBudgetAccountKey(provider, credentialId, apiKey);
  const budget = getOrCreateBudget(budgetKey, provider);

  if ((budget.hardQuotaUntil || 0) > Date.now()) {
    throw new GatewayError('QUOTA_EXHAUSTED', 'Provider quota exhausted; wait or choose another provider', 402, false);
  }
  if (signal?.aborted) {
    throw new GatewayError('CANCELLED', 'Request aborted prior to attempt', 499, false);
  }

  const now = Date.now();
  if (budget.pausedUntil > now) {
    const waitMs = budget.pausedUntil - now;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, waitMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new GatewayError('CANCELLED', 'Cancelled while waiting for rate limit', 499, false));
      }, { once: true });
    });
  }

  while (budget.activeRequests >= budget.maxConcurrency) {
    await new Promise((r) => setTimeout(r, 50));
    if (signal?.aborted) {
      throw new GatewayError('CANCELLED', 'Cancelled while queued for concurrency', 499, false);
    }
  }

  budget.activeRequests++;
  pruneOldMetrics(budget);
  budget.requestTimestamps.push(Date.now());
  budget.tokenUsage.push({ timestamp: Date.now(), tokens: estimatedTokens });

  let released = false;
  return {
    release: () => {
      if (!released) {
        released = true;
        budget.activeRequests = Math.max(0, budget.activeRequests - 1);
      }
    },
  };
}

/**
 * Get current real-time budget telemetry for a provider or credential.
 */
export function getProviderBudgetTelemetry(provider: string, credentialId?: string, apiKey?: string): GatewayBudget {
  const key = getBudgetAccountKey(provider, credentialId, apiKey);
  const budget = getOrCreateBudget(key, provider);
  pruneOldMetrics(budget);

  const now = Date.now();
  const tokensTotal = budget.tokenUsage.reduce((acc, u) => acc + u.tokens, 0);

  return {
    key,
    activeRequests: budget.activeRequests,
    maxConcurrency: budget.maxConcurrency,
    requestsLastMinute: budget.requestTimestamps.length,
    tokensLastMinute: tokensTotal,
    pausedUntil: budget.pausedUntil,
    isPaused: budget.pausedUntil > now,
  };
}

/**
 * Discover models on a custom OpenAI-compatible endpoint with caching and strict validation.
 */
export async function discoverCustomModels(
  baseUrl: string,
  apiKey?: string
): Promise<{ success: boolean; models: string[]; error?: string }> {
  const normUrl = baseUrl.replace(/\/+$/, '');
  const cacheKey = `${normUrl}:${apiKey ? crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 8) : 'anon'}`;

  const cached = customDiscoveryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 300000) {
    return { success: true, models: cached.models };
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const targetUrl = normUrl.endsWith('/v1') ? `${normUrl}/models` : `${normUrl}/v1/models`;
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false,
        models: [],
        error: `Model discovery failed with status ${res.status}: ${res.statusText}`,
      };
    }

    const data: any = await res.json();
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const models: string[] = list
      .map((item: any) => (typeof item === 'string' ? item : item?.id || item?.name))
      .filter((id: any) => typeof id === 'string' && id.trim().length > 0);

    customDiscoveryCache.set(cacheKey, { timestamp: Date.now(), models });
    return { success: true, models };
  } catch (err: any) {
    return { success: false, models: [], error: err.message || 'Discovery connection error' };
  }
}

/**
 * Invalidate discovery cache when endpoint or key changes.
 */
export function invalidateDiscoveryCache(baseUrl: string): void {
  const normUrl = baseUrl.replace(/\/+$/, '');
  for (const k of customDiscoveryCache.keys()) {
    if (k.startsWith(normUrl)) {
      customDiscoveryCache.delete(k);
    }
  }
}
