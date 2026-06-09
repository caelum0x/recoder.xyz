import type { McpToolCallDecision, McpToolCallInput } from '../permissions';
import { canCallMcpTool } from '../permissions';
import { evaluatePolicy } from '@recoder/agent-policy';
import { estimateMcpToolRisk } from './tool-risk';

export function checkMcpToolPermission(input: McpToolCallInput): McpToolCallDecision {
  const base = canCallMcpTool(input);
  if (!base.allowed) {
    return base;
  }

  const risk = estimateMcpToolRisk(input.toolName);
  const policyDecision = evaluatePolicy({
    actor: input.actor,
    task: input.task,
    action: 'tool.call',
    target: {
      toolName: input.toolName,
    },
  });

  if (policyDecision.effect === 'deny') {
    return {
      allowed: false,
      reason: policyDecision.reason,
      policyDecision,
    };
  }

  if (policyDecision.effect === 'needs_approval') {
    return {
      allowed: false,
      requiresApproval: true,
      reason: policyDecision.reason,
      policyDecision,
    };
  }

  return {
    allowed: true,
    reason: `Allowed by MCP policy router. Risk=${risk}.`,
    policyDecision,
  };
}
