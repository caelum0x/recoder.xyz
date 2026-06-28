import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyEnginePort, PolicyEvaluationRequest } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import { makeEvaluatePolicy, type GovernanceEvaluateOptions } from './engine';

/**
 * GovernancePolicyEngine implements the agent-os `PolicyEnginePort` using the
 * fused governance policy chain. This is how the control plane plugs governance
 * in wherever it expects a `PolicyEnginePort` — governance is an adapter around
 * agent-os state, not an owner of it.
 *
 * `PolicyEvaluationRequest` from agent-os and `PolicyInput` from agent-policy are
 * structurally compatible (both carry actor/task/action/target/workLocks/now),
 * but `action` is typed as `string` on the port and a union on the input. We
 * narrow defensively: an unknown action falls through to the chain, where the
 * upstream rules simply do not match and the default-allow fires — which is then
 * still subject to the caller's tier/enforcement gating in `decide()`.
 */
export class GovernancePolicyEngine implements PolicyEnginePort {
  private readonly evaluate_: (input: PolicyInput) => PolicyDecision;

  constructor(options?: GovernanceEvaluateOptions) {
    this.evaluate_ = makeEvaluatePolicy(options);
  }

  evaluate(input: PolicyEvaluationRequest): PolicyDecision {
    // The port's `action` is `string`; the chain's is a union. The cast is safe
    // because every rule guards on the action it cares about, and unknown
    // actions just don't match any rule.
    const policyInput = {
      actor: input.actor,
      task: input.task,
      action: input.action as PolicyInput['action'],
      target: input.target,
      workLocks: input.workLocks,
      now: input.now,
    } satisfies PolicyInput;

    return this.evaluate_(policyInput);
  }
}
