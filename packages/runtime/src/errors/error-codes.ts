import type { RuntimeErrorCode as BaseRuntimeErrorCode } from '@recoder/agent-runtimes';

/**
 * Operational error codes the runtime adds on top of the canonical
 * `RuntimeErrorCode` from `@recoder/agent-runtimes`. These never replace the base
 * codes; they extend them for CLI/process/parse/verification failures.
 */
export type RuntimeOperationalErrorCode =
  | 'cli_not_found'
  | 'spawn_failed'
  | 'parse_error'
  | 'env_unavailable'
  | 'verification_failed';

/** The full set of error codes used inside the runtime subsystem. */
export type RuntimeErrorCode = BaseRuntimeErrorCode | RuntimeOperationalErrorCode;

export const RUNTIME_OPERATIONAL_ERROR_CODES: readonly RuntimeOperationalErrorCode[] = [
  'cli_not_found',
  'spawn_failed',
  'parse_error',
  'env_unavailable',
  'verification_failed',
] as const;

/** Error codes that are safe to retry at the engine level (transient flaps). */
export const RETRYABLE_ERROR_CODES: readonly RuntimeErrorCode[] = [
  'spawn_failed',
  'env_unavailable',
  'timeout',
] as const;

export function isRetryableErrorCode(code: RuntimeErrorCode): boolean {
  return (RETRYABLE_ERROR_CODES as readonly string[]).includes(code);
}

export function isOperationalErrorCode(code: RuntimeErrorCode): code is RuntimeOperationalErrorCode {
  return (RUNTIME_OPERATIONAL_ERROR_CODES as readonly string[]).includes(code);
}
