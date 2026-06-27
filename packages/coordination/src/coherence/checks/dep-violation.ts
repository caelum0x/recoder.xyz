/**
 * check: dep_violation — a task has a live claim/run while one of its `blocks`
 * dependencies is NOT terminal. Dispatch should have held this task in the ready
 * set until upstreams finished (see dispatch/dependency-resolver); a violation
 * means work started on top of an unfinished upstream.
 *
 * The snapshot carries the task DAG state via `tasks` (TaskNode) and the
 * `blocks`/`discovered-from`/`related` edges via `depEdges` (projected by the
 * snapshot loader from DependencyStorePort). Only `blocks` gates dispatch;
 * `discovered-from`/`related` are informational.
 *
 * Disposition: ESCALATE (signal `dependency_violation`). UNSAFE to auto-heal —
 * stopping a running task is a heavy action; we surface it for a human/agent.
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding, TaskNode } from '../../domain';
import { isTerminalTaskState } from '../../domain';
import { liveRunsByTask, taskById, type CoordinationSnapshot } from '../snapshot';

function liveTaskIds(snapshot: CoordinationSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const claim of snapshot.claims) {
    if (claim.status === 'claimed' || claim.status === 'recovering') {
      ids.add(claim.taskId);
    }
  }
  for (const [taskId, runs] of liveRunsByTask(snapshot)) {
    if (runs.length > 0) {
      ids.add(taskId);
    }
  }
  return ids;
}

export function checkDepViolation(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const tasks = taskById(snapshot);
  const live = liveTaskIds(snapshot);
  const findings: CoherenceFinding[] = [];

  for (const edge of snapshot.depEdges) {
    if (edge.kind !== 'blocks') {
      continue;
    }
    if (!live.has(edge.taskId)) {
      continue; // the dependent task is not in flight — nothing to violate
    }
    const upstream: TaskNode | undefined = tasks.get(edge.dependsOnTaskId);
    const upstreamTerminal = upstream !== undefined && isTerminalTaskState(upstream.state);
    if (upstreamTerminal) {
      continue; // dependency satisfied
    }

    const node = tasks.get(edge.taskId);
    findings.push({
      driftKind: 'dep_violation',
      disposition: 'escalate',
      severity: 'high',
      taskId: edge.taskId,
      spaceId: node?.spaceId,
      evidence: `Task ${edge.taskId} is in flight but its blocking dependency ${edge.dependsOnTaskId} is ${
        upstream ? `still ${upstream.state}` : 'missing/unknown'
      }. Work started before upstreams were terminal.`,
      detectedAt: snapshot.at,
    });
  }

  return findings;
}
