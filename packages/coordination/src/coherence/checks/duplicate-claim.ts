/**
 * check: duplicate_claim — two (or more) live claims exist on the same task.
 *
 * Resolution rule (per design §4.5 / §5.3): keep the claim with the HIGHEST
 * fence token (the most recent, authoritative writer) and signal every loser.
 * This is the exactly-once invariant's safety net: if the atomic claim CAS was
 * ever bypassed, the reconciler detects the breach and names the losers so they
 * can be released.
 *
 * Disposition: ESCALATE (signal `duplicate_claim`) for each loser — duplicate
 * work is in flight and a human/agent should release the loser's run.
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding, TaskClaim } from '../../domain';
import type { CoordinationSnapshot } from '../snapshot';

function liveClaimsByTask(snapshot: CoordinationSnapshot): Map<string, TaskClaim[]> {
  const byTask = new Map<string, TaskClaim[]>();
  for (const claim of snapshot.claims) {
    if (claim.status !== 'claimed' && claim.status !== 'recovering') {
      continue;
    }
    byTask.set(claim.taskId, [...(byTask.get(claim.taskId) ?? []), claim]);
  }
  return byTask;
}

export function checkDuplicateClaim(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const byTask = liveClaimsByTask(snapshot);
  const findings: CoherenceFinding[] = [];

  for (const [taskId, claims] of byTask) {
    if (claims.length < 2) {
      continue;
    }

    // Winner = highest fence token (ties broken by latest claimedAt for determinism).
    const winner = [...claims].sort(
      (a, b) => b.fenceToken - a.fenceToken || b.claimedAt.localeCompare(a.claimedAt),
    )[0];

    for (const claim of claims) {
      if (claim.claimId === winner.claimId) {
        continue;
      }
      findings.push({
        driftKind: 'duplicate_claim',
        disposition: 'escalate',
        severity: 'high',
        taskId,
        spaceId: claim.spaceId,
        claimId: claim.claimId,
        agentId: claim.agentId,
        evidence: `Task ${taskId} has ${claims.length} live claims. Loser claim ${claim.claimId} (agent ${claim.agentId}, fence ${claim.fenceToken}) should be released in favor of winner ${winner.claimId} (agent ${winner.agentId}, fence ${winner.fenceToken}).`,
        detectedAt: snapshot.at,
      });
    }
  }

  return findings;
}
