import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from './engine';

export function decision(input: PolicyInput, effect: PolicyDecision['effect'], reason: string, findings?: Array<Record<string, unknown>>): PolicyDecision {
  return {
    decisionId: `policy_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    effect,
    action: input.action,
    actorAgentId: input.actor.agentId,
    taskId: input.task?.taskId,
    reason,
    createdAt: input.now ?? new Date().toISOString(),
    approval: effect === 'needs_approval' ? { required: true } : undefined,
    findings,
  };
}
