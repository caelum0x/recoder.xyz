/**
 * orchestrator — selects the pattern and returns a dispatch plan (no IO).
 *
 * MERGED from the pattern-selection head of
 * `docker-backend/src/a2a/multi-dispatch.service.ts` (`request.orchestrationPattern
 * ?? ws.settings.defaultOrchestrationPattern`). Pure dispatcher over the four
 * pattern planners. The manager passes the routed agents and the parent task's
 * target scope; the orchestrator returns the `OrchestrationPlan` the planner
 * turns into claims + lock reservations.
 */

import type { OrchestrationPattern } from '../../domain';
import { assertNever } from '../../util/assert';
import { planCompetitive } from './competitive';
import { planDirect } from './direct';
import { planFanOut } from './fan-out';
import { planPipeline } from './pipeline';
import type { OrchestrationPlan, PlanInput } from './plan';

export function planOrchestration(
  pattern: OrchestrationPattern,
  input: PlanInput,
): OrchestrationPlan {
  switch (pattern) {
    case 'direct':
      return planDirect(input);
    case 'fan_out':
      return planFanOut(input);
    case 'pipeline':
      return planPipeline(input);
    case 'competitive':
      return planCompetitive(input);
    default:
      return assertNever(pattern, 'unknown orchestration pattern');
  }
}

/** Class facade for the orchestrator (composition convenience). */
export class Orchestrator {
  plan(pattern: OrchestrationPattern, input: PlanInput): OrchestrationPlan {
    return planOrchestration(pattern, input);
  }
}
