/**
 * ENFORCED_QUOTAS — website mirror of the backend billing gate's canonical
 * quota table.
 *
 * The backend `PLAN_QUOTAS`
 * (backend/src/domains/billing/services/plan-catalog.service.ts) is the SINGLE
 * SOURCE OF TRUTH for what the entitlement gate actually enforces. This constant
 * exists so the website pricing page advertises the SAME numbers a user will get
 * — previously the pricing page advertised ~10x the enforced quota (P1).
 *
 * Keep these values in lockstep with the backend. `subscription-plans.ts` derives
 * its advertised `limits.requests` / `limits.tokens` from this table, and
 * `__tests__/subscription-plans.test.ts` fails if advertised ever drifts from
 * enforced.
 *
 * Vocabulary bridge (backend UsageKind → advertised field):
 *   backend `cli_request` == advertised `requests`
 *   backend `token`       == advertised `tokens`
 * Unlimited is `0` in the backend; the website encodes it as `-1` (its existing
 * "unlimited" sentinel, matching lib/plan-limits.ts).
 */

/** Enforced tiers the website surfaces. Backend also has `team`/`max`. */
export type EnforcedTier = 'free' | 'pro' | 'enterprise';

/** The website's "unlimited" sentinel (backend encodes unlimited as `0`). */
export const UNLIMITED = -1 as const;

export interface EnforcedQuota {
  /** Backend `cli_request` limit for the billing window. `-1` = unlimited. */
  readonly requests: number;
  /** Backend `token` limit for the billing window. `-1` = unlimited. */
  readonly tokens: number;
}

export const ENFORCED_QUOTAS: Record<EnforcedTier, EnforcedQuota> = {
  free: { requests: 200, tokens: 100_000 },
  pro: { requests: 5_000, tokens: 5_000_000 },
  enterprise: { requests: UNLIMITED, tokens: UNLIMITED },
};

/**
 * Map a website checkout plan-id to its enforced tier. Mirrors the backend
 * catalog's PLAN_ALIASES normalization so the advertised quota matches what the
 * gate enforces. Unknown ids fall back to `free` (deny-safe).
 */
export function enforcedTierForPlanId(planId: string): EnforcedTier {
  const p = (planId ?? '').toLowerCase().trim();
  if (p === 'free') return 'free';
  if (p === 'enterprise' || p.startsWith('enterprise-')) return 'enterprise';
  if (p === 'pro' || p.startsWith('pro-')) return 'pro';
  return 'free';
}

/**
 * True when a plan-id represents a PAID tier (anything above `free`).
 *
 * Used to reject client-driven plan elevation: a paid `subscriptionPlan` must
 * only ever be written by a verified provider payment webhook, never from a
 * client request body. Unknown ids resolve to `free` (non-paid), so this fails
 * safe toward rejecting only genuinely-recognized paid tiers.
 */
export function isPaidPlanId(planId: string): boolean {
  return enforcedTierForPlanId(planId) !== 'free';
}
