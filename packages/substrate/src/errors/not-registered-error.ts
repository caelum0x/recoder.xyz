/**
 * SubstrateNotRegisteredError — no substrate is wired for the requested id.
 *
 * Promoted from the truthful throw in
 * docker-backend/src/conductor/substrate.ts#getSubstrate.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import { SubstrateError } from './substrate-error.js';
import { SubstrateErrorCode } from './codes.js';

export class SubstrateNotRegisteredError extends SubstrateError {
  constructor(id: WorkspaceSubstrate, registered: readonly WorkspaceSubstrate[]) {
    super(
      SubstrateErrorCode.NOT_REGISTERED,
      `conductor substrate not available: ${id} (registered: ${registered.join(', ') || 'none'})`,
      { substrateId: id, retryable: false, detail: { registered: [...registered] } },
    );
  }
}
