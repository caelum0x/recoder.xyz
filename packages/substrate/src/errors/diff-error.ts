/**
 * DiffError — computing the reviewable git diff in the isolation failed.
 */
import { SubstrateError, type SubstrateErrorOptions } from './substrate-error.js';
import { SubstrateErrorCode } from './codes.js';

export class DiffError extends SubstrateError {
  constructor(message: string, options: SubstrateErrorOptions = {}) {
    super(SubstrateErrorCode.DIFF_FAILED, message, options);
  }
}
