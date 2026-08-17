import { describe, it, expect } from 'vitest';
import { SUBSCRIPTION_PLANS } from '../subscription-plans';
import { ENFORCED_QUOTAS, enforcedTierForPlanId, BYOK_REQUIRED, UNLIMITED } from '../enforced-quotas';

/**
 * Defect P1: the pricing page advertised ~10x the quota the backend gate
 * actually enforces. The backend `PLAN_QUOTAS`
 * (backend/src/domains/billing/services/plan-catalog.service.ts) is the single
 * source of truth; `enforced-quotas.ts` mirrors it. These tests assert the
 * advertised limits on every plan equal the enforced quota for that plan's tier
 * so the two can never silently drift apart again.
 */
describe('subscription plan advertised quotas == enforced quotas', () => {
  it('advertises exactly the enforced requests + tokens for every plan', () => {
    for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
      const tier = enforcedTierForPlanId(plan.id);
      const enforced = ENFORCED_QUOTAS[tier];
      expect(plan.limits.requests, `plan '${plan.id}' requests`).toBe(enforced.requests);
      expect(plan.limits.tokens, `plan '${plan.id}' tokens`).toBe(enforced.tokens);
    }
  });

  it('maps pro checkout ids to the pro enforced tier', () => {
    expect(enforcedTierForPlanId('pro-monthly')).toBe('pro');
    expect(enforcedTierForPlanId('pro-yearly')).toBe('pro');
  });

  it('falls back to free for unknown plan ids', () => {
    expect(enforcedTierForPlanId('mystery')).toBe('free');
  });

  // recoder-ll7l: Free is BYOK-only — it must NOT advertise a positive platform
  // token allowance (the backend refuses a keyless Free user). The BYOK sentinel
  // is distinct from UNLIMITED so Free never reads as "unlimited tokens".
  it('advertises Free as BYOK-required, never a positive token allowance or unlimited', () => {
    expect(ENFORCED_QUOTAS.free.tokens).toBe(BYOK_REQUIRED);
    expect(ENFORCED_QUOTAS.free.tokens).not.toBe(UNLIMITED);
    expect(ENFORCED_QUOTAS.free.tokens).toBeLessThan(0);
    expect(SUBSCRIPTION_PLANS.free.limits.tokens).toBe(BYOK_REQUIRED);
  });
});
