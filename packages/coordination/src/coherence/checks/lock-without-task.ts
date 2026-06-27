/**
 * check: lock_without_task — a work-lock whose owning task is terminal
 * (done/failed/cancelled) or missing from the task graph.
 *
 * Disposition: HEAL. This is provably-safe drift: if the task that justified the
 * lock is over, the lock is dead weight blocking other agents. The heal action
 * releases it. (Per design §4.5 / §5.3: "lock whose task is terminal/missing →
 * heal: release".)
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding } from '../../domain';
import { isTerminalTaskState } from '../../domain';
import { taskById, type CoordinationSnapshot } from '../snapshot';

export function checkLockWithoutTask(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const tasks = taskById(snapshot);
  const findings: CoherenceFinding[] = [];

  for (const lock of snapshot.locks) {
    const task = tasks.get(lock.taskId);
    const missing = task === undefined;
    const terminal = task !== undefined && isTerminalTaskState(task.state);
    if (!missing && !terminal) {
      continue;
    }

    findings.push({
      driftKind: 'lock_without_task',
      disposition: 'heal',
      severity: 'medium',
      taskId: lock.taskId,
      spaceId: lock.spaceId,
      lockId: lock.lockId,
      agentId: lock.ownerAgentId,
      evidence: missing
        ? `Lock ${lock.lockId} on ${lock.pathGlob} references task ${lock.taskId} which is not in the task graph.`
        : `Lock ${lock.lockId} on ${lock.pathGlob} is held for terminal task ${lock.taskId} (state=${task?.state}).`,
      detectedAt: snapshot.at,
    });
  }

  return findings;
}
