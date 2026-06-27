/**
 * Type guard + truthful API payload for substrate errors (design §4.10 / §8).
 *
 * `toErrorPayload` produces the safe, client-facing shape (code + message +
 * retryable) — never the `cause` or any secret detail.
 */
import { SubstrateError } from './substrate-error.js';
import { SubstrateErrorCode } from './codes.js';

export function isSubstrateError(value: unknown): value is SubstrateError {
  return value instanceof SubstrateError;
}

export interface SubstrateErrorPayload {
  code: SubstrateErrorCode;
  message: string;
  retryable: boolean;
  substrateId?: string;
}

/** Map any thrown value to a truthful, client-safe error payload. */
export function toErrorPayload(value: unknown): SubstrateErrorPayload {
  if (isSubstrateError(value)) {
    return {
      code: value.code,
      message: value.message,
      retryable: value.retryable,
      substrateId: value.substrateId,
    };
  }
  return {
    code: SubstrateErrorCode.LAUNCH_FAILED,
    message: value instanceof Error ? value.message : 'unexpected substrate error',
    retryable: false,
  };
}
