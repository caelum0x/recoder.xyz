/**
 * competitive — N agents on the SAME task, first good result wins, losers are
 * cancelled.
 *
 * MERGED from multi-dispatch's `competitive` pattern + the aggregator's
 * first-wins race. Because every racer works the same scope, they take SHARED
 * locks (they are not partitioned writers; only the winner's result is
 * committed, so concurrent exclusive writes would be a false collision).
 * `cancelLosers` is true: once one slot succeeds the others are cancelled.
 *
 * Pure: ranked agents + concurrency cap → competing shared slots.
 */

import type { OrchestrationPlan, PlanInput, DispatchSlot } from './plan';

export function planCompetitive(input: PlanInput): OrchestrationPlan {
  const racers = Math.min(input.rankedAgentIds.length, input.maxConcurrency);
  const slots: DispatchSlot[] = [];
  for (let index = 0; index < racers; index += 1) {
    slots.push({
      agentId: input.rankedAgentIds[index],
      pathGlobs: input.targetPaths,
      stage: 0,
      lockKind: 'shared',
      reason: `competitive: racer ${index + 1}/${racers}`,
    });
  }
  return {
    pattern: 'competitive',
    slots,
    aggregation: input.aggregation ?? 'first_success',
    cancelLosers: true,
  };
}
