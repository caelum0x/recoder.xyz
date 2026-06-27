/**
 * duplicate-guard — reject re-dispatch of an already-claimed / in-flight task.
 *
 * The anti-duplicate-work gate from the dispatch data-flow (design §5.1 step 2).
 * Fuses multica's "task already dispatched" guard with the recovery-window
 * semantics in `claim-coordinator`. Pure: an existing claim + now → a verdict
 * naming the holder, so the manager can fail fast with `ClaimConflictError`
 * before any routing or lock work.
 */

import type { TaskClaim } from '../domain';
import { ClaimCoordinator } from './claim-coordinator';

export type DuplicateVerdict =
  | { duplicate: false }
  | {
      duplicate: true;
      heldByAgentId: string;
      existingClaimId: string;
    };

const coordinator = new ClaimCoordinator();

/**
 * True-typed verdict when `existing` blocks a new dispatch of the task. A
 * released/lost or fully-reclaimable claim does not block (returns
 * `{ duplicate: false }`), so a retry after a dead run can re-dispatch.
 */
export function checkDuplicate(
  existing: TaskClaim | undefined,
  now: string,
  recoveryWindowMs: number,
): DuplicateVerdict {
  if (!existing) {
    return { duplicate: false };
  }
  if (!coordinator.blocksNewClaim(existing, now, recoveryWindowMs)) {
    return { duplicate: false };
  }
  return {
    duplicate: true,
    heldByAgentId: existing.agentId,
    existingClaimId: existing.claimId,
  };
}
