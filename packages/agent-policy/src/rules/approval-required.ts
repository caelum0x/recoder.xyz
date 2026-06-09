import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';

export function evaluateApprovalRequired(input: PolicyInput): PolicyDecision | null {
  if (input.action === 'branch.push' && !input.actor.permissions.allowGitWrite) {
    return decision(input, 'needs_approval', 'Branch pushes require approval by policy.');
  }
  if (input.action === 'pr.create' && !input.actor.permissions.allowPrCreation) {
    return decision(input, 'needs_approval', 'Pull request creation requires approval by policy.');
  }
  return null;
}
