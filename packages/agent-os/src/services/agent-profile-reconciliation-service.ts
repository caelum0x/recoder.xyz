import type {
  AgentCapability,
  AgentProfile,
  ApprovalPolicy,
  CwdPolicy,
  ToolCapability,
} from '../domain';

export type AgentIdentityBinding = {
  workspaceId?: string;
  projectId?: string;
  sessionScope?: string;
};

export type ReconcileAgentProfileInput = {
  existingAgents: AgentProfile[];
  incoming: AgentProfile;
  binding?: AgentIdentityBinding;
  now?: string;
  policyMode?: 'preserve_existing' | 'replace_with_incoming';
};

export type ReconcileAgentProfileResult = {
  action: 'created' | 'reconciled';
  profile: AgentProfile;
  agents: AgentProfile[];
  previousAgentId?: string;
};

export class AgentProfileReconciliationService {
  reconcile(input: ReconcileAgentProfileInput): ReconcileAgentProfileResult {
    const now = input.now ?? new Date().toISOString();
    const existing = findExistingAgent(input.existingAgents, input.incoming, input.binding);
    const profile = existing
      ? mergeAgentProfile(existing, input.incoming, now, input.policyMode ?? 'preserve_existing', input.binding)
      : stampAgentProfile(input.incoming, now, input.binding);
    const agents = upsertAgent(input.existingAgents, profile);

    return {
      action: existing ? 'reconciled' : 'created',
      profile,
      agents,
      previousAgentId: existing?.agentId,
    };
  }
}

function findExistingAgent(
  agents: AgentProfile[],
  incoming: AgentProfile,
  binding?: AgentIdentityBinding,
): AgentProfile | undefined {
  return agents.find((agent) => agent.agentId === incoming.agentId)
    ?? agents.find((agent) => {
      return agent.connectorId === incoming.connectorId
        && agent.vendorSurface === incoming.vendorSurface
        && agent.runtimeKind === incoming.runtimeKind
        && bindingMatches(agent, binding);
    });
}

function mergeAgentProfile(
  existing: AgentProfile,
  incoming: AgentProfile,
  now: string,
  policyMode: NonNullable<ReconcileAgentProfileInput['policyMode']>,
  binding?: AgentIdentityBinding,
): AgentProfile {
  const replacePolicy = policyMode === 'replace_with_incoming';

  return stampAgentProfile({
    ...existing,
    displayName: incoming.displayName || existing.displayName,
    connectorId: incoming.connectorId,
    vendorSurface: incoming.vendorSurface,
    runtimeKind: incoming.runtimeKind,
    capabilities: mergeCapabilities(existing.capabilities, incoming.capabilities),
    tools: mergeTools(existing.tools, incoming.tools),
    supportedTaskIntents: uniqueStrings([
      ...existing.supportedTaskIntents,
      ...incoming.supportedTaskIntents,
    ]),
    permissions: replacePolicy ? incoming.permissions : existing.permissions,
    approvalPolicy: replacePolicy ? incoming.approvalPolicy : mergeApprovalPolicy(existing.approvalPolicy, incoming.approvalPolicy),
    memoryScope: replacePolicy ? incoming.memoryScope : existing.memoryScope,
    cwdPolicy: replacePolicy ? incoming.cwdPolicy : mergeCwdPolicy(existing.cwdPolicy, incoming.cwdPolicy),
    health: {
      ...incoming.health,
      details: {
        ...(existing.health.details ?? {}),
        ...(incoming.health.details ?? {}),
      },
    },
  }, now, binding);
}

function stampAgentProfile(agent: AgentProfile, now: string, binding?: AgentIdentityBinding): AgentProfile {
  return {
    ...agent,
    health: {
      ...agent.health,
      checkedAt: now,
      details: {
        ...(agent.health.details ?? {}),
        ...(binding?.workspaceId ? { workspaceId: binding.workspaceId } : {}),
        ...(binding?.projectId ? { projectId: binding.projectId } : {}),
        ...(binding?.sessionScope ? { sessionScope: binding.sessionScope } : {}),
      },
    },
    lastSeenAt: now,
  };
}

function bindingMatches(agent: AgentProfile, binding?: AgentIdentityBinding): boolean {
  if (!binding) {
    return true;
  }

  return matchesOptionalDetail(agent, 'workspaceId', binding.workspaceId)
    && matchesOptionalDetail(agent, 'projectId', binding.projectId)
    && matchesOptionalDetail(agent, 'sessionScope', binding.sessionScope);
}

function matchesOptionalDetail(agent: AgentProfile, key: string, expected?: string): boolean {
  if (!expected) {
    return true;
  }
  return agent.health.details?.[key] === expected;
}

function mergeCapabilities(existing: AgentCapability[], incoming: AgentCapability[]): AgentCapability[] {
  return mergeBy(existing, incoming, (capability) => capability.capabilityId);
}

function mergeTools(existing: ToolCapability[], incoming: ToolCapability[]): ToolCapability[] {
  return mergeBy(existing, incoming, (tool) => tool.toolName);
}

function mergeApprovalPolicy(existing: ApprovalPolicy, incoming: ApprovalPolicy): ApprovalPolicy {
  return {
    ...existing,
    requiredRules: mergeBy(existing.requiredRules, incoming.requiredRules, (rule) => rule.id),
  };
}

function mergeCwdPolicy(existing: CwdPolicy, incoming: CwdPolicy): CwdPolicy {
  return {
    ...existing,
    allowedRoots: uniqueStrings([...existing.allowedRoots, ...incoming.allowedRoots]),
    preferredRoot: existing.preferredRoot ?? incoming.preferredRoot,
  };
}

function mergeBy<T>(existing: T[], incoming: T[], getKey: (item: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const item of existing) {
    merged.set(getKey(item), item);
  }
  for (const item of incoming) {
    merged.set(getKey(item), item);
  }
  return [...merged.values()];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function upsertAgent(agents: AgentProfile[], profile: AgentProfile): AgentProfile[] {
  const index = agents.findIndex((agent) => agent.agentId === profile.agentId);
  if (index < 0) {
    return [...agents, profile];
  }
  return [
    ...agents.slice(0, index),
    profile,
    ...agents.slice(index + 1),
  ];
}
