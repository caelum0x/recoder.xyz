import type { AgentProfile, PolicyDecision, TaskSpec } from '@recoder/agent-os';
import type { McpServerRegistration } from './registry';

export type McpToolCallInput = {
  server: McpServerRegistration;
  toolName: string;
  actor: AgentProfile;
  task?: TaskSpec;
  args: Record<string, unknown>;
};

export type McpToolCallDecision = {
  allowed: boolean;
  requiresApproval?: boolean;
  reason: string;
  policyDecision?: PolicyDecision;
};

export function canCallMcpTool(input: McpToolCallInput): McpToolCallDecision {
  if (!input.server.enabled) {
    return {
      allowed: false,
      reason: `MCP server disabled: ${input.server.serverId}`,
      policyDecision: createMcpPolicyDecision(input, 'deny', `MCP server disabled: ${input.server.serverId}`),
    };
  }
  if (!input.server.toolNames.includes(input.toolName)) {
    return {
      allowed: false,
      reason: `Tool not registered on MCP server: ${input.toolName}`,
      policyDecision: createMcpPolicyDecision(input, 'deny', `Tool not registered on MCP server: ${input.toolName}`),
    };
  }
  const rule = input.actor.permissions.toolRules.find((candidate) => candidate.toolName === input.toolName);
  if (rule?.effect === 'deny') {
    const reason = rule.reason ?? `Tool denied: ${input.toolName}`;
    return {
      allowed: false,
      reason,
      policyDecision: createMcpPolicyDecision(input, 'deny', reason),
    };
  }
  return {
    allowed: true,
    reason: 'Allowed by MCP registry and agent tool policy.',
    policyDecision: createMcpPolicyDecision(input, 'allow', 'Allowed by MCP registry and agent tool policy.'),
  };
}

function createMcpPolicyDecision(
  input: McpToolCallInput,
  effect: PolicyDecision['effect'],
  reason: string,
): PolicyDecision {
  const now = new Date().toISOString();
  return {
    decisionId: `policy_mcp_${now.replace(/[^0-9]/g, '')}_${Math.random().toString(16).slice(2)}`,
    effect,
    action: 'tool.call',
    actorAgentId: input.actor.agentId,
    taskId: input.task?.taskId,
    reason,
    createdAt: now,
    approval: effect === 'needs_approval' ? { required: true, reason } : undefined,
    metadata: {
      serverId: input.server.serverId,
      toolName: input.toolName,
    },
  };
}
