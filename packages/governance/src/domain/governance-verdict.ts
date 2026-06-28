import type { PolicyDecision, PolicyDecisionEffect } from '@recoder/agent-os';
import type { RiskTier } from './risk-tier';
import type { RoutingDecision } from './routing-decision';
import type { EnforcementResult } from './enforcement-result';

/**
 * GovernanceVerdict — the fused output of `Governance.decide()`. It is the
 * single record the runtime adapter acts on: it carries the final effect, the
 * risk tier, the routing decision, the permission-enforcement result, the
 * policy decision that produced it, and the audit hash that sealed it.
 *
 * The verdict is immutable. `effect` is the source of truth for whether the
 * runtime may proceed.
 */
export type GovernanceEffect = PolicyDecisionEffect; // 'allow' | 'deny' | 'needs_approval'

export type GovernanceVerdict = {
  readonly verdictId: string;
  readonly requestId: string;
  readonly effect: GovernanceEffect;
  readonly tier: RiskTier;
  readonly reason: string;
  /** The composed policy decision (from the fused @recoder/agent-policy chain). */
  readonly policy: PolicyDecision;
  /** Routing decision; unroutable when denied. */
  readonly routing: RoutingDecision;
  /** Permission enforcement outcome (allowed/denied), if enforcement ran. */
  readonly enforcement?: EnforcementResult;
  /** Hash of the audit entry that recorded this verdict, when audit is on. */
  readonly auditHash?: string;
  /** When the daemon was unreachable and the conservative fallback was used. */
  readonly degraded: boolean;
  /** Approval gate id when `effect === 'needs_approval'`. */
  readonly approvalGateId?: string;
  readonly createdAt: string;
};

export function verdictAllows(verdict: GovernanceVerdict): boolean {
  return verdict.effect === 'allow';
}

export function verdictBlocks(verdict: GovernanceVerdict): boolean {
  return verdict.effect === 'deny' || verdict.effect === 'needs_approval';
}
