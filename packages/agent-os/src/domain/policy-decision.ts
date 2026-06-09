export type PolicyDecisionEffect = 'allow' | 'deny' | 'needs_approval';

export type PolicyDecision = {
  decisionId: string;
  effect: PolicyDecisionEffect;
  action: string;
  actorAgentId: string;
  taskId?: string;
  reason: string;
  createdAt: string;
  approval?: {
    required: boolean;
    gateId?: string;
    reason?: string;
  };
  findings?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

