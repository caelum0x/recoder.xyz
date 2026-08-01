/**
 * Outbound-resilience wiring for the four MoR adapters' shared HTTP transport
 * (`adapters/shared.ts` → `createProviderTransport`). Two guarantees, proven
 * with injected clock/RNG/timer so nothing here touches a real network or timer:
 *
 *  1. RETRY POLICY — bounded jittered retry is applied ONLY to idempotent `GET`
 *     reads (subscription lookup / health probe). A `POST` (checkout-create,
 *     usage-ingest) runs EXACTLY ONCE and is never re-sent, so a payment/usage
 *     side effect can never be duplicated.
 *  2. CIRCUIT BREAKER — after N consecutive failures the per-provider circuit
 *     trips OPEN and every subsequent call fast-fails TRUTHFULLY (a
 *     `CircuitOpenError`, never a fabricated success) without touching the
 *     network, until a cooldown allows a single half-open probe to recover it.
 *     Keys isolate providers so one bad downstream cannot trip a healthy one.
 *
 * The primitive under `../../../shared/outbound-resilience` is imported READ-ONLY
 * and never modified.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  type Sleep,
} from '../../../shared/outbound-resilience.js';
import { createProviderTransport } from '../adapters/shared.js';
import { sliceBillingConfig } from '../config.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { createPolarAdapter } from '../adapters/polar.adapter.js';
import type { CheckoutIntent } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<
  typeof sliceBillingConfig
>[0];

/** A `fetch` result that surfaces as a 2xx JSON body in `providerFetch`. */
function okResp(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(json),
  } as unknown as Response;
}

/** A `fetch` result that surfaces as a non-2xx → `SERVICE_UNAVAILABLE` throw. */
function failResp(): Response {
  return {
    ok: false,
    status: 503,
    text: async () => JSON.stringify({ detail: 'downstream boom' }),
  } as unknown as Response;
}

/** Deterministic seams: never sleep for real, never draw real jitter. */
const noSleep: Sleep = async () => {};
const zeroJitter = (): number => 0;

const BASE = 'https://api.polar.sh';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createProviderTransport — retry policy (idempotent GET only)', () => {
  it('retries a transient GET failure up to the budget, then succeeds', async () => {
    const fetchMock = vi
      .fn<[], Promise<Response>>()
      .mockResolvedValueOnce(failResp())
      .mockResolvedValueOnce(failResp())
      .mockResolvedValueOnce(okResp({ id: 'sub_1' }));
    vi.stubGlobal('fetch', fetchMock);

    const t = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      resilience: { maxAttempts: 3, sleep: noSleep, random: zeroJitter },
    });

    await expect(t.call('GET', '/v1/subscriptions/x')).resolves.toEqual({ id: 'sub_1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(t.breaker.state('polar')).toBe('closed');
  });

  it('gives up after the bounded budget and throws (never fabricates a body)', async () => {
    const fetchMock = vi.fn<[], Promise<Response>>().mockResolvedValue(failResp());
    vi.stubGlobal('fetch', fetchMock);

    const t = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      resilience: { maxAttempts: 3, failureThreshold: 99, sleep: noSleep, random: zeroJitter },
    });

    await expect(t.call('GET', '/v1/subscriptions/x')).rejects.toBeInstanceOf(AppError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('NEVER retries a non-idempotent POST (checkout/usage side effect not duplicated)', async () => {
    const fetchMock = vi.fn<[], Promise<Response>>().mockResolvedValue(failResp());
    vi.stubGlobal('fetch', fetchMock);

    const t = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      resilience: { maxAttempts: 5, failureThreshold: 99, sleep: noSleep, random: zeroJitter },
    });

    await expect(t.call('POST', '/v1/checkouts/', { products: ['p'] })).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
    // Exactly one wire attempt — the retry budget is intentionally ignored here.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createProviderTransport — circuit breaker (truthful fast-fail)', () => {
  it('trips OPEN after the threshold and fast-fails without touching the network', async () => {
    const fetchMock = vi.fn<[], Promise<Response>>().mockResolvedValue(failResp());
    vi.stubGlobal('fetch', fetchMock);

    const t = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      resilience: { failureThreshold: 2, maxAttempts: 1, sleep: noSleep, random: zeroJitter },
    });

    await expect(t.call('GET', '/a')).rejects.toBeInstanceOf(AppError); // failure #1
    await expect(t.call('GET', '/a')).rejects.toBeInstanceOf(AppError); // failure #2 → OPEN
    expect(t.breaker.state('polar')).toBe('open');

    const before = fetchMock.mock.calls.length;
    // While OPEN: a truthful CircuitOpenError, not a fabricated response, and NO fetch.
    const err = await t.call('GET', '/a').catch((e) => e);
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect((err as CircuitOpenError).code).toBe('EGRESS_CIRCUIT_OPEN');
    expect((err as CircuitOpenError).key).toBe('polar');
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('isolates providers by key: one open circuit does not trip a healthy one', async () => {
    const failMock = vi.fn<[], Promise<Response>>().mockResolvedValue(failResp());
    vi.stubGlobal('fetch', failMock);

    // A shared breaker keyed per provider name proves the isolation is by key.
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    const polar = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      resilience: { breaker, maxAttempts: 1, sleep: noSleep, random: zeroJitter },
    });
    const creem = createProviderTransport({
      provider: 'creem',
      baseUrl: 'https://api.creem.io',
      apiKey: 'k',
      resilience: { breaker, maxAttempts: 1, sleep: noSleep, random: zeroJitter },
    });

    await expect(polar.call('GET', '/a')).rejects.toBeInstanceOf(AppError); // polar → OPEN
    expect(breaker.state('polar')).toBe('open');
    expect(breaker.state('creem')).toBe('closed');

    // creem is still CLOSED → its GET reaches the network (fast-fail not triggered).
    const before = failMock.mock.calls.length;
    await expect(creem.call('GET', '/b')).rejects.toBeInstanceOf(AppError);
    expect(failMock.mock.calls.length).toBe(before + 1);
  });
});

describe('polar adapter — resilience wired end-to-end (fail-safe, never faked)', () => {
  const INTENT: CheckoutIntent = {
    subject: { subjectId: 'u1', kind: 'user' },
    plan: 'pro',
    productId: 'prod_123',
    successUrl: 'https://recoder.xyz/thanks',
  };

  function buildAdapter(now: () => number) {
    const config = sliceBillingConfig(appConfig, { polar: { apiKey: 'sk_live' } });
    return createPolarAdapter({
      credential: config.polar,
      catalog: createPlanCatalog(config),
      resilience: {
        failureThreshold: 2,
        cooldownMs: 1_000,
        now,
        maxAttempts: 1,
        sleep: noSleep,
        random: zeroJitter,
      },
    });
  }

  it('an open circuit surfaces as fail-safe null / truthful down, then recovers on probe', async () => {
    const clock = { t: 0 };
    const now = () => clock.t;
    const fetchMock = vi.fn<[], Promise<Response>>().mockResolvedValue(failResp());
    vi.stubGlobal('fetch', fetchMock);

    const adapter = buildAdapter(now);

    // Two failing reads trip the circuit OPEN (each read = one wire attempt).
    await expect(adapter.getSubscription('sub_x')).resolves.toBeNull();
    await expect(adapter.getSubscription('sub_x')).resolves.toBeNull();
    const afterTrip = fetchMock.mock.calls.length;
    expect(afterTrip).toBe(2);

    // OPEN: getSubscription still fail-safes to null but NEVER hits the network.
    await expect(adapter.getSubscription('sub_x')).resolves.toBeNull();
    expect(fetchMock.mock.calls.length).toBe(afterTrip);

    // OPEN: health is a truthful `down` citing the open circuit, no network.
    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(String(health.reason)).toMatch(/circuit open/i);
    expect(fetchMock.mock.calls.length).toBe(afterTrip);

    // OPEN: checkout-create fast-fails TRUTHFULLY (no fabricated checkout url).
    const checkoutErr = await adapter.createCheckout(INTENT).catch((e) => e);
    expect(checkoutErr).toBeInstanceOf(CircuitOpenError);
    expect(fetchMock.mock.calls.length).toBe(afterTrip);

    // Cooldown elapses → a single half-open probe; a real 2xx closes the circuit.
    clock.t = 1_000;
    fetchMock.mockResolvedValue(okResp({ id: 'sub_x', status: 'active', product_id: 'prod_123' }));
    const recovered = await adapter.getSubscription('sub_x');
    expect(recovered).not.toBeNull();
    expect(recovered?.providerSubId).toBe('sub_x');
    expect(fetchMock.mock.calls.length).toBe(afterTrip + 1);
  });
});
