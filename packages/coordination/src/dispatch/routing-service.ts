/**
 * routing-service — `route()` → `RoutingDecision`.
 *
 * MERGED from `TaskRoutingService.route()` in
 * `packages/agent-os/src/services/task-routing-service.ts`. Same control flow:
 *   1. compute space-policy findings,
 *   2. score every agent into a `RoutingCandidate` (candidate-scorer),
 *   3. sort (eligible-first, score-desc, id-stable),
 *   4. select the first eligible candidate,
 *   5. `blocked` when there are policy findings or no eligible candidate.
 *
 * Decoupled from the agent-os singleton: it is a pure function over a
 * `RoutingRequest` (a projection of TaskSpec/Space/AgentProfile read via ports
 * by the manager), plus an optional presence lookup. No IO.
 *
 * Exposed both as a free function `route()` and as a `RoutingService` class
 * (the design's public API exports `RoutingService`).
 */

import type { PresenceStatus, RoutingDecision } from '../domain';
import { compareCandidates, scoreCandidate } from './candidate-scorer';
import type { RoutingRequest } from './routing-request';
import { spacePolicyFindings } from './space-policy-filter';

export type RouteOptions = {
  /** Presence by agentId; an offline agent is excluded even if registry-healthy. */
  presenceByAgentId?: Record<string, PresenceStatus>;
};

/** Pure routing: request → decision. */
export function route(request: RoutingRequest, options: RouteOptions = {}): RoutingDecision {
  const { task, agents, space, requestedAssigneeAgentId } = request;
  const policyFindings = spacePolicyFindings(task, space);
  const presenceByAgentId = options.presenceByAgentId ?? {};

  // Space mismatch is a per-candidate disqualifier; it is detected here rather
  // than inside the scorer because it depends on the request-level space.
  const spaceMismatch = space !== undefined && space.spaceId !== task.spaceId;

  const candidates = agents
    .map((agent) => {
      const candidate = scoreCandidate({
        task,
        agent,
        requestedAssigneeAgentId,
        policyFindings,
        presence: presenceByAgentId[agent.agentId],
      });
      if (!spaceMismatch) {
        return candidate;
      }
      // Re-stamp with the space-mismatch reason; an ineligible candidate scores 0.
      const reasons = [...candidate.reasons, `space mismatch: ${space.spaceId}`];
      return { ...candidate, eligible: false, score: 0, reasons };
    })
    .sort(compareCandidates);

  const selected = candidates.find((candidate) => candidate.eligible);

  return {
    taskId: task.taskId,
    spaceId: task.spaceId,
    selectedAgentId: selected?.agentId,
    requestedAssigneeAgentId,
    blocked: policyFindings.length > 0 || !selected,
    policyFindings,
    candidates,
  };
}

/** Class facade (public API parity with the agent-os `TaskRoutingService`). */
export class RoutingService {
  route(request: RoutingRequest, options: RouteOptions = {}): RoutingDecision {
    return route(request, options);
  }
}
