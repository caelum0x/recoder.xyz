/**
 * candidate-scorer — per-agent scoring producing a `RoutingCandidate`.
 *
 * MERGED from the private `candidate()` method of
 * `packages/agent-os/src/services/task-routing-service.ts`, with the capability
 * dimension folded in from `docker-backend/src/a2a/capability-matcher.service.ts`.
 * Preserves the source's scoring weights and reason/warning text:
 *  - health:            healthy +30 / degraded +15        (health-filter)
 *  - requested assignee: +50 (match) or a disqualifying reason (mismatch)
 *  - supported intent:  +30 (or disqualifying reason)
 *  - required caps met: +10 per required cap (or disqualifying reason)
 *  - permission gates:  git-write / network / shell        (permission-filter)
 *  - space policy:      forbidden-path findings disqualify  (space-policy-filter)
 *  - capability match:  +score/10 boost from the A2A matcher (new fusion input)
 *  - tail:              +1 per capability the agent has
 *  - warnings:          local runtime / manual approval
 *
 * Eligible exactly when there are zero disqualifying reasons (source rule). An
 * ineligible candidate scores 0 (source rule).
 *
 * Pure: same inputs → same candidate.
 */

import type { PresenceStatus, RoutingCandidate } from '../domain';
import type { DirectoryAgent } from '../ports';
import { scoreCapabilities } from './capability-matcher';
import { assessHealth } from './health-filter';
import { permissionReasons } from './permission-filter';
import { taskExpectsWrite, type RoutableTask } from './routing-request';

const REQUESTED_ASSIGNEE_BONUS = 50;
const INTENT_BONUS = 30;
const REQUIRED_CAP_BONUS = 10;
const CAPABILITY_SCORE_DIVISOR = 10;

export type ScoreCandidateInput = {
  task: RoutableTask;
  agent: DirectoryAgent;
  requestedAssigneeAgentId?: string;
  /** Findings from space-policy-filter (non-empty disqualifies). */
  policyFindings: string[];
  /** Live presence for the agent, if known (offline overrides health). */
  presence?: PresenceStatus;
};

function supportsIntent(agent: DirectoryAgent, intent: string): boolean {
  return agent.supportedIntents.includes(intent) || agent.supportedIntents.includes('*');
}

export function scoreCandidate(input: ScoreCandidateInput): RoutingCandidate {
  const { task, agent, requestedAssigneeAgentId, policyFindings, presence } = input;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const capabilityIds = agent.capabilityIds;
  let score = 0;

  // ── health ────────────────────────────────────────────────────────────────
  const health = assessHealth(agent.health, presence);
  reasons.push(...health.reasons);
  score += health.score;

  // ── requested assignee ──────────────────────────────────────────────────────
  if (requestedAssigneeAgentId && requestedAssigneeAgentId !== agent.agentId) {
    reasons.push(`requested assignee is ${requestedAssigneeAgentId}`);
  } else if (requestedAssigneeAgentId === agent.agentId) {
    score += REQUESTED_ASSIGNEE_BONUS;
  }

  // ── supported intent ────────────────────────────────────────────────────────
  if (!supportsIntent(agent, task.intent)) {
    reasons.push(`unsupported intent: ${task.intent}`);
  } else {
    score += INTENT_BONUS;
  }

  // ── required capabilities ───────────────────────────────────────────────────
  const requiredCaps = task.requiredCapabilityIds ?? [];
  const missingCaps = requiredCaps.filter((capId) => !capabilityIds.includes(capId));
  if (missingCaps.length > 0) {
    reasons.push(`missing capabilities: ${missingCaps.join(', ')}`);
  } else {
    score += requiredCaps.length * REQUIRED_CAP_BONUS;
  }

  // ── permission gates ────────────────────────────────────────────────────────
  reasons.push(...permissionReasons(task, agent.permissions));

  // ── space policy ────────────────────────────────────────────────────────────
  if (policyFindings.length > 0) {
    reasons.push('workspace policy blocks this task');
  }

  // ── capability match boost (A2A matcher) ────────────────────────────────────
  const capabilityMatch = scoreCapabilities(
    { agentId: agent.agentId, capabilityIds, platform: agent.platform },
    {
      requiredCapabilities: requiredCaps,
      preferredCapabilities: task.preferredCapabilityIds,
      preferredPlatform: task.preferredPlatform,
    },
  );
  score += Math.round(capabilityMatch.score / CAPABILITY_SCORE_DIVISOR);

  // ── tail score + warnings ───────────────────────────────────────────────────
  score += capabilityIds.length;
  if (agent.runtimeKind === 'local') {
    warnings.push('local runtime requires live bridge/session health outside this routing decision');
  }

  const eligible = reasons.length === 0;
  return {
    agentId: agent.agentId,
    displayName: agent.displayName,
    vendorSurface: agent.vendorSurface,
    runtimeKind: agent.runtimeKind,
    healthStatus: agent.health,
    eligible,
    score: eligible ? score : 0,
    reasons,
    warnings,
    capabilityIds,
  };
}

/**
 * Candidate ordering (MERGED from `compareCandidates`): eligible first, then
 * higher score, then stable by agentId.
 */
export function compareCandidates(left: RoutingCandidate, right: RoutingCandidate): number {
  if (left.eligible !== right.eligible) {
    return left.eligible ? -1 : 1;
  }
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  return left.agentId.localeCompare(right.agentId);
}

/** Bare write-expectation re-export so the planner can decide lock kind. */
export { taskExpectsWrite };
