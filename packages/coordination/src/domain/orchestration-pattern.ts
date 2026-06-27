/**
 * OrchestrationPattern — multi-agent dispatch shapes. MERGED from
 * `docker-backend/src/a2a/multi-dispatch.service.ts`.
 *
 *  - `direct`      — single best agent.
 *  - `fan_out`     — N agents in parallel over disjoint lock scopes.
 *  - `pipeline`    — ordered stages, handoff between stages.
 *  - `competitive` — N agents on the same task, first good result wins.
 */

export type OrchestrationPattern = 'direct' | 'fan_out' | 'pipeline' | 'competitive';

export const ORCHESTRATION_PATTERNS: readonly OrchestrationPattern[] = [
  'direct',
  'fan_out',
  'pipeline',
  'competitive',
] as const;

/** How `competitive`/`fan_out` results are combined. */
export type AggregationStrategy = 'first_success' | 'all' | 'majority' | 'best_score';

export const AGGREGATION_STRATEGIES: readonly AggregationStrategy[] = [
  'first_success',
  'all',
  'majority',
  'best_score',
] as const;
