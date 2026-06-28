/**
 * RiskTier — the canonical, totally-ordered risk classification used across
 * routing, approval, and enforcement. This is the TS mirror of the Rust
 * `recoder-governance-types/src/risk.rs` `RiskTier` (Rust is the wire authority;
 * this file is the control-plane view).
 *
 * Ordering matters: a higher tier always subsumes the approval/enforcement
 * requirements of a lower one. Comparisons go through the explicit rank table so
 * the order is never accidentally string-sorted.
 */

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export const RISK_TIERS: readonly RiskTier[] = ['low', 'medium', 'high', 'critical'] as const;

const RISK_TIER_RANK: Readonly<Record<RiskTier, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function riskTierRank(tier: RiskTier): number {
  return RISK_TIER_RANK[tier];
}

/** Returns true when `a` is at least as severe as `b`. */
export function riskTierGte(a: RiskTier, b: RiskTier): boolean {
  return RISK_TIER_RANK[a] >= RISK_TIER_RANK[b];
}

export function riskTierGt(a: RiskTier, b: RiskTier): boolean {
  return RISK_TIER_RANK[a] > RISK_TIER_RANK[b];
}

/** Returns the more severe of the two tiers (deny-biased toward higher risk). */
export function maxRiskTier(a: RiskTier, b: RiskTier): RiskTier {
  return RISK_TIER_RANK[a] >= RISK_TIER_RANK[b] ? a : b;
}

/** Clamp a tier to a ceiling. Used by the auto-approver tier-ceiling cap. */
export function clampRiskTier(tier: RiskTier, ceiling: RiskTier): RiskTier {
  return RISK_TIER_RANK[tier] > RISK_TIER_RANK[ceiling] ? ceiling : tier;
}

/** Parse an arbitrary string into a RiskTier, defaulting deny-biased to `critical`. */
export function parseRiskTier(value: string | undefined, fallback: RiskTier = 'critical'): RiskTier {
  if (value && (RISK_TIERS as readonly string[]).includes(value)) {
    return value as RiskTier;
  }
  return fallback;
}

export function isRiskTier(value: unknown): value is RiskTier {
  return typeof value === 'string' && (RISK_TIERS as readonly string[]).includes(value);
}
