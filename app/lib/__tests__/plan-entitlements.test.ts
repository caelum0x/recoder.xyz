import { describe, expect, it } from 'vitest';
import { getCommercialEntitlements, normalizeCommercialPlan } from '@/lib/plan-entitlements';

describe('plan-entitlements', () => {
  it('normalizes legacy subscription ids into commercial plans', () => {
    expect(normalizeCommercialPlan('free')).toBe('free');
    expect(normalizeCommercialPlan('pro-monthly')).toBe('monthly');
    expect(normalizeCommercialPlan('pro-yearly')).toBe('monthly');
    expect(normalizeCommercialPlan('business')).toBe('pro');
    expect(normalizeCommercialPlan('enterprise')).toBe('enterprise');
  });

  it('returns workspace and connected-agent entitlements', () => {
    const free = getCommercialEntitlements('free');
    const pro = getCommercialEntitlements('pro');

    expect(free.workspaces).toBe(1);
    expect(free.connectedAgents).toBe(1);
    expect(pro.connectedAgents).toBeGreaterThan(free.connectedAgents);
    expect(pro.previewDeploysPerMonth).toBeGreaterThan(free.previewDeploysPerMonth);
  });
});

