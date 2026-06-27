/**
 * TeardownError — best-effort cleanup failed. Teardown is best-effort and logged;
 * partial cleanup never blocks state progression but is surfaced (design §8).
 */
import { SubstrateError, type SubstrateErrorOptions } from './substrate-error.js';
import { SubstrateErrorCode } from './codes.js';

export class TeardownError extends SubstrateError {
  constructor(message: string, options: SubstrateErrorOptions = {}) {
    super(SubstrateErrorCode.TEARDOWN_FAILED, message, { retryable: true, ...options });
  }
}
