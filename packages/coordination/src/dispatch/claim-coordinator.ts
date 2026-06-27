/**
 * claim-coordinator — idempotent task claim with a recovery window.
 *
 * Ports multica's claim semantics (`go/multica/server/internal/service/task.go`,
 * `claimResponseRecoveryWindow = 90s`). We do NOT transpile Go — we port the
 * algorithm:
 *
 *  - A claim, once taken, is protected from reclamation until its recovery
 *    window elapses, so a slow runtime that has not yet emitted RunStarted is
 *    never double-dispatched (multica's `ReclaimStaleDispatchedTaskForRuntime`
 *    only reclaims *past* the window).
 *  - A claim is reclaimable when its lease has expired AND it is outside the
 *    recovery window AND it has no live run.
 *  - The actual compare-and-set (exactly-one-winner) is the `ClaimStorePort`'s
 *    job (Postgres `FOR UPDATE SKIP LOCKED`, memory Map CAS). This module is the
 *    pure decision layer: it BUILDS the claim to attempt and DECIDES whether an
 *    existing claim blocks a new one.
 *
 * Pure: no IO. The `ClaimCoordinator` class is exported per the design's public
 * API (`export { ClaimCoordinator }`).
 */

import type { ClaimRecoveryWindow, TaskClaim } from '../domain';
import { isWithinRecoveryWindow } from '../domain';
import { addMs, isExpired } from '../util/time';

export type BuildClaimInput = {
  claimId: string;
  taskId: string;
  spaceId: string;
  agentId: string;
  fenceToken: number;
  /** Idempotency key — the same logical dispatch never yields two claims. */
  idempotencyKey: string;
  now: string;
  /** Lease length (ms) for the claim. */
  leaseMs: number;
  runId?: string;
};

/** The recovery window for a claim (multica claimResponseRecoveryWindow). */
export function recoveryWindowFor(
  claim: Pick<TaskClaim, 'claimId' | 'taskId' | 'agentId' | 'claimedAt'>,
  windowMs: number,
): ClaimRecoveryWindow {
  return {
    claimId: claim.claimId,
    taskId: claim.taskId,
    agentId: claim.agentId,
    claimedAt: claim.claimedAt,
    recoverableUntil: addMs(claim.claimedAt, windowMs),
    windowMs,
  };
}

export class ClaimCoordinator {
  /** Build a fresh claim to attempt via `ClaimStorePort.compareAndSet`. */
  buildClaim(input: BuildClaimInput): TaskClaim {
    return {
      claimId: input.claimId,
      taskId: input.taskId,
      spaceId: input.spaceId,
      agentId: input.agentId,
      runId: input.runId,
      status: 'claimed',
      claimedAt: input.now,
      leaseUntil: addMs(input.now, input.leaseMs),
      fenceToken: input.fenceToken,
      idempotencyKey: input.idempotencyKey,
    };
  }

  /**
   * Whether an existing claim BLOCKS a new claim on the same task.
   *
   * Ported decision logic from multica's reclaim path:
   *  - a released/lost claim never blocks;
   *  - a claim still inside its recovery window ALWAYS blocks (the protection
   *    that prevents double-dispatch of an in-flight start);
   *  - otherwise it blocks only while its lease is still live.
   */
  blocksNewClaim(existing: TaskClaim, now: string, recoveryWindowMs: number): boolean {
    if (existing.status === 'released' || existing.status === 'lost') {
      return false;
    }
    const window = recoveryWindowFor(existing, recoveryWindowMs);
    if (isWithinRecoveryWindow(window, now)) {
      return true;
    }
    return !isExpired(existing.leaseUntil, now);
  }

  /**
   * Whether an existing claim is RECLAIMABLE: lease expired, outside the
   * recovery window, and not in a live (`claimed`) protected state past lease.
   * The inverse of `blocksNewClaim` for an active claim — surfaced separately so
   * the reconciler's `claim-without-run` check can name it.
   */
  isReclaimable(existing: TaskClaim, now: string, recoveryWindowMs: number): boolean {
    if (existing.status === 'released' || existing.status === 'lost') {
      return true;
    }
    return !this.blocksNewClaim(existing, now, recoveryWindowMs);
  }
}
