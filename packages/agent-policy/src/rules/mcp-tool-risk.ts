import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';

export function evaluateMcpToolRisk(input: PolicyInput): PolicyDecision | null {
  if (input.action !== 'tool.call' || !input.target.toolName) {
    return null;
  }

  // 'clink' spawns a subprocess CLI (code execution); the outer CLI may be gated
  // but its clink-spawned child is not, so treat clink itself as high-risk.
  // 'workflow.verify'/'workflow.exec' can run shell verification, so gate the
  // verify/exec-style workflow verbs (dot- or underscore-separated) without
  // over-broadening to harmless workflow tools (status, list, ...).
  if (/secret|billing|production|deploy|delete|branch\.push|pr\.create|clink|workflow[._](verify|exec)/.test(input.target.toolName)) {
    return decision(input, 'needs_approval', `MCP tool is high-risk: ${input.target.toolName}`);
  }

  return null;
}
