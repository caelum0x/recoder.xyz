import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';

export function evaluateToolUse(input: PolicyInput): PolicyDecision | null {
  if (input.action === 'command.run' && !input.actor.permissions.allowShell) {
    return decision(input, 'deny', 'Shell commands are disabled for this agent.');
  }
  if (input.action === 'tool.call' && input.target.toolName) {
    const rule = input.actor.permissions.toolRules.find((candidate) => candidate.toolName === input.target.toolName);
    if (rule?.effect === 'deny') {
      return decision(input, 'deny', rule.reason ?? `Tool denied by policy: ${input.target.toolName}`);
    }
    if (rule?.requiresApproval) {
      return decision(input, 'needs_approval', rule.reason ?? `Tool requires approval: ${input.target.toolName}`);
    }
  }
  return null;
}
