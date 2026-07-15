/**
 * Metering-quota group tests: the durable idempotent ledger + the fail-safe
 * (deny-path-first) quota checker.
 *
 * Proves: idempotent record (retry = no-op), degrade-safe flush (no provider /
 * unconfigured / push error never marks flushed), quota deny-first ordering
 * (repo-down, read-throw), BYOK bypass, unlimited tier, headroom exhaustion, and
 * the check→record `consume` seam.
 */
import { describe, it, expect } from 'vitest';
import { createMeteringService } from '../services/metering.service.js';
import { createQuotaService } from '../services/quota.service.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { sliceBillingConfig } from '../config.js';
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { UsageEventInput } from '../ports/metering-repo.port.js';
import type { BillingSubject, MeterEvent, PlanTier, ProviderHealth, UsageKind, UsageRecord } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceBillingConfig>[0];
const catalog = createPlanCatalog(sliceBillingConfig(appConfig));
const FIXED_NOW = () => new Date('2026-07-15T12:00:00.000Z');

function subject(id: string, hasOwnApiKey?: boolean): BillingSubject {
  return { subjectId: id, kind: 'user', ...(hasOwnApiKey !== undefined ? { hasOwnApiKey } : {}) };
}

/** An in-memory ledger repo: dedupes on idempotencyKey, sums usage, tracks flush. */
function memRepo(opts: { available?: boolean; throwOnUsage?: boolean } = {}): MeteringRepository & {
  events: UsageRecord[];
  counters: Record<string, number>;
} {
  const events: UsageRecord[] = [];
  const counters: Record<string, number> = {};
  const keys = new Set<string>();
  return {
    events,
    counters,
    isAvailable: () => opts.available ?? true,
    async recordUsage(e: UsageEventInput) {
      if (keys.has(e.idempotencyKey)) return { inserted: false };
      keys.add(e.idempotencyKey);
      events.push({
        id: e.id,
        subjectId: e.subjectId,
        kind: e.kind,
        quantity: e.quantity,
        runId: e.runId ?? null,
        engine: e.engine ?? null,
        idempotencyKey: e.idempotencyKey,
        occurredAt: e.occurredAt ?? '2026-07-15T12:00:00.000Z',
        flushedAt: null,
      });
      return { inserted: true };
    },
    async usageSince(subjectId: string, kind: UsageKind) {
      if (opts.throwOnUsage) throw new Error('pool down');
      return events
        .filter((e) => e.subjectId === subjectId && e.kind === kind)
        .reduce((sum, e) => sum + e.quantity, 0);
    },
    async incrementCounter(subjectId, kind, windowStart, delta) {
      const k = `${subjectId}:${kind}:${windowStart}`;
      counters[k] = (counters[k] ?? 0) + delta;
      return counters[k];
    },
    async unflushedUsage(limit) {
      return events.filter((e) => e.flushedAt == null).slice(0, limit);
    },
    async markFlushed(ids, flushedAt) {
      let n = 0;
      for (const e of events) {
        if (ids.includes(e.id) && e.flushedAt == null) {
          (e as { flushedAt: string | null }).flushedAt = flushedAt;
          n += 1;
        }
      }
      return n;
    },
    // Unused-in-this-group methods.
    async getActiveSubscription() {
      return null;
    },
    async upsertSubscription() {},
    async listInvoices() {
      return [];
    },
    async upsertInvoice() {},
    async getCounter() {
      return null;
    },
    async upsertCounter() {},
    async recordWebhookEvent() {
      return { inserted: true };
    },
    async markWebhookProcessed() {},
  };
}

function fakeProvider(opts: {
  configured?: boolean;
  status?: ProviderHealth['status'];
  throwOnEmit?: boolean;
  captured?: MeterEvent[];
}): BillingProviderPort {
  return {
    name: 'polar',
    async createCheckout() {
      throw new Error('unused');
    },
    async getSubscription() {
      return null;
    },
    async cancel() {
      return null;
    },
    verifyWebhook() {
      return false;
    },
    parseEvent() {
      return null;
    },
    async emitUsage(events) {
      if (opts.throwOnEmit) throw new Error('meter feed down');
      opts.captured?.push(...events);
    },
    async health() {
      return {
        name: 'polar',
        configured: opts.configured ?? true,
        status: opts.status ?? 'up',
      };
    },
  };
}

describe('MeteringService — durable idempotent ledger', () => {
  it('records a fresh event and increments the counter', async () => {
    const repo = memRepo();
    const svc = createMeteringService({ repo, now: FIXED_NOW });
    const w = await svc.record({ subjectId: 'u1', kind: 'agent_run', quantity: 2, idempotencyKey: 'k1' });
    expect(w.inserted).toBe(true);
    expect(repo.events).toHaveLength(1);
    expect(Object.values(repo.counters)[0]).toBe(2);
  });

  it('is idempotent: a repeated key is a no-op and does not double-count the counter', async () => {
    const repo = memRepo();
    const svc = createMeteringService({ repo, now: FIXED_NOW });
    await svc.record({ subjectId: 'u1', kind: 'token', quantity: 100, idempotencyKey: 'dup' });
    const second = await svc.record({ subjectId: 'u1', kind: 'token', quantity: 100, idempotencyKey: 'dup' });
    expect(second.inserted).toBe(false);
    expect(repo.events).toHaveLength(1);
    expect(Object.values(repo.counters)[0]).toBe(100); // not 200
  });

  it('coerces a non-positive quantity to 1 (fail safe)', async () => {
    const repo = memRepo();
    const svc = createMeteringService({ repo, now: FIXED_NOW });
    await svc.record({ subjectId: 'u1', kind: 'cli_request', quantity: 0, idempotencyKey: 'z' });
    expect(repo.events[0].quantity).toBe(1);
  });

  it('flush is a no-op with no provider (events retained)', async () => {
    const repo = memRepo();
    const svc = createMeteringService({ repo, now: FIXED_NOW });
    await svc.record({ subjectId: 'u1', kind: 'token', quantity: 5, idempotencyKey: 'a' });
    expect(await svc.flushOnce()).toBe(0);
    expect(repo.events[0].flushedAt).toBeNull();
  });

  it('does NOT mark flushed when the provider is unconfigured (degrade safe)', async () => {
    const repo = memRepo();
    const provider = fakeProvider({ configured: false, status: 'down' });
    const svc = createMeteringService({ repo, provider, now: FIXED_NOW });
    await svc.record({ subjectId: 'u1', kind: 'token', quantity: 5, idempotencyKey: 'a' });
    expect(await svc.flushOnce()).toBe(0);
    expect(repo.events[0].flushedAt).toBeNull();
  });

  it('retains events when the provider emit throws', async () => {
    const repo = memRepo();
    const provider = fakeProvider({ throwOnEmit: true });
    const svc = createMeteringService({ repo, provider, now: FIXED_NOW });
    await svc.record({ subjectId: 'u1', kind: 'token', quantity: 5, idempotencyKey: 'a' });
    expect(await svc.flushOnce()).toBe(0);
    expect(repo.events[0].flushedAt).toBeNull();
  });

  it('flushes to a configured provider and marks events flushed', async () => {
    const repo = memRepo();
    const captured: MeterEvent[] = [];
    const provider = fakeProvider({ captured });
    const svc = createMeteringService({ repo, provider, now: FIXED_NOW });
    await svc.record({ subjectId: 'u1', kind: 'token', quantity: 5, idempotencyKey: 'a' });
    await svc.record({ subjectId: 'u1', kind: 'agent_run', quantity: 1, idempotencyKey: 'b' });
    expect(await svc.flushOnce()).toBe(2);
    expect(captured).toHaveLength(2);
    expect(repo.events.every((e) => e.flushedAt != null)).toBe(true);
    // A second flush finds nothing to send.
    expect(await svc.flushOnce()).toBe(0);
  });

  it('health degrades when the ledger repo is unavailable', () => {
    const repo = memRepo({ available: false });
    const svc = createMeteringService({ repo, now: FIXED_NOW });
    expect(svc.health().status).toBe('degraded');
  });
});

describe('QuotaService — fail-safe deny path first', () => {
  const resolvePlan = (plan: PlanTier) => () => plan;

  it('DENIES when the metering repo is unavailable (before any allow)', async () => {
    const repo = memRepo({ available: false });
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('pro'), now: FIXED_NOW });
    const d = await svc.check(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('metering_unavailable');
    expect(d.remaining).toBe(0);
  });

  it('DENIES when the usage read throws (fail safe)', async () => {
    const repo = memRepo({ throwOnUsage: true });
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('pro'), now: FIXED_NOW });
    const d = await svc.check(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('metering_unavailable');
  });

  it('BYOK bypasses a token-metered kind but reports the bypass truthfully', async () => {
    const repo = memRepo();
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('free'), now: FIXED_NOW });
    const d = await svc.check(subject('u1', true), 'token');
    expect(d.allowed).toBe(true);
    expect(d.byokBypass).toBe(true);
  });

  it('allows an unlimited tier (limit 0)', async () => {
    const repo = memRepo();
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('enterprise'), now: FIXED_NOW });
    const d = await svc.check(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(true);
    expect(d.limit).toBe(0);
  });

  it('allows with headroom and denies once exhausted (free agent_run = 50)', async () => {
    const repo = memRepo();
    const meter = createMeteringService({ repo, now: FIXED_NOW });
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('free'), metering: meter, now: FIXED_NOW });

    // Consume 49 runs → still headroom for one more.
    for (let i = 0; i < 49; i += 1) {
      await meter.record({ subjectId: 'u1', kind: 'agent_run', quantity: 1, idempotencyKey: `r${i}` });
    }
    expect((await svc.check(subject('u1'), 'agent_run')).allowed).toBe(true);

    // The 50th consume lands, exhausting the window.
    const consumed = await svc.consume(subject('u1'), 'agent_run', 1, { idempotencyKey: 'r49' });
    expect(consumed.recorded).toBe(true);

    const d = await svc.check(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('quota_exceeded');
  });

  it('consume does not record on a deny', async () => {
    const repo = memRepo();
    const meter = createMeteringService({ repo, now: FIXED_NOW });
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('free'), metering: meter, now: FIXED_NOW });
    // Pre-fill to the free publish limit (3).
    for (let i = 0; i < 3; i += 1) {
      await meter.record({ subjectId: 'u1', kind: 'publish', quantity: 1, idempotencyKey: `p${i}` });
    }
    const res = await svc.consume(subject('u1'), 'publish', 1, { idempotencyKey: 'p-over' });
    expect(res.decision.allowed).toBe(false);
    expect(res.recorded).toBe(false);
    expect(repo.events.filter((e) => e.kind === 'publish')).toHaveLength(3);
  });

  it('falls back to the free floor when plan resolution throws', async () => {
    const repo = memRepo();
    const svc = createQuotaService({
      repo,
      catalog,
      resolvePlan: () => {
        throw new Error('auth down');
      },
      now: FIXED_NOW,
    });
    const d = await svc.check(subject('u1'), 'agent_run');
    expect(d.plan).toBe('free');
  });
});
