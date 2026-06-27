/**
 * DispatchDecision — the pure output of `dispatch-planner`. Bundles the chosen
 * route, the claim to take, and the locks to acquire so dispatch and lock-claim
 * are decided together (you cannot dispatch a writer without reserving its
 * paths), plus the `Effect[]` the transaction commits atomically.
 */

import type { Effect } from './effect';
import type { OrchestrationPattern } from './orchestration-pattern';
import type { RoutingDecision } from './routing-candidate';
import type { TaskClaim } from './task-claim';
import type { WorkLock } from './work-lock';

export type LockReservation = {
  spaceId: string;
  repo?: string;
  pathGlob: string;
  ownerAgentId: string;
  taskId: string;
  kind: WorkLock['kind'];
};

export type DispatchDecision = {
  taskId: string;
  spaceId: string;
  pattern: OrchestrationPattern;
  route: RoutingDecision;
  /** The claim to commit (one per dispatched agent). */
  claim: TaskClaim;
  /** Locks to acquire atomically with the claim. */
  locks: LockReservation[];
  /** Effects to run via the effect-runner on commit. */
  effects: Effect[];
};
