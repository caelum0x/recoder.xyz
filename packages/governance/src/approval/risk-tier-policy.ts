import { type RiskTier, riskTierGte } from '../domain/risk-tier';

/**
 * risk-tier-policy — the control-plane mirror of the Rust approval classifier. It
 * declares, per tier, whether human approval is required and the timeout after
 * which an unanswered approval auto-denies (fail-closed).
 *
 * Defaults (deny-biased):
 *   low      -> no approval
 *   medium   -> no approval (routine)
 *   high     -> approval required, 30 min timeout
 *   critical -> approval required, 15 min timeout (shorter — riskier)
 */

export type TierApprovalRule = {
  readonly requiresApproval: boolean;
  /** Milliseconds before an unanswered approval auto-denies. */
  readonly timeoutMs: number;
};

export type RiskTierPolicy = Readonly<Record<RiskTier, TierApprovalRule>>;

const THIRTY_MIN = 30 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;

export const DEFAULT_RISK_TIER_POLICY: RiskTierPolicy = {
  low: { requiresApproval: false, timeoutMs: 0 },
  medium: { requiresApproval: false, timeoutMs: 0 },
  high: { requiresApproval: true, timeoutMs: THIRTY_MIN },
  critical: { requiresApproval: true, timeoutMs: FIFTEEN_MIN },
};

export class RiskTierApprovalPolicy {
  constructor(private readonly policy: RiskTierPolicy = DEFAULT_RISK_TIER_POLICY) {}

  requiresApproval(tier: RiskTier): boolean {
    return this.policy[tier].requiresApproval;
  }

  timeoutMs(tier: RiskTier): number {
    return this.policy[tier].timeoutMs;
  }

  /** The lowest tier that requires approval under this policy. */
  approvalFloor(): RiskTier | null {
    const order: RiskTier[] = ['low', 'medium', 'high', 'critical'];
    return order.find((tier) => this.policy[tier].requiresApproval) ?? null;
  }

  /** True when `tier` is at or above the approval floor. */
  isAtOrAboveFloor(tier: RiskTier): boolean {
    const floor = this.approvalFloor();
    return floor !== null && riskTierGte(tier, floor);
  }
}
