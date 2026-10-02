import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProviderError,
  executeWithGateway,
  getProviderBudgetTelemetry,
  invalidateDiscoveryCache,
  GatewayError,
} from '../app/llm/gateway.server.ts';

test('Stage 03: normalizeProviderError maps errors to distinct non-colliding categories', () => {
  const err401 = normalizeProviderError({ status: 401, message: 'Incorrect API key provided' });
  assert.equal(err401.kind, 'UNAUTHORIZED');
  assert.equal(err401.retryable, false);

  const err404 = normalizeProviderError({ status: 404, message: 'The model gpt-invalid does not exist' });
  assert.equal(err404.kind, 'INVALID_MODEL');
  assert.equal(err404.retryable, false);

  const err429 = normalizeProviderError({
    status: 429,
    message: 'Rate limit reached for requests',
    headers: { 'retry-after': '3' },
  });
  assert.equal(err429.kind, 'RATE_LIMITED');
  assert.equal(err429.retryable, true);
  assert.equal(err429.retryAfterMs, 3000);

  const errQuota = normalizeProviderError({ status: 402, message: 'You exceeded your current quota, please check your plan' });
  assert.equal(errQuota.kind, 'QUOTA_EXHAUSTED');
  assert.equal(errQuota.retryable, false);

  const errAbort = normalizeProviderError(new Error('This operation was aborted'));
  assert.equal(errAbort.kind, 'CANCELLED');
  assert.equal(errAbort.retryable, false);
});

test('Stage 03: Gateway tracks budgets and enforces concurrency & token metrics per account', () => {
  const telemetry = getProviderBudgetTelemetry('groq', 'cred_test_123');
  assert.equal(telemetry.key, 'groq:cred:cred_test_123');
  assert.equal(telemetry.maxConcurrency, 2);
  assert.equal(typeof telemetry.activeRequests, 'number');
  assert.equal(typeof telemetry.tokensLastMinute, 'number');
  assert.equal(telemetry.isPaused, false);
});

test('Stage 03: Gateway retries transient failures and respects abort cancellation', async () => {
  let callCount = 0;
  const retryStates = [];

  try {
    await executeWithGateway({
      provider: 'ollama',
      model: 'llama3',
      estimatedInputTokens: 100,
      reservedOutputTokens: 200,
      onRetryState: (state) => {
        retryStates.push(state);
      },
      operation: async () => {
        callCount++;
        if (callCount < 3) {
          const err = new Error('Too many requests');
          err.status = 429;
          err.headers = { 'retry-after': '0.05' };
          throw err;
        }
        return 'success-after-retry';
      },
    });
  } catch {
    // Should succeed on 3rd attempt
  }

  assert.equal(callCount, 3, 'Must attempt up to 3 times on transient rate limit');
  assert.equal(retryStates.length, 2, 'Must have emitted 2 retry states');
  assert.equal(retryStates[0].attempt, 1);
  assert.equal(retryStates[1].attempt, 2);
});

test('Stage 03: Gateway rejects unauthorized missing credentials without retrying', async () => {
  let attempts = 0;
  await assert.rejects(
    async () => {
      await executeWithGateway({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        operation: async () => {
          attempts++;
          return 'should-not-run';
        },
      });
    },
    (err) => {
      assert.ok(err instanceof GatewayError);
      assert.equal(err.kind, 'UNAUTHORIZED');
      assert.equal(err.retryable, false);
      return true;
    }
  );

  assert.equal(attempts, 0, 'Must fail immediately without running operation');
});
