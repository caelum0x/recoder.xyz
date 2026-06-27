/**
 * check: lock_expired_live_run — a lock has expired (TTL passed) but the owning
 * task still has a live run actively writing.
 *
 * Disposition: ESCALATE (signal `run_stale`). This is UNSAFE to auto-heal: the
 * run lost its write fence while still working, so another agent could acquire
 * the same path and collide. We surface it loudly instead of silently releasing.
 * (Per design §4.5: "lock expired but run still writing → signal: run_stale".)
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding } from '../../domain';
import { isExpired } from '../../util/time';
import { liveRunsByTask, type CoordinationSnapshot } from '../snapshot';

export function checkLockExpiredLiveRun(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const liveByTask = liveRunsByTask(snapshot);
  const findings: CoherenceFinding[] = [];

  for (const lock of snapshot.locks) {
    if (!isExpired(lock.expiresAt, snapshot.at)) {
      continue;
    }
    const liveRuns = liveByTask.get(lock.taskId);
    if (!liveRuns || liveRuns.length === 0) {
      continue;
    }

    const run = liveRuns[0];
    findings.push({
      driftKind: 'lock_expired_live_run',
      disposition: 'escalate',
      severity: 'high',
      taskId: lock.taskId,
      spaceId: lock.spaceId,
      lockId: lock.lockId,
      agentId: lock.ownerAgentId,
      evidence: `Lock ${lock.lockId} expired at ${lock.expiresAt} but run ${run.runId} on task ${lock.taskId} is still alive (last event ${run.lastEventAt}). The writer lost its fence.`,
      detectedAt: snapshot.at,
    });
  }

  return findings;
}
