/**
 * Risk-tier vocabulary — the shared, PURE ordering over the four risk tiers.
 *
 * This is deliberately cross-domain vocabulary (the governance domain, the
 * engines governance re-expose, and the policy evaluators all speak it), so it
 * lives in the leaf policy package rather than any single domain. Keep it
 * byte-compatible with the Rust kernel's risk vocabulary (`recoder-governance-types`)
 * — Rust is the wire authority; this is the control-plane view. No I/O, no state.
 */

/**
 * The totally-ordered risk classification. A higher tier subsumes the
 * approval/enforcement requirements of a lower one. Compare through
 * {@link riskTierRank}, never by string sort.
 */
export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

/** Numeric rank for the four tiers (deny-biased max). */
const RISK_TIER_RANK: Readonly<Record<RiskTier, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Rank of a tier (0..3). */
export function riskTierRank(tier: RiskTier): number {
  return RISK_TIER_RANK[tier];
}

/** The more severe of two tiers (deny-biased toward higher risk). */
export function maxRiskTier(a: RiskTier, b: RiskTier): RiskTier {
  return RISK_TIER_RANK[a] >= RISK_TIER_RANK[b] ? a : b;
}
