/**
 * Proves the WORKING EntitlementGate before any provider exists: effective-plan
 * resolution, the static feature gate, quota headroom, BYOK bypass, and the
 * fail-safe deny paths (repo down, paid-feature-no-provider).
 */
import { describe, it, expect } from 'vitest';
import { createEntitlementService } from '../services/entitlement.service.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { createDistributionBillingAdapter } from '../adapters/distribution-billing.adapter.js';
import { sliceBillingConfig } from '../config.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { BillingSubject, BillingSubscription, PlanTier, UsageKind } from '../types.js';
import type { Principal } from '../../identity/types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceBillingConfig>[0];

/** A fake repo: seed an active plan + a used-count per (subject,kind), toggle availability. */
function fakeRepo(opts: {
  available?: boolean;
  subscription?: BillingSubscription | null;
  used?: Record<string, number>;
  throwOnUsage?: boolean;
}): MeteringRepository {
  const base = {
    async getActiveSubscription() {
      return opts.subscription ?? null;
    },
    async usageSince(_s: string, kind: UsageKind) {
      if (opts.throwOnUsage) throw new Error('pool down');
      return opts.used?.[kind] ?? 0;
    },
    isAvailable: () => opts.available ?? true,
  };
  // Unused-in-CORE methods throw if hit (keeps the test honest about the path).
  return new Proxy(base as unknown as MeteringRepository, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (v !== undefined) return v;
      return () => {
        throw new Error(`unexpected repo call: ${String(prop)}`);
      };
    },
  });
}

function makeGate(repo: MeteringRepository, byok = false) {
  const config = sliceBillingConfig(appConfig);
  const catalog = createPlanCatalog(config);
  const distribution = createDistributionBillingAdapter(); // no provider → deny-on-miss
  return createEntitlementService({
    repo,
    catalog,
    distribution,
    resolveByok: () => byok,
    now: () => new Date('2026-07-15T12:00:00.000Z'),
  });
}

function principal(userId: string): Principal {
  return { userId, scopes: [], kind: 'session', isAnonymous: false, raw: null };
}

function subject(id: string, hasOwnApiKey?: boolean): BillingSubject {
  return { subjectId: id, kind: 'user', ...(hasOwnApiKey !== undefined ? { hasOwnApiKey } : {}) };
}

function activeSub(plan: PlanTier): BillingSubscription {
  return {
    id: 'sub_1',
    subjectId: 'u1',
    subjectKind: 'user',
    plan,
    provider: 'polar',
    status: 'active',
    cancelAtPeriodEnd: false,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

/** A `past_due` subscription whose paid period ended at `currentPeriodEnd`. */
function pastDueSub(plan: PlanTier, currentPeriodEnd: string | null): BillingSubscription {
  return {
    id: 'sub_pd',
    subjectId: 'u1',
    subjectKind: 'user',
    plan,
    provider: 'polar',
    status: 'past_due',
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

describe('EntitlementGate (working before any provider)', () => {
  it('resolves free as the deny-safe floor when no subscription exists', async () => {
    const gate = makeGate(fakeRepo({}));
    expect(await gate.resolvePlan(subject('u1'))).toBe('free');
  });

  it('resolves the webhook-confirmed plan when active', async () => {
    const gate = makeGate(fakeRepo({ subscription: activeSub('team') }));
    expect(await gate.resolvePlan(subject('u1'))).toBe('team');
  });

  // --- #29 Dunning grace window ---

  it('RETAINS the paid tier for a past_due subscription still within the dunning grace window', async () => {
    // now = 2026-07-15; period ended 5 days ago → inside the 7-day grace window.
    const gate = makeGate(fakeRepo({ subscription: pastDueSub('team', '2026-07-10T12:00:00.000Z') }));
    expect(await gate.resolvePlan(subject('u1'))).toBe('team');
  });

  it('DOWNGRADES a past_due subscription to free once the dunning grace window has elapsed', async () => {
    // now = 2026-07-15; period ended 14 days ago → past the 7-day grace window.
    const gate = makeGate(fakeRepo({ subscription: pastDueSub('team', '2026-07-01T12:00:00.000Z') }));
    expect(await gate.resolvePlan(subject('u1'))).toBe('free');
  });

  it('DOWNGRADES a past_due subscription with no known period end (deny-safe: cannot prove grace)', async () => {
    const gate = makeGate(fakeRepo({ subscription: pastDueSub('team', null) }));
    expect(await gate.resolvePlan(subject('u1'))).toBe('free');
  });

  it('allows a free-tier feature offline (no provider needed)', async () => {
    const gate = makeGate(fakeRepo({}));
    const d = await gate.checkFeature(subject('u1'), 'cli_basic');
    expect(d.allowed).toBe(true);
  });

  it('DENIES a paid feature with no provider configured (fail safe)', async () => {
    const gate = makeGate(fakeRepo({}));
    const d = await gate.checkFeature(subject('u1'), 'publish_site');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('billing_unconfigured');
  });

  it('allows a paid feature once the plan carries it (pro → publish_site)', async () => {
    const gate = makeGate(fakeRepo({ subscription: activeSub('pro') }));
    const d = await gate.checkFeature(subject('u1'), 'publish_site');
    expect(d.allowed).toBe(true);
  });

  it('allows quota with headroom and denies when exhausted', async () => {
    const under = makeGate(fakeRepo({ used: { agent_run: 10 } }));
    expect((await under.checkQuota(subject('u1'), 'agent_run')).allowed).toBe(true);

    const over = makeGate(fakeRepo({ used: { agent_run: 50 } })); // free limit = 50
    const d = await over.checkQuota(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('quota_exceeded');
  });

  // --- #30 quota_exceeded carries an actionable upgrade CTA ---

  it('a quota_exceeded decision carries an upgrade CTA (current tier + the tier that lifts the limit)', async () => {
    const over = makeGate(fakeRepo({ used: { agent_run: 50 } })); // free agent_run limit = 50
    const d = await over.checkQuota(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('quota_exceeded');
    expect(d.upgrade).toEqual({ currentTier: 'free', suggestedTier: 'pro' });
  });

  it('BYOK bypasses token-metered quota but NOT feature gates', async () => {
    const gate = makeGate(fakeRepo({ used: { token: 999_999 } }), /* byok */ true);
    const q = await gate.checkQuota(subject('u1'), 'token');
    expect(q.allowed).toBe(true);
    expect(q.byokBypass).toBe(true);

    // Feature gate still applies (free BYOK user cannot publish).
    const f = await gate.checkFeature(subject('u1'), 'publish_site');
    expect(f.allowed).toBe(false);
  });

  // --- Free platform inference is BYOK-only (recoder-bb1n) ---

  it('DENIES Free platform inference for a NON-BYOK user (must supply BYOK — not unlimited)', async () => {
    // A Free user with plenty of headroom on paper (used=0) is STILL denied
    // platform inference: the Free `token` limit is the BYOK-required deny
    // sentinel, not a free allowance and NOT `0`/unlimited.
    const gate = makeGate(fakeRepo({ used: { token: 0 } }), /* byok */ false);
    const q = await gate.checkQuota(subject('u1'), 'token');
    expect(q.allowed).toBe(false);
    expect(q.reason).toBe('byok_required');
    // The sentinel must NEVER be misread as unlimited: an unlimited kind returns
    // `allowed:true`; a BYOK-required kind returns `allowed:false` with a
    // negative sentinel limit.
    expect(q.limit).toBeLessThan(0);
    expect(q.remaining).toBe(0);
    // It carries the actionable upgrade CTA so the UI can offer a paid tier.
    expect(q.upgrade).toEqual({ currentTier: 'free', suggestedTier: 'pro' });
  });

  it('ALLOWS a Free user with their OWN key (BYOK) to run platform inference', async () => {
    const gate = makeGate(fakeRepo({ used: { token: 0 } }), /* byok */ true);
    const q = await gate.checkQuota(subject('u1'), 'token');
    expect(q.allowed).toBe(true);
    expect(q.byokBypass).toBe(true);
  });

  it('ALLOWS platform inference on a PAID tier (pro) with headroom', async () => {
    const gate = makeGate(fakeRepo({ subscription: activeSub('pro'), used: { token: 10 } }));
    const q = await gate.checkQuota(subject('u1'), 'token');
    expect(q.allowed).toBe(true);
    expect(q.reason).toBeUndefined();
    expect(q.limit).toBeGreaterThan(0);
  });

  it('DENIES quota when the metering repo is unavailable (fail safe)', async () => {
    const gate = makeGate(fakeRepo({ available: false }));
    const d = await gate.checkQuota(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('metering_unavailable');
  });

  it('DENIES quota when the usage read throws (fail safe)', async () => {
    const gate = makeGate(fakeRepo({ throwOnUsage: true }));
    const d = await gate.checkQuota(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('metering_unavailable');
  });

  it('check(principal, req) dispatches feature and quota uniformly', async () => {
    const gate = makeGate(fakeRepo({ subscription: activeSub('pro') }));
    const feat = await gate.check(principal('u1'), { feature: 'publish_site' });
    expect(feat.allowed).toBe(true);
    expect(feat.feature?.feature).toBe('publish_site');

    const quota = await gate.check(principal('u1'), { quota: 'cli_request', cost: 1 });
    expect(quota.allowed).toBe(true);
    expect(quota.quota?.kind).toBe('cli_request');
  });

  it('health degrades (never up) when no provider is configured', () => {
    const gate = makeGate(fakeRepo({}));
    const h = gate.health();
    expect(h.status).toBe('degraded');
    expect(h.degraded).toBe(true);
  });
});
