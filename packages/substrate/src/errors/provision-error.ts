/**
 * ProvisionError — provisioning isolation failed (worktree add / sandbox create).
 */
import { SubstrateError, type SubstrateErrorOptions } from './substrate-error.js';
import { SubstrateErrorCode } from './codes.js';

export class ProvisionError extends SubstrateError {
  constructor(message: string, options: SubstrateErrorOptions = {}) {
    super(SubstrateErrorCode.PROVISION_FAILED, message, options);
  }
}
