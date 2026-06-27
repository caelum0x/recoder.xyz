/**
 * ClaimRecoveryWindow — ports multica's `claimResponseRecoveryWindow`
 * (go/multica server/internal/service/task.go). After a claim is taken, an
 * in-flight start cannot be reclaimed until the recovery window elapses, so a
 * slow runtime that has not yet emitted a RunStarted event is not double-dispatched.
 */

export type ClaimRecoveryWindow = {
  claimId: string;
  taskId: string;
  agentId: string;
  /** When the claim was taken. */
  claimedAt: string;
  /** Until this instant the claim is protected from reclamation. */
  recoverableUntil: string;
  windowMs: number;
};

/** True if `now` is still inside the protected recovery window. */
export function isWithinRecoveryWindow(window: ClaimRecoveryWindow, now: string): boolean {
  return Date.parse(now) < Date.parse(window.recoverableUntil);
}
