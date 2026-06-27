/**
 * PolicyGatePort — asks governance whether a coordination action is allowed.
 * Every dispatch + gated handoff consults this; a deny is terminal (design §7).
 * Coordination is the asker, never the owner of policy.
 */

export type PolicyAction =
  | 'dispatch_task'
  | 'acquire_lock'
  | 'initiate_handoff'
  | 'auto_heal';

export type PolicyQuery = {
  action: PolicyAction;
  spaceId: string;
  agentId?: string;
  taskId?: string;
  context?: Record<string, unknown>;
};

export type PolicyDecision = {
  allowed: boolean;
  /** Present when `allowed` is false. */
  reason?: string;
  /** True if the action needs human approval before proceeding. */
  requiresApproval?: boolean;
};

export interface PolicyGatePort {
  evaluate(query: PolicyQuery): Promise<PolicyDecision>;
}
