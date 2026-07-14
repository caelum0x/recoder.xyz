/**
 * @module connector-retry.test
 *
 * Test suite for the connector retry wrapper with exponential backoff.
 *
 * Covers:
 * - isRetryableError: retryable flag, A2A error codes, string patterns, nested errors
 * - withConnectorRetry: success path, retry on retryable error, no retry on
 *   non-retryable error, exhaustion, onRetry callback, exponential backoff, custom config
 * - createRetryableExecutor: wraps a function with retry behaviour
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing module under test
// ---------------------------------------------------------------------------

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import {
  isRetryableError,
  withConnectorRetry,
  createRetryableExecutor,
} from '../connector-retry';

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe('isRetryableError', () => {
  // -- Direct retryable flag ------------------------------------------------

  it('returns true for an object with retryable: true', () => {
    expect(isRetryableError({ retryable: true })).toBe(true);
  });

  it('returns false for an object with retryable: false', () => {
    expect(isRetryableError({ retryable: false })).toBe(false);
  });

  // -- A2A error codes (retryable) ------------------------------------------

  it.each([
    'CONNECTOR_TIMEOUT',
    'CONNECTOR_ERROR',
    'CONNECTOR_UNAVAILABLE',
  ])('returns true for retryable A2A error code %s', (code) => {
    expect(isRetryableError({ code })).toBe(true);
  });

  // -- A2A error codes (non-retryable) --------------------------------------

  it.each([
    'CONNECTOR_NOT_FOUND',
    'PROTOCOL_MISMATCH',
    'INVALID_ENVELOPE',
    'POLICY_DENIED',
    'AUTHENTICATION_FAILED',
    'CONFIGURATION_ERROR',
  ])('returns false for non-retryable A2A error code %s', (code) => {
    expect(isRetryableError({ code })).toBe(false);
  });

  // -- Standard Error with retryable message patterns -----------------------

  it.each([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'socket hang up',
    'network error',
    'timeout',
    'temporarily unavailable',
    'service unavailable',
    'too many requests',
    'rate limit exceeded',
  ])('returns true for Error with message containing "%s"', (pattern) => {
    expect(isRetryableError(new Error(`Something failed: ${pattern}`))).toBe(true);
  });

  it('returns true for case-insensitive pattern matching on Error messages', () => {
    expect(isRetryableError(new Error('Connection ETIMEDOUT at host'))).toBe(true);
  });

  // -- Non-retryable standard errors ----------------------------------------

  it('returns false for a standard Error with unknown message', () => {
    expect(isRetryableError(new Error('Something completely unexpected'))).toBe(false);
  });

  // -- Nested error objects -------------------------------------------------

  it('returns true when nested obj.error has retryable: true', () => {
    const wrapped = {
      error: { retryable: true, message: 'inner error' },
    };
    expect(isRetryableError(wrapped)).toBe(true);
  });

  it('returns false when nested obj.error has retryable: false', () => {
    const wrapped = {
      error: { retryable: false, message: 'inner error' },
    };
    expect(isRetryableError(wrapped)).toBe(false);
  });

  it('returns true when nested obj.error has a retryable A2A code', () => {
    const wrapped = {
      error: { code: 'CONNECTOR_TIMEOUT' },
    };
    expect(isRetryableError(wrapped)).toBe(true);
  });

  // -- Edge cases -----------------------------------------------------------

  it('returns false for null', () => {
    expect(isRetryableError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRetryableError(undefined)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isRetryableError('some error string')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRetryableError(42)).toBe(false);
  });

  it('prefers direct retryable flag over A2A code lookup', () => {
    // Even though CONNECTOR_TIMEOUT is retryable by code, the explicit flag wins
    expect(isRetryableError({ code: 'CONNECTOR_TIMEOUT', retryable: false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withConnectorRetry
// ---------------------------------------------------------------------------

describe('withConnectorRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result immediately on first success (no retry)', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    const promise = withConnectorRetry(operation);
    const result = await promise;

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds on 2nd attempt', async () => {
    const retryableError = { retryable: true, message: 'transient' };
    const operation = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('recovered');

    const promise = withConnectorRetry(operation, { maxAttempts: 3 });

    // First attempt fails. Advance timer past the backoff delay.
    await vi.advanceTimersByTimeAsync(2_000);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry non-retryable errors (fails immediately)', async () => {
    const nonRetryableError = { retryable: false, message: 'permanent' };
    const operation = vi.fn().mockRejectedValue(nonRetryableError);

    await expect(
      withConnectorRetry(operation, { maxAttempts: 3 }),
    ).rejects.toBe(nonRetryableError);

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a non-retryable A2A error code', async () => {
    const error = { code: 'CONNECTOR_NOT_FOUND', message: 'not found' };
    const operation = vi.fn().mockRejectedValue(error);

    await expect(
      withConnectorRetry(operation, { maxAttempts: 3 }),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('exhausts all retry attempts and throws the last error', async () => {
    const error = { retryable: true, message: 'keeps failing' };
    const operation = vi.fn().mockRejectedValue(error);

    const promise = withConnectorRetry(operation, {
      maxAttempts: 2,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
    });

    // Advance timers enough for both retry delays
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(promise).rejects.toBe(error);
    // Initial attempt + maxAttempts retries = 3 total calls
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry callback with correct arguments', async () => {
    const retryableError = { retryable: true, message: 'transient' };
    const operation = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('done');

    const onRetry = vi.fn();

    const promise = withConnectorRetry(operation, {
      maxAttempts: 3,
      baseDelayMs: 500,
      onRetry,
    });

    // Advance past both retry delays
    await vi.advanceTimersByTimeAsync(20_000);

    await promise;

    expect(onRetry).toHaveBeenCalledTimes(2);

    // First retry: attempt=1
    expect(onRetry.mock.calls[0][0]).toBe(1); // attempt number
    expect(onRetry.mock.calls[0][1]).toBe(retryableError); // error
    expect(typeof onRetry.mock.calls[0][2]).toBe('number'); // delayMs

    // Second retry: attempt=2
    expect(onRetry.mock.calls[1][0]).toBe(2);
    expect(onRetry.mock.calls[1][1]).toBe(retryableError);
    expect(typeof onRetry.mock.calls[1][2]).toBe('number');
  });

  it('uses exponential backoff with increasing delays', async () => {
    // Seed Math.random to eliminate jitter for predictable delays.
    // jitter formula: 1 + (Math.random() * 2 - 1) * jitterFactor
    // When Math.random() = 0.5, jitter = 1 + (1 - 1) * 0.25 = 1.0 (no jitter)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const retryableError = { retryable: true, message: 'transient' };
    const operation = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('done');

    const onRetry = vi.fn();

    const promise = withConnectorRetry(operation, {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 15_000,
      jitterFactor: 0.25,
      onRetry,
    });

    // Advance past all retries
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    // With random = 0.5, jitter multiplier = 1.0
    // attempt 0: delay = 1000 * 2^0 = 1000
    // attempt 1: delay = 1000 * 2^1 = 2000
    expect(onRetry.mock.calls[0][2]).toBe(1_000);
    expect(onRetry.mock.calls[1][2]).toBe(2_000);

    randomSpy.mockRestore();
  });

  it('caps delay at maxDelayMs', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const retryableError = { retryable: true, message: 'transient' };
    const operation = vi.fn().mockRejectedValue(retryableError);

    const onRetry = vi.fn();

    const promise = withConnectorRetry(operation, {
      maxAttempts: 5,
      baseDelayMs: 1_000,
      maxDelayMs: 5_000,
      jitterFactor: 0.25,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100_000);
    await expect(promise).rejects.toBe(retryableError);

    // attempt 0: min(1000, 5000) = 1000
    // attempt 1: min(2000, 5000) = 2000
    // attempt 2: min(4000, 5000) = 4000
    // attempt 3: min(8000, 5000) = 5000 (capped)
    // attempt 4: min(16000, 5000) = 5000 (capped)
    expect(onRetry.mock.calls[3][2]).toBe(5_000);
    expect(onRetry.mock.calls[4][2]).toBe(5_000);

    randomSpy.mockRestore();
  });

  it('respects custom maxAttempts config', async () => {
    const error = { retryable: true, message: 'fail' };
    const operation = vi.fn().mockRejectedValue(error);

    const promise = withConnectorRetry(operation, {
      maxAttempts: 1,
      baseDelayMs: 50,
    });

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(promise).rejects.toBe(error);
    // 1 initial + 1 retry = 2 calls
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('respects custom baseDelayMs config', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const retryableError = { retryable: true, message: 'transient' };
    const operation = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('ok');

    const onRetry = vi.fn();

    const promise = withConnectorRetry(operation, {
      maxAttempts: 3,
      baseDelayMs: 200,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await promise;

    // attempt 0: 200 * 2^0 = 200
    expect(onRetry.mock.calls[0][2]).toBe(200);

    randomSpy.mockRestore();
  });

  it('handles operation that returns a value type (number)', async () => {
    const operation = vi.fn().mockResolvedValue(42);
    const result = await withConnectorRetry(operation);
    expect(result).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// createRetryableExecutor
// ---------------------------------------------------------------------------

describe('createRetryableExecutor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a wrapped function that passes input through', async () => {
    const inner = vi.fn().mockResolvedValue('result-abc');
    const executor = createRetryableExecutor(inner);

    const result = await executor('my-input');

    expect(result).toBe('result-abc');
    expect(inner).toHaveBeenCalledWith('my-input');
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('retries the wrapped function on retryable errors', async () => {
    const retryableError = { retryable: true, message: 'transient' };
    const inner = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('recovered');

    const executor = createRetryableExecutor(inner, {
      maxAttempts: 2,
      baseDelayMs: 100,
    });

    const promise = executor('input');
    await vi.advanceTimersByTimeAsync(5_000);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(inner).toHaveBeenCalledTimes(2);
    // Both calls receive the same input
    expect(inner).toHaveBeenNthCalledWith(1, 'input');
    expect(inner).toHaveBeenNthCalledWith(2, 'input');
  });

  it('does not retry non-retryable errors in the wrapped function', async () => {
    const nonRetryableError = { retryable: false, message: 'bad request' };
    const inner = vi.fn().mockRejectedValue(nonRetryableError);

    const executor = createRetryableExecutor(inner, { maxAttempts: 3 });

    await expect(executor('input')).rejects.toBe(nonRetryableError);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('forwards custom retry config to withConnectorRetry', async () => {
    const retryableError = { retryable: true, message: 'fail' };
    const inner = vi.fn().mockRejectedValue(retryableError);

    const onRetry = vi.fn();
    const executor = createRetryableExecutor(inner, {
      maxAttempts: 1,
      baseDelayMs: 50,
      onRetry,
    });

    const promise = executor('x');
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(promise).rejects.toBe(retryableError);
    expect(inner).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
