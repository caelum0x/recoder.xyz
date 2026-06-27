/**
 * Orchestration plan shapes — the pure output of pattern planning. An
 * orchestration planner turns a routed task + selected agents into an ordered
 * set of dispatch slots, each naming the agent, its lock-scope intent, and (for
 * pipeline) its stage. No IO; the manager turns slots into claims + lock
 * reservations + effects.
 *
 * MERGED from the orchestration-pattern selection of
 * `docker-backend/src/a2a/multi-dispatch.service.ts`.
 */

import type { AggregationStrategy, OrchestrationPattern } from '../../domain';

/** One agent's slot in an orchestration plan. */
export type DispatchSlot = {
  agentId: string;
  /** Paths this slot intends to write (drives lock-scope disjointness). */
  pathGlobs: string[];
  /** Pipeline stage index (0-based); 0 for non-pipeline patterns. */
  stage: number;
  /** Lock kind: writers take 'exclusive', reviewers/racers 'shared'. */
  lockKind: 'exclusive' | 'shared';
  /** Why this agent was placed in this slot. */
  reason: string;
};

export type OrchestrationPlan = {
  pattern: OrchestrationPattern;
  slots: DispatchSlot[];
  /** How results across slots are combined. */
  aggregation: AggregationStrategy;
  /** True when competing slots should be cancelled once one wins. */
  cancelLosers: boolean;
};

/** Inputs every pattern planner reads. */
export type PlanInput = {
  taskId: string;
  /** Eligible agents in rank order (best first). */
  rankedAgentIds: string[];
  /** Paths the parent task targets. */
  targetPaths: string[];
  /** Max parallel slots the space allows (multica maxConcurrentTasks analog). */
  maxConcurrency: number;
  aggregation?: AggregationStrategy;
};
