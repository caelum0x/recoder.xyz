/**
 * HandleGoneError — the live session/sandbox vanished out from under a handle.
 *
 * Note: capture()/alive() deliberately return null/false instead of throwing
 * when the handle is gone (design §8); this error is for paths that REQUIRE a
 * live handle (e.g. send-keys steering).
 */
import { SubstrateError, type SubstrateErrorOptions } from './substrate-error.js';
import { SubstrateErrorCode } from './codes.js';

export class HandleGoneError extends SubstrateError {
  constructor(message: string, options: SubstrateErrorOptions = {}) {
    super(SubstrateErrorCode.HANDLE_GONE, message, { retryable: false, ...options });
  }
}
