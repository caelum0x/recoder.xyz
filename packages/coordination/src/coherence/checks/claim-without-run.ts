/**
 * check: claim_without_run — a task is `claimed` but has no live run, and the
 * multica claim-recovery window has elapsed since the claim was taken.
 *
 * MERGED from multica's `claimResponseRecoveryWindow`
 * (go/multica server/internal/service/task.go): an in-flight claim must NOT be
 * reclaimed until the recovery window passes, so a slow runtime that has not yet
 * emitted RunStarted is never double-dispatched. Inside the window we stay
 * silent; only past it does the claim become reclaimable.
 *
 * Disposition: ESCALATE (signal `claim_lost`) — the reconciler surfaces the
 * stale claim so it can be released and the task re-dispatched. We escalate
 * rather than blind-heal because the run state is read from a projection that
 * may lag; a human/agent confirms before reclaiming.
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding } from '../../domain';
import { addMs, isExpired } from '../../util/time';
import { liveRunsByTask, type CoordinationSnapshot } from '../snapshot';

export function checkClaimWithoutRun(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const liveByTask = liveRunsByTask(snapshot);
  const recoveryWindowMs = snapshot.config.claimRecoveryWindowMs;
  const findings: CoherenceFinding[] = [];

  for (const claim of snapshot.claims) {
    if (claim.status !== 'claimed' && claim.status !== 'recovering') {
      continue;
    }
    const liveRuns = liveByTask.get(claim.taskId);
    if (liveRuns && liveRuns.length > 0) {
      continue; // a live run backs the claim — healthy
    }

    // multica recovery window: protect an in-flight start. Reclaimable only once
    // `claimedAt + recoveryWindowMs` is in the past.
    const recoverableUntil = addMs(claim.claimedAt, recoveryWindowMs);
    if (!isExpired(recoverableUntil, snapshot.at)) {
      continue; // still inside the protected window — not yet drift
    }

    findings.push({
      driftKind: 'claim_without_run',
      disposition: 'escalate',
      severity: 'medium',
      taskId: claim.taskId,
      spaceId: claim.spaceId,
      claimId: claim.claimId,
      agentId: claim.agentId,
      evidence: `Claim ${claim.claimId} on task ${claim.taskId} (held by ${claim.agentId}) has no live run and the recovery window (${recoveryWindowMs}ms from ${claim.claimedAt}) elapsed. The task is reclaimable.`,
      detectedAt: snapshot.at,
    });
  }

  return findings;
}
