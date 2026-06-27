/**
 * check: run_without_claim — a run is alive on a task but there is no live claim
 * backing it (the claim was lost, released, or never persisted).
 *
 * Disposition: ESCALATE (signal `claim_lost`). UNSAFE to auto-heal: a live run
 * with no fence token means a second dispatch could double-execute the task. We
 * surface it + flag a fence check rather than killing the run. (Per design §4.5:
 * "run alive but claim lost → signal + fence check".)
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding, TaskClaim } from '../../domain';
import type { CoordinationSnapshot } from '../snapshot';

function liveClaimByTask(snapshot: CoordinationSnapshot): Map<string, TaskClaim> {
  const byTask = new Map<string, TaskClaim>();
  for (const claim of snapshot.claims) {
    if (claim.status === 'claimed' || claim.status === 'recovering') {
      byTask.set(claim.taskId, claim);
    }
  }
  return byTask;
}

export function checkRunWithoutClaim(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const claimByTask = liveClaimByTask(snapshot);
  const findings: CoherenceFinding[] = [];

  for (const run of snapshot.runs) {
    if (!run.alive) {
      continue;
    }
    if (claimByTask.has(run.taskId)) {
      continue; // claim backs the run — healthy
    }

    findings.push({
      driftKind: 'run_without_claim',
      disposition: 'escalate',
      severity: 'high',
      taskId: run.taskId,
      spaceId: run.spaceId,
      agentId: run.agentId,
      evidence: `Run ${run.runId} on task ${run.taskId} (agent ${run.agentId}) is alive but no live claim backs it. The run has no fence token — verify before allowing any re-dispatch.`,
      detectedAt: snapshot.at,
    });
  }

  return findings;
}
