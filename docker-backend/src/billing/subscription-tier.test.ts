import { describe, expect, it } from 'vitest';
import { SubscriptionTier } from '../resources/types.js';
import { resolveTierFromProductId } from './subscription-tier.js';

describe('resolveTierFromProductId', () => {
  it('returns ENTERPRISE when product matches enterprise id', () => {
    const tier = resolveTierFromProductId({
      productId: 'ent_123',
      proProductId: 'pro_123',
      enterpriseProductId: 'ent_123',
    });

    expect(tier).toBe(SubscriptionTier.ENTERPRISE);
  });

  it('returns PRO when product matches pro id', () => {
    const tier = resolveTierFromProductId({
      productId: 'pro_123',
      proProductId: 'pro_123',
      enterpriseProductId: 'ent_123',
    });

    expect(tier).toBe(SubscriptionTier.PRO);
  });

  it('defaults to PRO when no product ids match', () => {
    const tier = resolveTierFromProductId({
      productId: 'other_123',
      proProductId: 'pro_123',
      enterpriseProductId: 'ent_123',
    });

    expect(tier).toBe(SubscriptionTier.PRO);
  });

  it('returns TEAM when product matches the configured team id', () => {
    const tier = resolveTierFromProductId({
      productId: 'team_123',
      proProductId: 'pro_123',
      teamProductId: 'team_123',
      enterpriseProductId: 'ent_123',
    });

    expect(tier).toBe(SubscriptionTier.TEAM);
  });

  it('never inflates to TEAM when team id is not configured (absent env)', () => {
    // The subscription's product happens to equal a team-like string, but no
    // team product id is configured -> must not become TEAM. Behavior-preserving
    // PRO fallback applies (paid subscriptions are not downgraded to FREE).
    const tier = resolveTierFromProductId({
      productId: 'team_123',
      proProductId: 'pro_123',
      teamProductId: undefined,
      enterpriseProductId: 'ent_123',
    });

    expect(tier).toBe(SubscriptionTier.PRO);
    expect(tier).not.toBe(SubscriptionTier.TEAM);
  });

  it('prefers ENTERPRISE over TEAM when a product matches both slots', () => {
    const tier = resolveTierFromProductId({
      productId: 'shared_123',
      proProductId: 'pro_123',
      teamProductId: 'shared_123',
      enterpriseProductId: 'shared_123',
    });

    expect(tier).toBe(SubscriptionTier.ENTERPRISE);
  });

  it('still resolves ENTERPRISE and PRO with team slot present (behavior-preserving)', () => {
    expect(
      resolveTierFromProductId({
        productId: 'ent_123',
        proProductId: 'pro_123',
        teamProductId: 'team_123',
        enterpriseProductId: 'ent_123',
      }),
    ).toBe(SubscriptionTier.ENTERPRISE);

    expect(
      resolveTierFromProductId({
        productId: 'pro_123',
        proProductId: 'pro_123',
        teamProductId: 'team_123',
        enterpriseProductId: 'ent_123',
      }),
    ).toBe(SubscriptionTier.PRO);
  });
});
