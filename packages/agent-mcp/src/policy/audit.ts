import type { PolicyDecision } from '@recoder/agent-os';
import type { McpToolCallDecision, McpToolCallInput } from '../permissions';

export type McpToolCallStatus = 'requested' | 'denied' | 'needs_approval' | 'approved' | 'completed' | 'failed';

export type McpToolCall = {
  callId: string;
  serverId: string;
  toolName: string;
  actorAgentId: string;
  taskId?: string;
  args: Record<string, unknown>;
  requestedAt: string;
  completedAt?: string;
  status: McpToolCallStatus;
};

export type McpToolAuditEvent = {
  eventId: string;
  call: McpToolCall;
  decision: McpToolCallDecision;
  policyDecision?: PolicyDecision;
  error?: string;
};

export function createMcpToolCall(input: McpToolCallInput, now = new Date().toISOString()): McpToolCall {
  return {
    callId: `mcp_${now.replace(/[^0-9]/g, '')}_${Math.random().toString(16).slice(2)}`,
    serverId: input.server.serverId,
    toolName: input.toolName,
    actorAgentId: input.actor.agentId,
    taskId: input.task?.taskId,
    args: input.args,
    requestedAt: now,
    status: 'requested',
  };
}

export function createMcpToolAuditEvent(input: {
  call: McpToolCall;
  decision: McpToolCallDecision;
  status: McpToolCallStatus;
  error?: string;
  now?: string;
}): McpToolAuditEvent {
  return {
    eventId: `audit_${input.call.callId}`,
    call: {
      ...input.call,
      status: input.status,
      completedAt: input.status === 'requested' ? input.call.completedAt : input.now ?? new Date().toISOString(),
    },
    decision: input.decision,
    policyDecision: input.decision.policyDecision,
    error: input.error,
  };
}
