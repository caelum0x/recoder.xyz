import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '../engine';
import { decision } from '../decision';

export function evaluateNetworkAccess(input: PolicyInput): PolicyDecision | null {
  if (input.action === 'deploy.preview' && !input.actor.permissions.allowNetwork) {
    return decision(input, 'deny', 'Network access is disabled for this agent.');
  }
  return null;
}
