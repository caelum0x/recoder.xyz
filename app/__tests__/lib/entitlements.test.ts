import {
  UNLIMITED,
  getEntitlementFeatures,
  normalizePlanId,
  resolveEntitlements,
} from '@/lib/entitlements';

describe('lib/entitlements', () => {
  describe('normalizePlanId', () => {
    it('accepts the known plan ids', () => {
      expect(normalizePlanId('free')).toBe('free');
      expect(normalizePlanId('weekly')).toBe('weekly');
      expect(normalizePlanId('monthly')).toBe('monthly');
      expect(normalizePlanId('pro')).toBe('pro');
      expect(normalizePlanId('enterprise')).toBe('enterprise');
    });

    it('is case/whitespace-insensitive', () => {
      expect(normalizePlanId('PRO')).toBe('pro');
      expect(normalizePlanId('  Enterprise ')).toBe('enterprise');
    });

    it('maps billing interval-suffixed pro ids to pro', () => {
      expect(normalizePlanId('pro-monthly')).toBe('pro');
      expect(normalizePlanId('pro-yearly')).toBe('pro');
    });

    it('degrades unknown/absent plans to free', () => {
      expect(normalizePlanId('platinum')).toBe('free');
      expect(normalizePlanId('')).toBe('free');
      expect(normalizePlanId(null)).toBe('free');
      expect(normalizePlanId(undefined)).toBe('free');
      expect(normalizePlanId(42)).toBe('free');
    });
  });

  describe('plan feature mapping', () => {
    it('free tier is the constrained baseline', () => {
      expect(getEntitlementFeatures('free')).toEqual({
        parallel_agents: 2,
        sibling_awareness: true,
        assisted_synthesize: false,
        evidence_retention_days: 7,
        shared_team_memory: false,
        team_members: 1,
      });
    });

    it('pro tier unlocks synthesis and longer retention', () => {
      const features = getEntitlementFeatures('pro');
      expect(features.parallel_agents).toBe(8);
      expect(features.assisted_synthesize).toBe(true);
      expect(features.evidence_retention_days).toBe(90);
      expect(features.shared_team_memory).toBe(true);
      expect(features.team_members).toBe(10);
    });

    it('enterprise tier is unlimited on numeric limits', () => {
      const features = getEntitlementFeatures('enterprise');
      expect(features.parallel_agents).toBe(UNLIMITED);
      expect(features.evidence_retention_days).toBe(UNLIMITED);
      expect(features.team_members).toBe(UNLIMITED);
      expect(features.assisted_synthesize).toBe(true);
    });

    it('weekly/monthly paid tiers sit between free and pro', () => {
      for (const plan of ['weekly', 'monthly'] as const) {
        const features = getEntitlementFeatures(plan);
        expect(features.assisted_synthesize).toBe(true);
        expect(features.parallel_agents).toBeGreaterThan(2);
        expect(features.parallel_agents).toBeLessThan(8);
        expect(features.shared_team_memory).toBe(true);
      }
    });

    it('returns a fresh copy (callers cannot mutate the table)', () => {
      const first = getEntitlementFeatures('free');
      first.parallel_agents = 999;
      expect(getEntitlementFeatures('free').parallel_agents).toBe(2);
    });
  });

  describe('resolveEntitlements', () => {
    it('resolves an active pro user', () => {
      const resolved = resolveEntitlements({
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
      });
      expect(resolved.plan).toBe('pro');
      expect(resolved.status).toBe('active');
      expect(resolved.features.parallel_agents).toBe(8);
    });

    it('resolves an active enterprise user', () => {
      const resolved = resolveEntitlements({
        subscriptionPlan: 'enterprise',
        subscriptionStatus: 'active',
      });
      expect(resolved.plan).toBe('enterprise');
      expect(resolved.features.parallel_agents).toBe(UNLIMITED);
    });

    it('degrades an unknown plan to free', () => {
      const resolved = resolveEntitlements({
        subscriptionPlan: 'platinum-legacy',
        subscriptionStatus: 'active',
      });
      expect(resolved.plan).toBe('free');
      expect(resolved.features.assisted_synthesize).toBe(false);
    });

    it('degrades an absent user to free/inactive', () => {
      const resolved = resolveEntitlements(null);
      expect(resolved.plan).toBe('free');
      expect(resolved.status).toBe('inactive'); // absent => not active (fail-safe)
      expect(resolved.features.parallel_agents).toBe(2);
    });

    it('keeps plan/status truthful but degrades features when canceled', () => {
      const resolved = resolveEntitlements({
        subscriptionPlan: 'pro',
        subscriptionStatus: 'canceled',
      });
      expect(resolved.plan).toBe('pro');
      expect(resolved.status).toBe('canceled');
      expect(resolved.features).toEqual(getEntitlementFeatures('free'));
    });

    it('degrades a paid plan with ABSENT status to free (no proven active subscription)', () => {
      // Fail-safe: a stale user.subscriptionPlan='pro' with no active subscription
      // and no status must NOT grant paid features. (recoder-y8gb)
      const resolved = resolveEntitlements({ subscriptionPlan: 'pro', subscriptionStatus: null });
      expect(resolved.plan).toBe('pro'); // reported plan stays truthful…
      expect(resolved.status).toBe('inactive'); // …but absent status is NOT active…
      expect(resolved.features).toEqual(getEntitlementFeatures('free')); // …so features degrade
    });

    it('degrades a paid plan with a blank status string to free', () => {
      const resolved = resolveEntitlements({ subscriptionPlan: 'pro', subscriptionStatus: '   ' });
      expect(resolved.features.assisted_synthesize).toBe(false);
      expect(resolved.features.parallel_agents).toBe(2);
    });

    it('grants paid features while trialing', () => {
      const resolved = resolveEntitlements({
        subscriptionPlan: 'pro',
        subscriptionStatus: 'trialing',
      });
      expect(resolved.features.assisted_synthesize).toBe(true);
    });

    it('prefers the subscription record over the user row', () => {
      const resolved = resolveEntitlements(
        { subscriptionPlan: 'free', subscriptionStatus: 'active' },
        { planId: 'pro-monthly', status: 'active' }
      );
      expect(resolved.plan).toBe('pro');
      expect(resolved.features.parallel_agents).toBe(8);
    });
  });
});
