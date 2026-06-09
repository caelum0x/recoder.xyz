import type { PolicyEnginePort, PolicyEvaluationRequest } from '@recoder/agent-os';
import { evaluatePolicy } from '../engine';

export class TypeScriptPolicyEngine implements PolicyEnginePort {
  evaluate(input: PolicyEvaluationRequest) {
    return evaluatePolicy({
      actor: input.actor,
      task: input.task,
      action: input.action as never,
      target: input.target,
      workLocks: input.workLocks,
      now: input.now,
    });
  }
}
