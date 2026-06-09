import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';

export function evaluateMcpToolRisk(input: PolicyInput): PolicyDecision | null {
  if (input.action !== 'tool.call' || !input.target.toolName) {
    return null;
  }

  if (/secret|billing|production|deploy|delete|branch\.push|pr\.create/.test(input.target.toolName)) {
    return decision(input, 'needs_approval', `MCP tool is high-risk: ${input.target.toolName}`);
  }

  return null;
}
