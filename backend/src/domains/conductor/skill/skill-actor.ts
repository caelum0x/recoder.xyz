/**
 * Build the canonical, deny-biased {@link PolicyInput} for a skill-action
 * invocation — the SAME shape the MCP edge (`buildEdgeActor`) and the governance
 * mapper (`buildKernelActor`) hand the policy engine, so a skill call is gated by
 * the EXACT same fused rule chain as every other governed action:
 *
 *  - the action is modeled as a `tool.call` whose `toolName` is the qualified
 *    skill action id, so the shipped MCP-tool-risk + tool-use rules genuinely
 *    apply (a `deploy`/`secret`/… action id surfaces `needs_approval`; a matching
 *    deny/approval toolRule surfaces `deny`/`needs_approval`);
 *  - the action's `requiredCapabilities` are carried onto the actor profile so a
 *    capability-aware rule can genuinely gate on them (they are NOT ambient
 *    grants — the profile itself holds NO standing high-risk rights);
 *  - the actor is deny-biased (no file/network/shell/git/pr/secrets rights), so an
 *    un-ruled action defaults to `allow` ONLY for a benign, capability-typed call.
 */
import type { AgentProfile } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import type { SkillAction } from './skill.types.js';

/** The fully-qualified policy tool name for a skill action (stable, greppable). */
export function qualifiedSkillToolName(skillId: string, actionId: string): string {
  return `skill.${skillId}.${actionId}`;
}

/** A deny-biased actor for a skill invocation, carrying the action's capabilities. */
export function buildSkillActor(
  actorId: string,
  action: SkillAction,
  workspace: string,
): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId: actorId || 'anonymous',
    displayName: `Skill actor ${actorId || 'anonymous'}`,
    vendorSurface: 'custom',
    connectorId: 'skill-model',
    runtimeKind: 'local',
    // The action's required capabilities ride the profile so a capability-aware
    // rule can gate on them; they grant NOTHING by themselves.
    capabilities: action.requiredCapabilities.map((capabilityId) => ({
      capabilityId,
      kind: 'custom' as const,
      label: capabilityId,
    })),
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      allowNetwork: false,
      allowShell: false,
      // No standing high-risk rights — those must be governed/approved.
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'workspace_root', allowedRoots: workspace ? [workspace] : [] },
    health: { status: 'healthy', checkedAt: now },
    lastSeenAt: now,
  };
}

/**
 * Build the policy input for a skill action, capability-typed and canonical. The
 * `now` is threaded so a caller/test controls the decision clock.
 */
export function buildSkillPolicyInput(input: {
  readonly actorId: string;
  readonly skillId: string;
  readonly action: SkillAction;
  readonly workspace: string;
  readonly now?: string;
}): PolicyInput {
  return {
    actor: buildSkillActor(input.actorId, input.action, input.workspace),
    action: 'tool.call',
    target: {
      toolName: qualifiedSkillToolName(input.skillId, input.action.id),
      environment: input.workspace,
    },
    ...(input.now ? { now: input.now } : {}),
  };
}
