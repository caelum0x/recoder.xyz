/**
 * SubstrateUnavailableError — a binary or credential the substrate needs is
 * missing. Carries a truthful `reason` so the system degrades, never fakes
 * (design §8, feedback_no_false_claims).
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import { SubstrateError, type SubstrateErrorOptions } from './substrate-error.js';
import { SubstrateErrorCode } from './codes.js';

export class SubstrateUnavailableError extends SubstrateError {
  readonly reason: string;

  constructor(
    reason: string,
    options: Omit<SubstrateErrorOptions, 'retryable'> & { substrateId?: WorkspaceSubstrate } = {},
  ) {
    super(SubstrateErrorCode.UNAVAILABLE, `substrate unavailable: ${reason}`, {
      ...options,
      retryable: false,
    });
    this.reason = reason;
  }
}
