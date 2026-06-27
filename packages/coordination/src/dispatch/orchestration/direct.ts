/**
 * direct — single best agent. The default pattern (multi-dispatch's `direct`):
 * one slot, the top-ranked eligible agent, exclusive lock over the full target
 * scope, first-success aggregation (there is only one result).
 */

import type { OrchestrationPlan, PlanInput } from './plan';

export function planDirect(input: PlanInput): OrchestrationPlan {
  const agentId = input.rankedAgentIds[0];
  const slots = agentId
    ? [
        {
          agentId,
          pathGlobs: input.targetPaths,
          stage: 0,
          lockKind: 'exclusive' as const,
          reason: 'direct: top-ranked eligible agent',
        },
      ]
    : [];
  return {
    pattern: 'direct',
    slots,
    aggregation: input.aggregation ?? 'first_success',
    cancelLosers: false,
  };
}
