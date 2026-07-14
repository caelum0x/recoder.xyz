import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';

export function evaluateMcpToolRisk(input: PolicyInput): PolicyDecision | null {
  if (input.action !== 'tool.call' || !input.target.toolName) {
    return null;
  }

  // 'clink' spawns a subprocess CLI (code execution); the outer CLI may be gated
  // but its clink-spawned child is not, so treat clink itself as high-risk.
  if (/secret|billing|production|deploy|delete|branch\.push|pr\.create|clink/.test(input.target.toolName)) {
    return decision(input, 'needs_approval', `MCP tool is high-risk: ${input.target.toolName}`);
  }

  return null;
}
