/**
 * Contract tests for the plan catalog — the DENY-SAFE tier resolver the
 * entitlement gate consults.
 *
 * Guards two billing defects:
 *  1. Plan-ID vocabulary drift (P0): the website persists
 *     `users.subscriptionPlan = planId` where planId is a checkout id
 *     ('pro-monthly'/'pro-yearly'/'enterprise'/'free' — see
 *     app/lib/config/subscription-plans.ts), NOT the enforced PlanTier token.
 *     Before the alias map, `normalize('pro-monthly')` coerced a PAYING user to
 *     `free`. Every website planId must resolve to a NON-free enforced tier
 *     (except 'free' itself), while unknown/absent still fails safe to `free`.
 *  2. Enforced quota is canonical (P1): PLAN_QUOTAS is the single source of
 *     truth for what the gate actually enforces. This pins the enforced numbers
 *     so a silent change is caught (and so the website advertised-quota drift
 *     test in app/ has a canonical reference to mirror).
 */
import { describe, it, expect } from 'vitest';
import {
  createPlanCatalog,
  PLAN_ALIASES,
  PLAN_QUOTAS,
} from '../services/plan-catalog.service.js';
import { sliceBillingConfig } from '../config.js';
import { QUOTA_BYOK_REQUIRED, type PlanTier } from '../types.js';

const appConfig = {
  runtime: { isProduction: false },
} as unknown as Parameters<typeof sliceBillingConfig>[0];

function catalog() {
  return createPlanCatalog(sliceBillingConfig(appConfig));
}

/**
 * The website plan-id vocabulary persisted to `users.subscriptionPlan`
 * (app/lib/config/subscription-plans.ts keys). Every non-'free' id here must
 * resolve to a paid enforced tier.
 */
const WEBSITE_PLAN_IDS = ['free', 'pro-monthly', 'pro-yearly', 'enterprise'] as const;

describe('PlanCatalog.normalize — website plan-id vocabulary', () => {
  it('resolves every website planId to a NON-free enforced tier (except free)', () => {
    const cat = catalog();
    for (const planId of WEBSITE_PLAN_IDS) {
      const tier = cat.normalize(planId);
      if (planId === 'free') {
        expect(tier).toBe('free');
      } else {
        expect(tier, `planId '${planId}' must not coerce to free`).not.toBe('free');
      }
    }
  });

  it('maps pro-monthly and pro-yearly to the enforced pro tier', () => {
    const cat = catalog();
    expect(cat.normalize('pro-monthly')).toBe('pro');
    expect(cat.normalize('pro-yearly')).toBe('pro');
  });

  it('maps enterprise to the enterprise tier', () => {
    expect(catalog().normalize('enterprise')).toBe('enterprise');
  });

  it('is case/whitespace insensitive for aliases', () => {
    const cat = catalog();
    expect(cat.normalize('  Pro-Monthly ')).toBe('pro');
  });

  it('still fails safe to free for unknown or absent plans', () => {
    const cat = catalog();
    expect(cat.normalize('platinum')).toBe('free');
    expect(cat.normalize('')).toBe('free');
    expect(cat.normalize(null)).toBe('free');
    expect(cat.normalize(undefined)).toBe('free');
  });

  it('never maps an alias to a lower tier than free', () => {
    const cat = catalog();
    for (const [alias, tier] of Object.entries(PLAN_ALIASES)) {
      expect(cat.satisfies(cat.normalize(alias), 'free')).toBe(true);
      expect(tier).not.toBe('free');
    }
  });
});

describe('PLAN_QUOTAS — canonical enforced quotas (single source of truth)', () => {
  // The values the website pricing page must advertise (advertised == enforced).
  // The app mirror (app/lib/config/enforced-quotas.ts) is pinned to these.
  const EXPECTED: Record<'free' | 'pro' | 'enterprise', { cli_request: number; token: number }> = {
    // Free platform inference (`token`) is BYOK-only — the DENY sentinel, NOT a
    // free platform-token allowance and NOT `0`/unlimited.
    free: { cli_request: 200, token: QUOTA_BYOK_REQUIRED },
    pro: { cli_request: 5_000, token: 5_000_000 },
    enterprise: { cli_request: 0, token: 0 }, // 0 = unlimited
  };

  it('enforces the pinned per-tier request + token quotas', () => {
    const cat = catalog();
    for (const tier of Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]) {
      expect(cat.quotaLimit(tier as PlanTier, 'cli_request')).toBe(EXPECTED[tier].cli_request);
      expect(cat.quotaLimit(tier as PlanTier, 'token')).toBe(EXPECTED[tier].token);
    }
  });

  it('Free platform inference is the BYOK-required DENY sentinel — never 0/unlimited', () => {
    const cat = catalog();
    const freeToken = cat.quotaLimit('free', 'token');
    expect(freeToken).toBe(QUOTA_BYOK_REQUIRED);
    // The sentinel is negative and MUST NOT collide with `0` (unlimited) — a
    // reader that only checks `=== 0` for unlimited can never see this as free.
    expect(freeToken).toBeLessThan(0);
    expect(freeToken).not.toBe(0);
    // A paid tier, by contrast, carries a real positive platform allowance.
    expect(cat.quotaLimit('pro', 'token')).toBeGreaterThan(0);
  });

  it('treats enterprise as unlimited (0) for every kind', () => {
    expect(PLAN_QUOTAS.enterprise).toEqual({});
  });
});
