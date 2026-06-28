import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createUsageMeterEmitter,
  aggregateUsage,
  windowStartOf,
  totalUsage,
  deriveIdempotencyKey,
  type UsageEvent,
} from '../../../src/channels/usage/index';
import type { BillingPort, MeterEvent } from '../../../src/ports/billing-port';
import type { EventBusPort } from '../../../src/ports/event-bus-port';
import type { RunEvent } from '@recoder/agent-os';
import { FailSafeError } from '../../../src/errors/index';
import { createEnvSecretPort } from '../../../src/ports/secret-port';
import { createPolarBillingAdapter } from '../../../src/channels/billing/adapters/polar-billing-adapter';
import { createPlanCatalog } from '../../../src/channels/billing/plan-catalog';
import { ENV_KEYS } from '../../../src/config/index';

function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    subjectId: 'org_1',
    subjectKind: 'org',
    kind: 'agent_run',
    quantity: 1,
    timestamp: '2026-06-28T03:15:00Z',
    idempotencyKey: 'k1',
    ...overrides,
  };
}

/** A billing port capturing emitted meter events. */
function capturingBilling(opts: { throwOnEmit?: boolean } = {}) {
  const emitted: MeterEvent[] = [];
  const billing: BillingPort = {
    async startCheckout() {
      throw new Error('nope');
    },
    async resolveEntitlements() {
      return [];
    },
    async getQuota(subject) {
      return { subjectId: subject.subjectId, kind: 'cli_request', limit: 0, remaining: 0, resetAt: 'x' };
    },
    async emitUsage(e) {
      if (opts.throwOnEmit) throw new Error('provider down');
      emitted.push(e);
    },
    async validateLicenseKey() {
      return { valid: false };
    },
    async health() {
      return { status: 'ok', checkedAt: 'x' };
    },
  };
  return { billing, emitted };
}

function capturingEvents() {
  const events: RunEvent[] = [];
  const bus: EventBusPort = { async emit(e) { events.push(e); } };
  return { bus, events };
}

test('deriveIdempotencyKey is deterministic and time-bucketed to the second', () => {
  const a = deriveIdempotencyKey({ subjectId: 'org_1', kind: 'agent_run', quantity: 2, timestamp: '2026-06-28T03:15:00.500Z' });
  const b = deriveIdempotencyKey({ subjectId: 'org_1', kind: 'agent_run', quantity: 2, timestamp: '2026-06-28T03:15:00.900Z' });
  assert.equal(a, b); // same second → same key
  const c = deriveIdempotencyKey({ subjectId: 'org_1', kind: 'agent_run', quantity: 2, timestamp: '2026-06-28T03:15:01Z' });
  assert.notEqual(a, c); // next second → different key
});

test('emit forwards a valid event to the billing meter feed and emits an audit RunEvent', async () => {
  const { billing, emitted } = capturingBilling();
  const { bus, events } = capturingEvents();
  const emitter = createUsageMeterEmitter({ billing, events: bus, taskId: 'task_1', eventId: () => 'evt_1' });

  const res = await emitter.emit(event({ quantity: 3 }));
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.value, { emitted: true, deduped: false, idempotencyKey: 'k1' });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]!.kind, 'agent_run');
  assert.equal(emitted[0]!.quantity, 3);
  assert.equal(emitted[0]!.idempotencyKey, 'k1');

  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, 'log');
  assert.equal(events[0]!.data?.kind, 'agent_run');
});

test('emit dedupes a repeated idempotency key (never double-bills)', async () => {
  const { billing, emitted } = capturingBilling();
  const emitter = createUsageMeterEmitter({ billing });

  assert.equal((await emitter.emit(event())).ok, true);
  const second = await emitter.emit(event());
  assert.equal(second.ok, true);
  if (second.ok) assert.deepEqual(second.value, { emitted: false, deduped: true, idempotencyKey: 'k1' });
  assert.equal(emitted.length, 1); // only one reached the provider
});

test('emit rejects a malformed event BEFORE any provider call', async () => {
  const { billing, emitted } = capturingBilling();
  const emitter = createUsageMeterEmitter({ billing });
  const bad = await emitter.emit({ ...event(), quantity: 0 }); // quantity must be positive
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.error.code, 'invalid_input');
  assert.equal(emitted.length, 0);
});

test('emit fails safe over the real Polar adapter when POLAR_ACCESS_TOKEN is absent', async () => {
  // The billing port itself fails safe; the emitter surfaces it as an err, not a faked emit.
  const adapter = createPolarBillingAdapter({
    secrets: createEnvSecretPort({}),
    planCatalog: createPlanCatalog([]),
    fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
  });
  const emitter = createUsageMeterEmitter({ billing: adapter });
  const res = await emitter.emit(event());
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.error instanceof FailSafeError);
});

test('emit surfaces a provider error as an err (retryable), never a faked success', async () => {
  const { billing } = capturingBilling({ throwOnEmit: true });
  const emitter = createUsageMeterEmitter({ billing });
  const res = await emitter.emit(event());
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'provider_unavailable');
});

test('emit guards usage emission for the real adapter once a token is present', async () => {
  const captured: unknown[] = [];
  const adapter = createPolarBillingAdapter({
    secrets: createEnvSecretPort({ [ENV_KEYS.POLAR_ACCESS_TOKEN]: 'polar_tok' }),
    planCatalog: createPlanCatalog([]),
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      captured.push(init?.body ? JSON.parse(String(init.body)) : null);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch,
  });
  const emitter = createUsageMeterEmitter({ billing: adapter });
  const res = await emitter.emit(event({ kind: 'publish', quantity: 2, idempotencyKey: 'pub-1' }));
  assert.equal(res.ok, true);
  const body = captured[0] as { events: Array<{ name: string; metadata: { quantity: number } }> };
  assert.equal(body.events[0]!.name, 'publish');
  assert.equal(body.events[0]!.metadata.quantity, 2);
});

test('windowStartOf truncates to hour/day/month in UTC', () => {
  assert.equal(windowStartOf('2026-06-28T03:15:42Z', 'hour'), '2026-06-28T03:00:00.000Z');
  assert.equal(windowStartOf('2026-06-28T03:15:42Z', 'day'), '2026-06-28T00:00:00.000Z');
  assert.equal(windowStartOf('2026-06-28T03:15:42Z', 'month'), '2026-06-01T00:00:00.000Z');
});

test('aggregateUsage buckets per window, sums quantities, and dedupes by key', () => {
  const events: UsageEvent[] = [
    event({ idempotencyKey: 'a', timestamp: '2026-06-28T03:10:00Z', quantity: 2 }),
    event({ idempotencyKey: 'b', timestamp: '2026-06-28T03:50:00Z', quantity: 3 }),
    event({ idempotencyKey: 'b', timestamp: '2026-06-28T03:50:00Z', quantity: 3 }), // dup → ignored
    event({ idempotencyKey: 'c', timestamp: '2026-06-28T05:05:00Z', quantity: 4 }),
    event({ idempotencyKey: 'd', subjectId: 'org_2', timestamp: '2026-06-28T03:00:00Z', quantity: 9 }),
  ];
  const windows = aggregateUsage(events, 'hour');

  // org_1 @ 03:00 → 2+3 = 5 (dup dropped); org_1 @ 05:00 → 4; org_2 @ 03:00 → 9
  assert.equal(windows.length, 3);
  const org1h3 = windows.find((w) => w.subjectId === 'org_1' && w.windowStart === '2026-06-28T03:00:00.000Z')!;
  assert.equal(org1h3.total, 5);
  assert.equal(org1h3.eventCount, 2);
  const org1h5 = windows.find((w) => w.subjectId === 'org_1' && w.windowStart === '2026-06-28T05:00:00.000Z')!;
  assert.equal(org1h5.total, 4);
  const org2 = windows.find((w) => w.subjectId === 'org_2')!;
  assert.equal(org2.total, 9);
});

test('totalUsage sums a subject/kind across events (deduped)', () => {
  const events: UsageEvent[] = [
    event({ idempotencyKey: 'a', quantity: 2 }),
    event({ idempotencyKey: 'a', quantity: 2 }), // dup
    event({ idempotencyKey: 'b', quantity: 5 }),
    event({ idempotencyKey: 'c', kind: 'publish', quantity: 100 }),
  ];
  assert.equal(totalUsage(events, 'org_1', 'agent_run'), 7);
  assert.equal(totalUsage(events, 'org_1', 'publish'), 100);
  assert.equal(totalUsage(events, 'org_2', 'agent_run'), 0);
});
