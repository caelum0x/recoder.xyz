import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import { makeEvaluatePolicy, type GovernanceEvaluateOptions } from '../engine';

/**
 * KernelPolicyEngine — the evaluator that would delegate risky checks to the
 * Rust governance daemon over IPC. The Rust daemon is DEFERRED on this build
 * (cannot compile Rust on this disk), so the constructor accepts an optional
 * `daemon` delegate; when it is absent or unavailable, the evaluator falls back
 * to the pure-TS fused chain and marks the decision metadata as `degraded` so
 * the caller knows the daemon did not participate.
 *
 * This is REAL fail-safe behavior: when the daemon is down we still produce a
 * deny-biased policy decision locally — never a silent allow, and never a fake
 * "daemon said ok".
 */

export interface KernelPolicyDelegate {
  /** Returns the daemon's policy decision, or null if it could not decide. */
  evaluate(input: PolicyInput): PolicyDecision | null;
  /** Liveness probe. */
  available(): boolean;
}

export class KernelPolicyEngine {
  private readonly fallback: (input: PolicyInput) => PolicyDecision;

  constructor(
    private readonly delegate?: KernelPolicyDelegate,
    options?: GovernanceEvaluateOptions,
  ) {
    this.fallback = makeEvaluatePolicy(options);
  }

  /** True when a live daemon delegate is present. */
  daemonAvailable(): boolean {
    return Boolean(this.delegate?.available());
  }

  evaluate(input: PolicyInput): PolicyDecision {
    if (this.delegate && this.delegate.available()) {
      const remote = this.delegate.evaluate(input);
      if (remote) {
        return {
          ...remote,
          metadata: { ...(remote.metadata ?? {}), evaluator: 'kernel-daemon' },
        };
      }
    }

    const local = this.fallback(input);
    return {
      ...local,
      metadata: {
        ...(local.metadata ?? {}),
        evaluator: 'ts-fallback',
        degraded: true,
      },
    };
  }
}
