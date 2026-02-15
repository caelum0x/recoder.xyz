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
});
