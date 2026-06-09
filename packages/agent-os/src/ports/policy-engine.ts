import type { AgentProfile, PolicyDecision, TaskSpec, WorkLock } from '../domain';

export type PolicyEvaluationRequest = {
  actor: AgentProfile;
  task?: TaskSpec;
  action: string;
  target: {
    path?: string;
    command?: string;
    toolName?: string;
    environment?: string;
  };
  workLocks?: WorkLock[];
  now?: string;
};

export interface PolicyEnginePort {
  evaluate(input: PolicyEvaluationRequest): Promise<PolicyDecision> | PolicyDecision;
}
