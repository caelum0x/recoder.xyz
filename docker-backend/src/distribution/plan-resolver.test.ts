import { describe, expect, it } from 'vitest';
import { SubscriptionTier } from '../resources/types.js';
import { resolveTierFromProductId } from '../billing/subscription-tier.js';
import { planForTier, TIER_TO_PLAN } from './module.js';

/**
 * End-to-end proof for the live-resolver chain that turns a Polar product id
 * into a distribution `Plan`:
 *
 *   productId --(resolveTierFromProductId)--> SubscriptionTier --(planForTier)--> Plan
 *
 * These assertions cover the two required cases (a team product resolves to the
 * 'team' Plan; an unknown/absent product never inflates) plus behavior
 * preservation for free/pro/enterprise.
 */
describe('live plan resolver chain (tier -> Plan)', () => {
  const PRO = 'prod_pro';
  const TEAM = 'prod_team';
  const ENT = 'prod_ent';

  function planFor(productId: string | null | undefined, teamConfigured = true): string {
    const tier = resolveTierFromProductId({
      productId,
      proProductId: PRO,
      teamProductId: teamConfigured ? TEAM : undefined,
      enterpriseProductId: ENT,
    });
    return planForTier(tier);
  }

  it('resolves a team product id to the "team" Plan', () => {
    expect(planFor(TEAM)).toBe('team');
  });

  it('resolves an enterprise product id to the "enterprise" Plan', () => {
    expect(planFor(ENT)).toBe('enterprise');
  });

  it('resolves a pro product id to the "pro" Plan', () => {
    expect(planFor(PRO)).toBe('pro');
  });

  it('never inflates to "team" when the team product id is not configured', () => {
    // Same product string, but team is not configured -> must not be "team".
    const plan = planFor(TEAM, /* teamConfigured */ false);
    expect(plan).not.toBe('team');
    // Behavior-preserving: unmatched paid product still falls back to pro.
    expect(plan).toBe('pro');
  });

  it('maps an absent subscription tier (FREE) to the "free" Plan (fail-safe floor)', () => {
    expect(planForTier(SubscriptionTier.FREE)).toBe('free');
  });

  it('TIER_TO_PLAN is exhaustive and value-identical for every tier', () => {
    for (const tier of Object.values(SubscriptionTier)) {
      // Enum string values are intentionally identical to Plan literals.
      expect(TIER_TO_PLAN[tier]).toBe(tier);
      expect(planForTier(tier)).toBe(tier);
    }
  });
});
