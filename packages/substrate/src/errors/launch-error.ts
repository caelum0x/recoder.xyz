/**
 * LaunchError — the agent CLI failed to start inside its isolation.
 */
import { SubstrateError, type SubstrateErrorOptions } from './substrate-error.js';
import { SubstrateErrorCode } from './codes.js';

export class LaunchError extends SubstrateError {
  constructor(message: string, options: SubstrateErrorOptions = {}) {
    super(SubstrateErrorCode.LAUNCH_FAILED, message, options);
  }
}
