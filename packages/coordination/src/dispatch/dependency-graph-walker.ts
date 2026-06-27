/**
 * dependency-graph-walker — topo walk / ready-frontier computation over the
 * task DAG. Pure helpers over an in-memory edge set + node states; the store
 * read happens in the manager.
 *
 * Supports `ready-set.ts` (which tasks can dispatch now) and gives a cycle
 * guard so a malformed DAG cannot wedge the walker.
 */

import type { DependencyEdge, TaskNode } from '../domain';
import { isTerminalTaskState } from '../domain';

/** Adjacency: taskId → its `blocks` upstream ids. */
export function buildBlockingAdjacency(
  edges: DependencyEdge[],
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== 'blocks') {
      continue;
    }
    const upstreams = adjacency.get(edge.taskId) ?? [];
    upstreams.push(edge.dependsOnTaskId);
    adjacency.set(edge.taskId, upstreams);
  }
  return adjacency;
}

/**
 * True when every `blocks` upstream of `taskId` is terminal. A missing upstream
 * state is treated as non-terminal (fail-safe).
 */
export function upstreamsTerminal(
  taskId: string,
  adjacency: Map<string, string[]>,
  stateById: Map<string, TaskNode>,
): boolean {
  const upstreams = adjacency.get(taskId) ?? [];
  return upstreams.every((upstreamId) => {
    const node = stateById.get(upstreamId);
    return node !== undefined && isTerminalTaskState(node.state);
  });
}

export type CycleReport = {
  hasCycle: boolean;
  /** A representative cycle path when one is found (taskIds), else empty. */
  cyclePath: string[];
};

/**
 * Detect a cycle in the `blocks` subgraph via DFS over reachable nodes. A
 * dependency cycle would otherwise make a set of tasks permanently un-ready;
 * the reconciler/dep-violation check escalates it, but the walker must not loop.
 */
export function detectDependencyCycle(edges: DependencyEdge[]): CycleReport {
  const adjacency = buildBlockingAdjacency(edges);
  const nodes = new Set<string>();
  for (const edge of edges) {
    if (edge.kind === 'blocks') {
      nodes.add(edge.taskId);
      nodes.add(edge.dependsOnTaskId);
    }
  }

  const VISITING = 1;
  const DONE = 2;
  const marks = new Map<string, number>();
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    marks.set(node, VISITING);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const mark = marks.get(next);
      if (mark === VISITING) {
        const start = stack.indexOf(next);
        return stack.slice(start >= 0 ? start : 0).concat(next);
      }
      if (mark !== DONE) {
        const found = visit(next);
        if (found) {
          return found;
        }
      }
    }
    marks.set(node, DONE);
    stack.pop();
    return null;
  };

  for (const node of nodes) {
    if (marks.get(node) === undefined) {
      const cyclePath = visit(node);
      if (cyclePath) {
        return { hasCycle: true, cyclePath };
      }
    }
  }
  return { hasCycle: false, cyclePath: [] };
}
