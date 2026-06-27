/**
 * pipeline — ordered stages, handoff between stages.
 *
 * MERGED from multi-dispatch's `pipeline` pattern. Each ranked agent becomes a
 * sequential stage over the SAME target scope (an exclusive writer per stage,
 * but only one stage active at a time, so no collision). Stage k hands off to
 * stage k+1 (the handoff module wires the actual transfer); here we only emit
 * the ordered slots with ascending `stage`.
 *
 * Pure: ranked agents → ordered exclusive slots.
 */

import type { OrchestrationPlan, PlanInput, DispatchSlot } from './plan';

export function planPipeline(input: PlanInput): OrchestrationPlan {
  const stageCount = Math.min(input.rankedAgentIds.length, input.maxConcurrency);
  const slots: DispatchSlot[] = [];
  for (let stage = 0; stage < stageCount; stage += 1) {
    slots.push({
      agentId: input.rankedAgentIds[stage],
      pathGlobs: input.targetPaths,
      stage,
      lockKind: 'exclusive',
      reason: `pipeline: stage ${stage + 1}/${stageCount}`,
    });
  }
  return {
    pattern: 'pipeline',
    slots,
    aggregation: input.aggregation ?? 'all',
    cancelLosers: false,
  };
}
