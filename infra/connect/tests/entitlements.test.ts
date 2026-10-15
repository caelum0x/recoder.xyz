import { describe, expect, it } from 'vitest';
import {
  applyDodoEvent,
  entitlementToken,
  getEntitlement,
  isEntitlementTokenStale,
  satisfiesPlan,
} from '../src/billing/entitlements.js';
import { createFakeDb } from './fake-db.js';
import type { DodoProductMap } from '../src/env.js';

const PRODUCTS: DodoProductMap = {
  pro_monthly: 'pdt_pro_monthly',
  pro_annual: 'pdt_pro_annual',
  team_monthly: 'pdt_team_monthly',
};

describe('getEntitlement', () => {
  it('returns a free, active entitlement when no row exists', async () => {
    const fake = createFakeDb([]);
    const entitlement = await getEntitlement(fake.db, 'acct_1');
    expect(entitlement).toEqual({ accountId: 'acct_1', plan: 'free', status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: null });
  });

  it('returns the stored row when one exists', async () => {
    const fake = createFakeDb([
      { accountId: 'acct_1', plan: 'pro', status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: new Date('2027-01-01') },
    ]);
    const entitlement = await getEntitlement(fake.db, 'acct_1');
    expect(entitlement.plan).toBe('pro');
    expect(entitlement.cancelAtPeriodEnd).toBe(true);
  });
});

describe('satisfiesPlan', () => {
  const activePro = { accountId: 'a', plan: 'pro' as const, status: 'active' as const, cancelAtPeriodEnd: false, currentPeriodEnd: null };
  const canceledPro = { ...activePro, status: 'canceled' as const };
  const pastDuePro = { ...activePro, status: 'past_due' as const };

  it('an active pro entitlement satisfies free and pro, not team', () => {
    expect(satisfiesPlan(activePro, 'free')).toBe(true);
    expect(satisfiesPlan(activePro, 'pro')).toBe(true);
    expect(satisfiesPlan(activePro, 'team')).toBe(false);
  });

  it('a canceled entitlement only satisfies free, regardless of its stored plan', () => {
    expect(satisfiesPlan(canceledPro, 'free')).toBe(true);
    expect(satisfiesPlan(canceledPro, 'pro')).toBe(false);
  });

  it('a past_due entitlement still satisfies its plan (grace period), not higher', () => {
    expect(satisfiesPlan(pastDuePro, 'pro')).toBe(true);
    expect(satisfiesPlan(pastDuePro, 'team')).toBe(false);
  });
});

describe('applyDodoEvent', () => {
  it('inserts a new entitlement row for a first-time active subscription', async () => {
    const fake = createFakeDb([]);
    const result = await applyDodoEvent(fake.db, PRODUCTS, 'acct_1', 'subscription.active', {
      subscription_id: 'sub_1',
      product_id: 'pdt_pro_monthly',
      next_billing_date: '2027-02-01T00:00:00.000Z',
      cancel_at_next_billing_date: false,
    });
    expect(result?.plan).toBe('pro');
    expect(result?.status).toBe('active');
    expect(fake.inserted).toHaveLength(1);
    expect(fake.updated).toHaveLength(0);
  });

  it('updates an existing entitlement row rather than inserting a duplicate', async () => {
    const fake = createFakeDb([{ id: 'row_1', accountId: 'acct_1' }]);
    await applyDodoEvent(fake.db, PRODUCTS, 'acct_1', 'subscription.renewed', {
      subscription_id: 'sub_1',
      product_id: 'pdt_team_monthly',
      next_billing_date: '2027-03-01T00:00:00.000Z',
    });
    expect(fake.inserted).toHaveLength(0);
    expect(fake.updated).toHaveLength(1);
    expect((fake.updated[0] as { plan: string }).plan).toBe('team');
  });

  it('downgrades to free on cancellation regardless of the payload product id', async () => {
    const fake = createFakeDb([{ id: 'row_1', accountId: 'acct_1' }]);
    const result = await applyDodoEvent(fake.db, PRODUCTS, 'acct_1', 'subscription.cancelled', {
      subscription_id: 'sub_1',
      product_id: 'pdt_team_monthly',
    });
    expect(result?.plan).toBe('free');
    expect(result?.status).toBe('canceled');
  });

  it('returns null and writes nothing for an event type the entitlement layer does not map', async () => {
    const fake = createFakeDb([]);
    const result = await applyDodoEvent(fake.db, PRODUCTS, 'acct_1', 'payment.succeeded', {});
    expect(result).toBeNull();
    expect(fake.inserted).toHaveLength(0);
    expect(fake.updated).toHaveLength(0);
  });
});

describe('entitlementToken / isEntitlementTokenStale', () => {
  const entitlement = { accountId: 'a', plan: 'free' as const, status: 'active' as const, cancelAtPeriodEnd: false, currentPeriodEnd: null };

  it('a freshly issued token is not stale', () => {
    const token = entitlementToken(entitlement);
    expect(isEntitlementTokenStale(token)).toBe(false);
  });

  it('a token older than its TTL is stale', () => {
    const token = entitlementToken(entitlement);
    const future = new Date(Date.parse(token.issuedAt) + (token.ttlSeconds + 1) * 1000);
    expect(isEntitlementTokenStale(token, future)).toBe(true);
  });

  it('a token with an unparsable issuedAt is treated as stale (fail safe)', () => {
    const token = { entitlement, issuedAt: 'not-a-date', ttlSeconds: 900 };
    expect(isEntitlementTokenStale(token)).toBe(true);
  });
});
