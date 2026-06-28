import type { AgentProfile, TaskSpec, WorkLock } from '@recoder/agent-os';
import type { PolicyAction } from '@recoder/agent-policy';

/**
 * GovernanceAction — the action space governance reasons about. It is a superset
 * of @recoder/agent-policy's `PolicyAction` so the policy chain can be composed
 * directly while leaving room for governance-only actions in future.
 */
export type GovernanceAction = PolicyAction;

/**
 * GovernanceTarget — the concrete subject of an action. Mirrors the agent-policy
 * `PolicyInput.target` shape so the fused chain can pass it straight through.
 */
export type GovernanceTarget = {
  readonly path?: string;
  readonly command?: string;
  readonly toolName?: string;
  readonly environment?: string;
};

/**
 * Extra context that influences tier classification + enforcement but is not
 * part of the policy rule chain. All optional and defensively defaulted.
 */
export type GovernanceContext = {
  /** Workspace root used for file-write boundary containment checks. */
  readonly workspaceRoot?: string;
  /** Approximate prompt size in tokens (complexity heuristic). */
  readonly promptTokens?: number;
  /** Number of distinct tools the agent has available (complexity heuristic). */
  readonly toolCount?: number;
  /** Conversation/turn depth (complexity heuristic). */
  readonly conversationDepth?: number;
  /** Subagent nesting depth (tool-access depth filter). */
  readonly subagentDepth?: number;
  /** Whether the surrounding run is in an explicitly autonomous mode. */
  readonly autonomous?: boolean;
  /** Free-form bash input being checked (for read-only heuristics). */
  readonly bashInput?: string;
  /** Arbitrary metadata captured into the audit detail (sanitized). */
  readonly metadata?: Record<string, unknown>;
};

/**
 * GovernanceRequest — the immutable input to `Governance.decide()`. It carries
 * everything the fused pipeline needs: the actor, the (optional) task spec, the
 * action + target, any held work locks, and complexity/enforcement context.
 */
export type GovernanceRequest = {
  readonly requestId: string;
  readonly actor: AgentProfile;
  readonly task?: TaskSpec;
  readonly action: GovernanceAction;
  readonly target: GovernanceTarget;
  readonly workLocks?: readonly WorkLock[];
  readonly context?: GovernanceContext;
  readonly now?: string;
};

let requestCounter = 0;

/** Build a GovernanceRequest with a generated id + timestamp defaults. */
export function createGovernanceRequest(
  input: Omit<GovernanceRequest, 'requestId' | 'now'> & { requestId?: string; now?: string },
): GovernanceRequest {
  requestCounter += 1;
  return {
    requestId: input.requestId ?? `gov_req_${Date.now()}_${requestCounter}`,
    actor: input.actor,
    task: input.task,
    action: input.action,
    target: input.target,
    workLocks: input.workLocks,
    context: input.context,
    now: input.now ?? new Date().toISOString(),
  };
}
