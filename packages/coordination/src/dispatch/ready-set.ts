/**
 * ready-set — compute the dispatchable frontier each tick: tasks whose `blocks`
 * deps are all terminal, that are not already claimed, and that are themselves
 * in a dispatchable (`ready`) state.
 *
 * Fuses the agent-os candidate-task notion with the dependency-awareness added
 * in this package and multica's "already claimed → skip" guard. Pure over a
 * loaded snapshot (candidate nodes + edges + upstream states + claimed ids); the
 * store reads happen in the manager.
 */

import type { DependencyEdge, TaskClaim, TaskNode } from '../domain';
import { buildBlockingAdjacency, upstreamsTerminal } from './dependency-graph-walker';

/** A task that is dispatchable right now, with a short why. */
export type ReadyTask = {
  taskId: string;
  spaceId: string;
};

export type ReadySetInput = {
  /** Candidate (dependency-met-or-not) tasks in the space. */
  candidates: TaskNode[];
  /** All dependency edges relevant to the candidates. */
  edges: DependencyEdge[];
  /** States of upstream tasks referenced by the edges. */
  upstreamStates: TaskNode[];
  /** Live claims; a task with a live claim is excluded. */
  liveClaims: TaskClaim[];
};

/** Task states that may be dispatched (not running/terminal/blocked). */
const DISPATCHABLE_STATES = new Set(['ready']);

export function computeReadySet(input: ReadySetInput): ReadyTask[] {
  const adjacency = buildBlockingAdjacency(input.edges);
  const stateById = new Map(input.upstreamStates.map((node) => [node.taskId, node]));
  const claimedTaskIds = new Set(
    input.liveClaims
      .filter((claim) => claim.status === 'claimed' || claim.status === 'recovering')
      .map((claim) => claim.taskId),
  );

  return input.candidates
    .filter((node) => DISPATCHABLE_STATES.has(node.state))
    .filter((node) => !claimedTaskIds.has(node.taskId))
    .filter((node) => upstreamsTerminal(node.taskId, adjacency, stateById))
    .map((node) => ({ taskId: node.taskId, spaceId: node.spaceId }));
}
