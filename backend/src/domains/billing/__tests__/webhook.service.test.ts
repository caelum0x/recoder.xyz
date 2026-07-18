/**
 * Proves the signature-gated, idempotent webhook reconcile: a bad signature is
 * dropped (parseEvent null), a duplicate event is a no-op, an active event
 * upgrades the projection, a canceled event downgrades it, a subject-less event
 * cannot project (fail safe), and a repo fault surfaces (so the provider retries).
 */
import { describe, it, expect, vi } from 'vitest';
import { createWebhookService } from '../services/webhook.service.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { sliceBillingConfig } from '../config.js';
import type { ProviderRegistry } from '../provider-registry.js';
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type { MeteringRepository, SubscriptionUpsert } from '../ports/metering-repo.port.js';
import type { BillingSubscription, ParsedWebhook, ProviderSubscription } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceBillingConfig>[0];
const catalog = createPlanCatalog(sliceBillingConfig(appConfig));

/** A registry whose active/polar adapter returns a scripted parseEvent result. */
function fakeRegistry(parse: (rawBody: Buffer) => ParsedWebhook | null): ProviderRegistry {
  const adapter = { name: 'polar', parseEvent: (b: Buffer) => parse(b) } as unknown as BillingProviderPort;
  return {
    activeName: 'polar',
    active: () => adapter,
    get: () => adapter,
    all: () => [adapter],
    health: async () => ({ name: 'billing.provider', status: 'up', degraded: false }),
  };
}

interface RepoState {
  seen: Set<string>;
  /** Event ids whose projection COMMITTED (the true dedup gate). */
  processed: Set<string>;
  upserts: SubscriptionUpsert[];
  active?: BillingSubscription | null;
  throwOnRecord?: boolean;
  throwOnUpsert?: boolean;
}

function fakeRepo(state: RepoState): MeteringRepository {
  const base = {
    async recordWebhookEvent(row: { eventId: string }) {
      if (state.throwOnRecord) throw new Error('pool down');
      if (state.seen.has(row.eventId)) return { inserted: false };
      state.seen.add(row.eventId);
      return { inserted: true };
    },
    async upsertSubscription(sub: SubscriptionUpsert) {
      if (state.throwOnUpsert) throw new Error('deadlock');
      state.upserts.push(sub);
    },
    async getActiveSubscription() {
      return state.active ?? null;
    },
    async markWebhookProcessed(_provider: string, eventId: string) {
      state.processed.add(eventId);
    },
    async wasWebhookProcessed(_provider: string, eventId: string) {
      return state.processed.has(eventId);
    },
    isAvailable: () => true,
  };
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

function sub(status: ProviderSubscription['status'], plan?: 'pro' | 'team'): ProviderSubscription {
  return {
    provider: 'polar',
    providerSubId: 'sub_1',
    providerCustomerId: 'cus_1',
    status,
    ...(plan ? { plan } : {}),
    cancelAtPeriodEnd: false,
  };
}

function event(overrides: Partial<ParsedWebhook>): ParsedWebhook {
  return {
    provider: 'polar',
    eventId: 'evt_1',
    type: 'subscription.active',
    subjectId: 'u1',
    raw: {},
    ...overrides,
  };
}

function makeService(state: RepoState, parse: (b: Buffer) => ParsedWebhook | null) {
  return createWebhookService({ repo: fakeRepo(state), catalog, registry: fakeRegistry(parse) });
}

describe('webhook reconcile', () => {
  it('drops a bad signature (verifyAndParse → null)', () => {
    const svc = makeService({ seen: new Set(), processed: new Set(), upserts: [] }, () => null);
    expect(svc.verifyAndParse('polar', Buffer.from('{}'), {})).toBeNull();
  });

  it('upgrades the projection on an active event', async () => {
    const state: RepoState = { seen: new Set(), processed: new Set(), upserts: [] };
    const svc = makeService(state, () => event({ subscription: sub('active', 'pro') }));
    const parsed = svc.verifyAndParse('polar', Buffer.from('{}'), {})!;
    const res = await svc.process(parsed, Buffer.from('{}'));
    expect(res.action).toBe('upserted');
    expect(res.plan).toBe('pro');
    expect(res.status).toBe('active');
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].plan).toBe('pro');
  });

  it('is idempotent — a duplicate event id is a no-op', async () => {
    const state: RepoState = { seen: new Set(), processed: new Set(), upserts: [] };
    const svc = makeService(state, () => event({ subscription: sub('active', 'pro') }));
    const parsed = svc.verifyAndParse('polar', Buffer.from('{}'), {})!;
    await svc.process(parsed, Buffer.from('{}'));
    const again = await svc.process(parsed, Buffer.from('{}'));
    expect(again.duplicate).toBe(true);
    expect(again.action).toBe('duplicate');
    expect(state.upserts).toHaveLength(1); // not applied twice
  });

  it('downgrades on a canceled event (status canceled → gate falls to free)', async () => {
    const state: RepoState = { seen: new Set(), processed: new Set(), upserts: [], active: null };
    const svc = makeService(state, () => event({ type: 'subscription.canceled', subscription: sub('canceled', 'pro') }));
    const parsed = svc.verifyAndParse('polar', Buffer.from('{}'), {})!;
    const res = await svc.process(parsed, Buffer.from('{}'));
    expect(res.action).toBe('upserted');
    expect(res.status).toBe('canceled');
    expect(state.upserts[0].status).toBe('canceled');
  });

  it('cannot project a subject-less event (fail safe → no_subject)', async () => {
    const state: RepoState = { seen: new Set(), processed: new Set(), upserts: [] };
    const svc = makeService(state, () => event({ subjectId: undefined, subscription: sub('active', 'pro') }));
    const parsed = svc.verifyAndParse('polar', Buffer.from('{}'), {})!;
    const res = await svc.process(parsed, Buffer.from('{}'));
    expect(res.action).toBe('no_subject');
    expect(state.upserts).toHaveLength(0);
  });

  it('ignores an event with no subscription snapshot', async () => {
    const state: RepoState = { seen: new Set(), processed: new Set(), upserts: [] };
    const svc = makeService(state, () => event({ type: 'ping', subscription: undefined }));
    const parsed = svc.verifyAndParse('polar', Buffer.from('{}'), {})!;
    const res = await svc.process(parsed, Buffer.from('{}'));
    expect(res.action).toBe('ignored');
  });

  it('surfaces a repo fault (route returns 5xx → provider retries)', async () => {
    const state: RepoState = { seen: new Set(), processed: new Set(), upserts: [], throwOnRecord: true };
    const svc = makeService(state, () => event({ subscription: sub('active', 'pro') }));
    const parsed = svc.verifyAndParse('polar', Buffer.from('{}'), {})!;
    await expect(svc.process(parsed, Buffer.from('{}'))).rejects.toThrow('pool down');
  });

  it('inherits the plan from the current projection when the event omits it', async () => {
    const existing: BillingSubscription = {
      id: 's1',
      subjectId: 'u1',
      subjectKind: 'user',
      plan: 'team',
      provider: 'polar',
      status: 'active',
      cancelAtPeriodEnd: false,
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
    const state: RepoState = { seen: new Set(), processed: new Set(), upserts: [], active: existing };
    const svc = makeService(state, () => event({ subscription: sub('active') /* no plan */ }));
    const parsed = svc.verifyAndParse('polar', Buffer.from('{}'), {})!;
    const res = await svc.process(parsed, Buffer.from('{}'));
    expect(res.plan).toBe('team');
    expect(state.upserts[0].plan).toBe('team');
  });

  it('re-applies a paid upgrade after a transient projection fault (marker NOT committed before the projection)', async () => {
    // A provider re-delivers the SAME event id after the first apply faulted.
    // The dedup marker must only be committed once the projection succeeds, so the
    // retry re-applies the upgrade instead of dropping the user on the free tier.
    const state: RepoState = { seen: new Set(), processed: new Set(), upserts: [], throwOnUpsert: true };
    const svc = makeService(state, () => event({ subscription: sub('active', 'pro') }));
    const parsed = svc.verifyAndParse('polar', Buffer.from('{}'), {})!;

    // First delivery: upsertSubscription faults → surfaces (route 5xx). The event
    // must be left un-processed (no dedup marker), and nothing was projected.
    await expect(svc.process(parsed, Buffer.from('{}'))).rejects.toThrow('deadlock');
    expect(state.processed.has('evt_1')).toBe(false);
    expect(state.upserts).toHaveLength(0);

    // The transient fault clears; the provider retries the SAME event id.
    state.throwOnUpsert = false;
    const res = await svc.process(parsed, Buffer.from('{}'));
    expect(res.action).toBe('upserted');
    expect(res.plan).toBe('pro');
    expect(state.upserts).toHaveLength(1); // the upgrade is finally projected
    expect(state.processed.has('evt_1')).toBe(true); // now durably deduped
  });
});
