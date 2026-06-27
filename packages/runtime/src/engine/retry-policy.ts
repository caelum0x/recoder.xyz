import { isRetryableErrorCode, type RuntimeErrorCode } from '../errors/error-codes';
import { errorCodeOf } from '../errors/runtime-error';

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 5000,
};

/**
 * Decide whether a failed run may be retried. Only transient, non-write-bearing failures
 * (classified retryable by their code) are eligible. Write-bearing steps that partially
 * applied are never retried at the engine level (the caller owns that invariant).
 */
export function shouldRetry(error: unknown, attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  if (attempt >= policy.maxAttempts) return false;
  const code: RuntimeErrorCode = errorCodeOf(error);
  return isRetryableErrorCode(code);
}

/** Exponential backoff with full jitter, capped at maxDelayMs. */
export function backoffDelayMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, policy.maxDelayMs);
  return Math.floor(random() * capped);
}
