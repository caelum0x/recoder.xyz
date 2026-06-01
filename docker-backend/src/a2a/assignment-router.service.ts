/**
 * @module assignment-router.service
 *
 * Capability-, policy-, assignee-, and intent-driven task assignment.
 *
 * This service replaces the assumption that a single runtime selection is the
 * primary routing dimension. Work is assigned to an agent by:
 *
 *   1. **Explicit assignee** — if the task names a target agent, honour it
 *      (subject to workspace membership and health gating).
 *   2. **Workspace policy** — only agents that are members of the task's
 *      workspace are eligible. Additional policy knobs (e.g. requiring
 *      online/healthy agents) further filter the candidate set.
 *   3. **Capability match** — agents are scored against the task's required and
 *      preferred capabilities via the existing {@link CapabilityMatcherService}.
 *   4. **A2A intent match** — agents that advertise support for the requested
 *      A2A intent (`plan`, `execute`, `review`, ...) are preferred.
 *   5. **Health preference** — online/healthy agents are preferred over stale
 *      or offline ones.
 *
 * The chosen **runtime lane** (protocol + tier) is recorded as *secondary*
 * metadata on the decision, never as the primary selection dimension.
 *
 * The router is a pure selection layer: it does not create tasks or mutate
 * state. Callers feed the resulting {@link AssignmentDecision} into the
 * task-lifecycle / dispatch path.
 */

import type { RegisteredAgent, RecoderIntent } from '@recoder/shared/a2a';
import {
  getAgentRegistryService,
  type AgentRegistryService,
  type AgentHeartbeat,
} from './agent-registry.service';
import {
  getCapabilityMatcher,
  type CapabilityMatcherService,
  type TaskRequirements,
} from './capability-matcher.service';
import { getWorkspaceService, type WorkspaceService } from './workspace.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-assignment-router');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A task to be routed. Carries the routing dimensions in priority order:
 * explicit assignee, required/preferred capabilities, and the A2A intent.
 */
export interface RoutableTask {
  /** Capabilities the target agent MUST have. */
  requiredCapabilities?: string[];
  /** Capabilities that boost a candidate but are not mandatory. */
  preferredCapabilities?: string[];
  /** A2A protocol intent for this task (plan, execute, review, ...). */
  intent?: RecoderIntent;
  /**
   * Explicit assignee agent id. When set and valid, it overrides
   * capability/intent scoring (still subject to policy + health gating).
   */
  assigneeAgentId?: string;
  /** Optional preferred platform hint (passed through to the matcher). */
  preferredPlatform?: string;
}

/**
 * Workspace routing policy. Derived from {@link WorkspaceService} settings but
 * accepted explicitly so the router stays testable and decoupled.
 */
export interface WorkspaceRoutingPolicy {
  /** Agent ids that are members of the workspace (the eligible pool). */
  memberAgentIds: string[];
  /**
   * When true, only online/healthy agents are eligible. When false, offline
   * agents remain eligible but are still ranked below healthy ones.
   * Defaults to false (health is a preference, not a hard gate).
   */
  requireHealthy?: boolean;
}

/** The selected runtime lane — recorded as secondary metadata only. */
export interface RuntimeLane {
  protocol: RegisteredAgent['protocol'];
  tier: RegisteredAgent['tier'];
  platform: string;
}

/** A scored candidate considered during routing. */
export interface AssignmentCandidate {
  agentId: string;
  agentName: string;
  /** Capability score (0-100) from the matcher; 0 when capabilities are unscored. */
  capabilityScore: number;
  /** Whether the agent advertises support for the requested intent. */
  intentMatch: boolean;
  /** Whether the agent is currently online/healthy. */
  healthy: boolean;
  /** Combined routing score used for ranking. */
  score: number;
  /** Secondary runtime lane metadata for this candidate. */
  runtime: RuntimeLane;
  /** Human-readable explanation of how this candidate ranked. */
  reason: string;
}

export interface AssignmentDecision {
  /** The selected agent id, or null when nothing is eligible. */
  agentId: string | null;
  /** Why this agent was selected (or why nothing matched). */
  reason: string;
  /** True when the decision honoured an explicit assignee. */
  viaExplicitAssignee: boolean;
  /** Secondary runtime lane metadata for the selected agent. */
  runtime: RuntimeLane | null;
  /** Health snapshot of the selected agent. */
  health: AgentHeartbeat | null;
  /** All ranked candidates considered (best first). */
  candidates: AssignmentCandidate[];
}

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

/**
 * Combined routing score = capability (0-100, weighted) + intent bonus +
 * health bonus. Capability remains the dominant signal; intent and health are
 * tie-breakers / preferences layered on top.
 */
const INTENT_MATCH_BONUS = 30;
const HEALTH_BONUS = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Platform-default A2A intents. Used as a fallback when an agent does not
 * explicitly advertise intents via skill/agent tags. Keeps routing useful for
 * the pre-registered default agents that predate intent tagging.
 */
const PLATFORM_DEFAULT_INTENTS: Record<string, ReadonlyArray<RecoderIntent>> = {
  codex: ['execute', 'plan'],
  claude_code: ['review', 'plan', 'execute'],
  cursor: ['execute'],
  windsurf: ['execute'],
  replit: ['execute'],
  recoder_pm: ['plan', 'status', 'sync'],
  recoder_agency: ['handoff', 'plan', 'execute', 'review'],
  recoder_backend: ['execute', 'tool_call'],
  recoder_web: ['status', 'sync'],
};

const KNOWN_INTENTS: ReadonlySet<string> = new Set<RecoderIntent>([
  'plan',
  'execute',
  'review',
  'handoff',
  'status',
  'sync',
  'tool_call',
  'tool_result',
  'error',
] as RecoderIntent[]);

/**
 * Collect the A2A intents an agent advertises support for.
 *
 * Sources, in order:
 * - explicit `intent:<name>` tags on the agent or its skills
 * - bare skill/agent tags that exactly name a known intent (e.g. `review`)
 * - platform defaults as a last resort
 */
function collectSupportedIntents(agent: RegisteredAgent): Set<string> {
  const intents = new Set<string>();

  const addFromTag = (tag: string): void => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;
    if (trimmed.startsWith('intent:')) {
      const name = trimmed.slice('intent:'.length).trim();
      if (name) intents.add(name);
      return;
    }
    // A bare tag that exactly names a known A2A intent also counts.
    if (KNOWN_INTENTS.has(trimmed)) {
      intents.add(trimmed);
    }
  };

  for (const tag of agent.tags) addFromTag(tag);
  for (const skill of agent.card.skills) {
    for (const tag of skill.tags) addFromTag(tag);
  }

  if (intents.size === 0) {
    const defaults = PLATFORM_DEFAULT_INTENTS[agent.identity.platform];
    if (defaults) {
      for (const intent of defaults) intents.add(intent);
    }
  }

  return intents;
}

function runtimeLaneFor(agent: RegisteredAgent): RuntimeLane {
  return {
    protocol: agent.protocol,
    tier: agent.tier,
    platform: agent.identity.platform,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AssignmentRouterService {
  constructor(
    private readonly registry: AgentRegistryService = getAgentRegistryService(),
    private readonly matcher: CapabilityMatcherService = getCapabilityMatcher(),
    private readonly workspaces: WorkspaceService = getWorkspaceService(),
  ) {}

  /**
   * Select a target agent for a task within a workspace.
   *
   * @param task       The routable task (capabilities, intent, optional assignee).
   * @param workspaceId The workspace whose policy / membership gates eligibility.
   */
  route(task: RoutableTask, workspaceId: string): AssignmentDecision {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      // Unknown workspace: fail closed rather than routing to the whole
      // registry. There is no membership context to gate on.
      return {
        agentId: null,
        reason: `Workspace "${workspaceId}" not found.`,
        viaExplicitAssignee: false,
        runtime: null,
        health: null,
        candidates: [],
      };
    }
    return this.routeWithPolicy(task, { memberAgentIds: [...ws.memberAgentIds] });
  }

  /**
   * Select a target agent using an explicitly-supplied policy. Useful for
   * tests and callers that already hold the workspace policy.
   */
  routeWithPolicy(task: RoutableTask, policy: WorkspaceRoutingPolicy): AssignmentDecision {
    const memberSet = new Set(policy.memberAgentIds);

    // --- 1. Explicit assignee override -------------------------------------
    if (task.assigneeAgentId) {
      return this.resolveExplicitAssignee(task.assigneeAgentId, memberSet, policy);
    }

    // --- 2. Build the eligible candidate pool (policy membership) -----------
    const eligible = this.registry
      .list()
      .filter((agent) => memberSet.size === 0 || memberSet.has(agent.identity.id));

    if (eligible.length === 0) {
      return {
        agentId: null,
        reason:
          memberSet.size === 0
            ? 'No agents registered.'
            : 'No registered agents are members of the workspace.',
        viaExplicitAssignee: false,
        runtime: null,
        health: null,
        candidates: [],
      };
    }

    // --- 3. Capability scores ----------------------------------------------
    const requirements: TaskRequirements = {
      requiredCapabilities: task.requiredCapabilities ?? [],
      preferredCapabilities: task.preferredCapabilities ?? [],
      ...(task.preferredPlatform ? { preferredPlatform: task.preferredPlatform } : {}),
    };
    const matchResult = this.matcher.matchAgents(requirements);
    const capabilityScoreById = new Map<string, number>();
    for (const m of matchResult.matches) {
      capabilityScoreById.set(m.agentId, m.score);
    }

    // --- 4 + 5. Score each eligible agent (capability + intent + health) ---
    const candidates: AssignmentCandidate[] = [];
    for (const agent of eligible) {
      const agentId = agent.identity.id;

      // When required capabilities are specified, an agent that scored 0
      // (i.e. matched none) is not a viable candidate.
      const capabilityScore = capabilityScoreById.get(agentId);
      const hasRequired = (task.requiredCapabilities ?? []).length > 0;
      if (hasRequired && (capabilityScore === undefined || capabilityScore === 0)) {
        continue;
      }
      const resolvedCapScore = capabilityScore ?? 0;

      const intentMatch = task.intent
        ? collectSupportedIntents(agent).has(String(task.intent).toLowerCase())
        : true;

      const health = this.registry.getHealth(agentId);
      const healthy = health.online;

      if (policy.requireHealthy && !healthy) {
        continue;
      }

      const score =
        resolvedCapScore +
        (intentMatch ? INTENT_MATCH_BONUS : 0) +
        (healthy ? HEALTH_BONUS : 0);

      candidates.push({
        agentId,
        agentName: agent.identity.name,
        capabilityScore: resolvedCapScore,
        intentMatch,
        healthy,
        score,
        runtime: runtimeLaneFor(agent),
        reason: this.buildReason({
          capabilityScore: resolvedCapScore,
          intentMatch,
          intent: task.intent,
          healthy,
        }),
      });
    }

    if (candidates.length === 0) {
      return {
        agentId: null,
        reason: policy.requireHealthy
          ? 'No eligible agent matched capabilities while online/healthy.'
          : 'No eligible agent matched the required capabilities.',
        viaExplicitAssignee: false,
        runtime: null,
        health: null,
        candidates: [],
      };
    }

    // Rank: combined score desc, then intent match, then health, then tier-1 first.
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.intentMatch !== b.intentMatch) return a.intentMatch ? -1 : 1;
      if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
      const tierRank = (t: RegisteredAgent['tier']) => (t === 'tier1' ? 0 : 1);
      return tierRank(a.runtime.tier) - tierRank(b.runtime.tier);
    });

    const best = candidates[0];
    logger.debug(
      { agentId: best.agentId, score: best.score, candidateCount: candidates.length },
      'assignment routed',
    );

    return {
      agentId: best.agentId,
      reason: best.reason,
      viaExplicitAssignee: false,
      runtime: best.runtime,
      health: this.registry.getHealth(best.agentId),
      candidates,
    };
  }

  // -- Private helpers ------------------------------------------------------

  private resolveExplicitAssignee(
    assigneeAgentId: string,
    memberSet: Set<string>,
    policy: WorkspaceRoutingPolicy,
  ): AssignmentDecision {
    const agent = this.registry.get(assigneeAgentId);
    if (!agent) {
      return {
        agentId: null,
        reason: `Explicit assignee "${assigneeAgentId}" is not a registered agent.`,
        viaExplicitAssignee: true,
        runtime: null,
        health: null,
        candidates: [],
      };
    }

    if (memberSet.size > 0 && !memberSet.has(assigneeAgentId)) {
      return {
        agentId: null,
        reason: `Explicit assignee "${assigneeAgentId}" is not a member of the workspace.`,
        viaExplicitAssignee: true,
        runtime: null,
        health: null,
        candidates: [],
      };
    }

    const health = this.registry.getHealth(assigneeAgentId);
    if (policy.requireHealthy && !health.online) {
      return {
        agentId: null,
        reason: `Explicit assignee "${assigneeAgentId}" is offline and the workspace requires healthy agents.`,
        viaExplicitAssignee: true,
        runtime: null,
        health,
        candidates: [],
      };
    }

    return {
      agentId: assigneeAgentId,
      reason: `Honoured explicit assignee "${assigneeAgentId}".`,
      viaExplicitAssignee: true,
      runtime: runtimeLaneFor(agent),
      health,
      candidates: [
        {
          agentId: assigneeAgentId,
          agentName: agent.identity.name,
          capabilityScore: 0,
          intentMatch: true,
          healthy: health.online,
          score: 0,
          runtime: runtimeLaneFor(agent),
          reason: 'Explicit assignee override.',
        },
      ],
    };
  }

  private buildReason(params: {
    capabilityScore: number;
    intentMatch: boolean;
    intent?: RecoderIntent;
    healthy: boolean;
  }): string {
    const parts: string[] = [`Capability score ${params.capabilityScore}.`];
    if (params.intent) {
      parts.push(
        params.intentMatch
          ? `Supports intent "${params.intent}".`
          : `Does not advertise intent "${params.intent}".`,
      );
    }
    parts.push(params.healthy ? 'Online/healthy.' : 'Offline (deprioritised).');
    return parts.join(' ');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: AssignmentRouterService | null = null;

export function getAssignmentRouterService(): AssignmentRouterService {
  if (!_instance) {
    _instance = new AssignmentRouterService();
  }
  return _instance;
}

export function resetAssignmentRouterService(): void {
  _instance = null;
}
