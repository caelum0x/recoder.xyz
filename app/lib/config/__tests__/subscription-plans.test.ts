import { describe, it, expect } from 'vitest';
import { SUBSCRIPTION_PLANS } from '../subscription-plans';
import { ENFORCED_QUOTAS, enforcedTierForPlanId } from '../enforced-quotas';

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
});
