/**
 * Metering-quota group tests: the durable idempotent ledger + the fail-safe
 * (deny-path-first) quota checker.
 *
 * Proves: idempotent record (retry = no-op), degrade-safe flush (no provider /
 * unconfigured / push error never marks flushed), quota deny-first ordering
 * (repo-down, read-throw), BYOK bypass, unlimited tier, headroom exhaustion, the
 * `consume` seam, and the ATOMIC RESERVATION that closes the check-then-record
 * TOCTOU (structural guarded-write proof + consume deny-on-refusal).
 */
import { describe, it, expect } from 'vitest';
import { createMeteringService } from '../services/metering.service.js';
import { createQuotaService } from '../services/quota.service.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { createBillingRepository } from '../persistence/billing.repository.js';
import { sliceBillingConfig } from '../config.js';
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { UsageEventInput } from '../ports/metering-repo.port.js';
import type { QueryExecutor, QueryParams } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { BillingSubject, MeterEvent, PlanTier, ProviderHealth, UsageKind, UsageRecord } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceBillingConfig>[0];
const catalog = createPlanCatalog(sliceBillingConfig(appConfig));
const FIXED_NOW = () => new Date('2026-07-15T12:00:00.000Z');

function subject(id: string, hasOwnApiKey?: boolean): BillingSubject {
  return { subjectId: id, kind: 'user', ...(hasOwnApiKey !== undefined ? { hasOwnApiKey } : {}) };
}

/** An in-memory ledger repo: dedupes on idempotencyKey, sums usage, tracks flush. */
function memRepo(opts: { available?: boolean; throwOnUsage?: boolean; throwOnReserve?: boolean } = {}): MeteringRepository & {
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
    async reserveUsage(e: UsageEventInput, limit: number) {
      if (opts.throwOnReserve) throw new Error('pool down');
      // Idempotent replay: already reserved ⇒ truthful no-op (already counted).
      if (keys.has(e.idempotencyKey)) return { reserved: true, inserted: false };
      // Guarded write: only lands while the running window total stays within limit.
      const used = events
        .filter((x) => x.subjectId === e.subjectId && x.kind === e.kind)
        .reduce((sum, x) => sum + x.quantity, 0);
      if (used + e.quantity > limit) return { reserved: false, inserted: false };
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
      return { reserved: true, inserted: true };
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
    async wasWebhookProcessed() {
      return false;
    },
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

  it('a quota_exceeded decision carries an upgrade CTA signal (current + suggested tier)', async () => {
    const repo = memRepo();
    const meter = createMeteringService({ repo, now: FIXED_NOW });
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('free'), metering: meter, now: FIXED_NOW });
    // Exhaust the free agent_run window (limit = 50).
    for (let i = 0; i < 50; i += 1) {
      await meter.record({ subjectId: 'u1', kind: 'agent_run', quantity: 1, idempotencyKey: `run${i}` });
    }
    const d = await svc.check(subject('u1'), 'agent_run');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('quota_exceeded');
    expect(d.upgrade).toEqual({ currentTier: 'free', suggestedTier: 'pro' });
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

/**
 * A minimal {@link QueryExecutor} that records every SQL + params it is handed and
 * lets a test drive the `mutate` / `one` return values. Proves the repository
 * REACHES Postgres through the guarded reservation statement without a live DB.
 */
function mockExecutor(
  overrides: {
    mutate?: (sql: string, params?: QueryParams) => Promise<number> | number;
    one?: (sql: string, params?: QueryParams) => Promise<QueryRow | null> | QueryRow | null;
  } = {},
): QueryExecutor & { calls: Array<{ sql: string; params?: QueryParams }> } {
  const calls: Array<{ sql: string; params?: QueryParams }> = [];
  const exec: QueryExecutor & { calls: typeof calls } = {
    calls,
    async execute<T extends QueryRow = QueryRow>() {
      return [] as unknown as readonly T[];
    },
    async one<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams) {
      calls.push({ sql, params });
      const row = overrides.one ? await overrides.one(sql, params) : null;
      return (row ?? null) as T | null;
    },
    async read<T extends QueryRow = QueryRow>() {
      return [] as unknown as readonly T[];
    },
    async mutate(sql: string, params?: QueryParams) {
      calls.push({ sql, params });
      return overrides.mutate ? await overrides.mutate(sql, params) : 0;
    },
    async withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>) {
      return fn(exec);
    },
    isAvailable: () => true,
  };
  return exec;
}

describe('BillingRepository.reserveUsage — atomic reservation (guarded ledger write)', () => {
  const event: UsageEventInput = {
    id: 'evt-1',
    subjectId: 'u1',
    kind: 'agent_run',
    quantity: 3,
    idempotencyKey: 'idem-1',
  };
  const SINCE = '2026-07-01T00:00:00.000Z';

  it('is a SINGLE guarded INSERT bound to :limit/:quantity (not a blind write) that lands within the ceiling', async () => {
    const exec = mockExecutor({ mutate: () => 1 }); // guard passed → 1 row inserted
    const repo = createBillingRepository(exec);
    const res = await repo.reserveUsage(event, 50, SINCE);
    expect(res).toEqual({ reserved: true, inserted: true });

    // Structural proof the reservation is race-safe by construction: a
    // per-subject advisory lock is taken FIRST (serializes concurrent writers so
    // the guard's sum() can't be raced), then an INSERT guarded on the running
    // window total against the bound :limit. (recoder-bhs5)
    const lock = exec.calls[0];
    expect(lock.sql).toMatch(/pg_advisory_xact_lock/i);
    expect(lock.params).toMatchObject({ lock_key: 'usage:u1:agent_run' });
    const write = exec.calls.find((c) => /insert into billing_usage_events/i.test(c.sql))!;
    expect(write.sql).toMatch(/sum\(quantity\)/i);
    expect(write.sql).toMatch(/<=\s*:limit/);
    expect(write.sql).toMatch(/on conflict \(idempotency_key\) do nothing/i);
    expect(write.params).toMatchObject({ limit: 50, quantity: 3, since: SINCE });
  });

  it('REFUSES (reserved:false) when the guarded write affects 0 rows and the key is unseen (over quota)', async () => {
    // 0 rows affected = the guard's `total + quantity <= limit` was false.
    const exec = mockExecutor({ mutate: () => 0, one: () => null });
    const repo = createBillingRepository(exec);
    const res = await repo.reserveUsage(event, 50, SINCE);
    expect(res).toEqual({ reserved: false, inserted: false }); // a DENY, never a silent allow
  });

  it('treats a 0-row write whose idempotency key already exists as an already-reserved replay', async () => {
    const exec = mockExecutor({ mutate: () => 0, one: () => ({ one: 1 }) as QueryRow });
    const repo = createBillingRepository(exec);
    const res = await repo.reserveUsage(event, 50, SINCE);
    expect(res).toEqual({ reserved: true, inserted: false });
  });
});

describe('QuotaService.consume — atomic reservation closes the check→record TOCTOU', () => {
  const resolvePlan = (plan: PlanTier) => () => plan;

  it('DENIES (quota_exceeded) and records NOTHING when the atomic reservation is refused', async () => {
    // The race made concrete: the advisory check() still sees headroom, but the
    // guarded reservation is refused (a concurrent consume took the last unit).
    const repo = memRepo();
    repo.reserveUsage = async () => ({ reserved: false, inserted: false });
    const meter = createMeteringService({ repo, now: FIXED_NOW });
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('free'), metering: meter, now: FIXED_NOW });

    // check() alone would allow — consume must honor the reservation refusal instead.
    expect((await svc.check(subject('u1'), 'agent_run')).allowed).toBe(true);

    const res = await svc.consume(subject('u1'), 'agent_run', 1, { idempotencyKey: 'race' });
    expect(res.recorded).toBe(false);
    expect(res.decision.allowed).toBe(false);
    expect(res.decision.reason).toBe('quota_exceeded');
    expect(res.decision.remaining).toBe(0);
    expect(repo.events).toHaveLength(0); // no event leaked past the refused reservation
  });

  it('DENIES fail-safe (metering_unavailable) when the reservation write throws', async () => {
    const repo = memRepo({ throwOnReserve: true });
    const meter = createMeteringService({ repo, now: FIXED_NOW });
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('free'), metering: meter, now: FIXED_NOW });
    const res = await svc.consume(subject('u1'), 'agent_run', 1, { idempotencyKey: 'boom' });
    expect(res.recorded).toBe(false);
    expect(res.decision.allowed).toBe(false);
    expect(res.decision.reason).toBe('metering_unavailable');
  });

  it('routes consume enforcement through the reservation gate, not a blind record', async () => {
    // Spy: a landed consume must call reserveUsage (the guarded write) and must NOT
    // fall back to the unconditional recordUsage path that caused the TOCTOU.
    const repo = memRepo();
    let reserveCalls = 0;
    let recordCalls = 0;
    const baseReserve = repo.reserveUsage.bind(repo);
    const baseRecord = repo.recordUsage.bind(repo);
    repo.reserveUsage = async (e, limit, since) => {
      reserveCalls += 1;
      return baseReserve(e, limit, since);
    };
    repo.recordUsage = async (e) => {
      recordCalls += 1;
      return baseRecord(e);
    };
    const meter = createMeteringService({ repo, now: FIXED_NOW });
    const svc = createQuotaService({ repo, catalog, resolvePlan: resolvePlan('free'), metering: meter, now: FIXED_NOW });

    const res = await svc.consume(subject('u1'), 'agent_run', 1, { idempotencyKey: 'ok' });
    expect(res.recorded).toBe(true);
    expect(reserveCalls).toBe(1);
    expect(recordCalls).toBe(0);
  });
});
