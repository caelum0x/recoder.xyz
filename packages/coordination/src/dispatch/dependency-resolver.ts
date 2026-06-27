/**
 * dependency-resolver — block dispatch until upstream `blocks` deps are terminal.
 *
 * This is the dependency-awareness none of the three fused sources fully had
 * (design §4.3). Coordination reads the agent-os / bd task DAG via
 * `DependencyStorePort`; the *decision* of whether a task is dispatchable is
 * pure and lives here: a task is held while any `blocks` upstream is not in a
 * terminal state. `discovered-from` / `related` edges are informational and do
 * not gate dispatch.
 *
 * Pure: (edges, upstream states) → unmet upstream ids. The store read happens
 * in the manager; this function is deterministic over the loaded values.
 */

import type { DependencyEdge, TaskNode } from '../domain';
import { isTerminalTaskState } from '../domain';

export type DependencyResolution = {
  taskId: string;
  /** True when every `blocks` upstream is terminal (task may dispatch). */
  ready: boolean;
  /** Upstream task ids that are not yet terminal (named in the block error). */
  unmetDependencyTaskIds: string[];
};

/** The `blocks` upstream ids of a task (the only deps that gate dispatch). */
export function blockingDependencyIds(taskId: string, edges: DependencyEdge[]): string[] {
  return edges
    .filter((edge) => edge.taskId === taskId && edge.kind === 'blocks')
    .map((edge) => edge.dependsOnTaskId);
}

/**
 * Resolve whether `taskId` is dependency-ready given its edges and the current
 * states of its upstreams. A blocking upstream that is missing from
 * `upstreamStates` is treated as unmet (fail-safe: we never dispatch past an
 * unknown dependency).
 */
export function resolveDependencies(
  taskId: string,
  edges: DependencyEdge[],
  upstreamStates: TaskNode[],
): DependencyResolution {
  const stateById = new Map(upstreamStates.map((node) => [node.taskId, node]));
  const unmet: string[] = [];

  for (const upstreamId of blockingDependencyIds(taskId, edges)) {
    const node = stateById.get(upstreamId);
    if (!node || !isTerminalTaskState(node.state)) {
      unmet.push(upstreamId);
    }
  }

  return {
    taskId,
    ready: unmet.length === 0,
    unmetDependencyTaskIds: unmet,
  };
}
