import { RuntimeAdapterError } from '@recoder/agent-runtimes';
import type { RuntimeErrorCode } from './error-codes';
import { isRetryableErrorCode } from './error-codes';

export { RuntimeAdapterError };

/**
 * Construct a `RuntimeAdapterError` using the extended runtime error-code set.
 *
 * The base class types `code` as the narrower `BaseRuntimeErrorCode`, but operational
 * codes share the same string channel (`data.code`). We funnel construction here so the
 * extended codes are accepted while the wire shape stays identical to the contract.
 */
export function runtimeError(
  code: RuntimeErrorCode,
  message: string,
  options: { retryable?: boolean; details?: Record<string, unknown> } = {},
): RuntimeAdapterError {
  const retryable = options.retryable ?? isRetryableErrorCode(code);
  return new RuntimeAdapterError(code as never, message, { retryable, details: options.details });
}

export function isRuntimeAdapterError(value: unknown): value is RuntimeAdapterError {
  return value instanceof RuntimeAdapterError;
}

/** Read the extended code off any error, falling back to `unknown`. */
export function errorCodeOf(error: unknown): RuntimeErrorCode {
  if (isRuntimeAdapterError(error)) {
    return error.code as RuntimeErrorCode;
  }
  return 'unknown';
}
