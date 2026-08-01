/**
 * Slice BE-8.5 — the outbound-resilience wiring on the shared sidecar transport
 * (`daemonFetch`). Everything is injected: a fake `fetch` (no network), a scripted
 * clock on the breaker, and a no-op `sleep` (no real timers), so every retry /
 * breaker transition is deterministic. Asserts the two laws:
 *
 *   1. Idempotent GET/HEAD probes retry a transient failure with bounded backoff;
 *      a stateful POST/PATCH/DELETE is NEVER re-sent.
 *   2. A per-sidecar breaker trips on REACHABILITY outages and, while OPEN,
 *      fast-fails truthfully into the existing degrade path (never a fabricated
 *      result) — isolated per sidecar origin.
 */
import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, type Sleep } from '../../../../shared/outbound-resilience.js';
import {
  daemonFetch,
  sidecarKeyForUrl,
  type FetchLike,
  type DaemonFetchResilience,
} from './daemon-adapter-base.js';

/** A JSON `Response` with a given status. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch that returns a scripted sequence of outcomes (Response | throw), once each. */
function scriptedFetch(steps: ReadonlyArray<Response | Error>): { fetchImpl: FetchLike; calls: () => number } {
  let i = 0;
  const fetchImpl: FetchLike = vi.fn(async () => {
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if (step instanceof Error) throw step;
    return step;
  });
  return { fetchImpl, calls: () => (fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length };
}

/** A no-op sleep so backoff never touches a real timer. */
const instantSleep: Sleep = async () => {};

/** Build a resilience bag with a fresh breaker + injected timers/rng. */
function harness(
  fetchImpl: FetchLike,
  extra: Partial<DaemonFetchResilience> = {},
): { resilience: DaemonFetchResilience; breaker: CircuitBreaker } {
  const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000, now: () => 0 });
  return {
    breaker,
    resilience: {
      breaker,
      fetchImpl,
      sleep: instantSleep,
      random: () => 0, // zero jitter → deterministic (and 0ms) backoff
      ...extra,
    },
  };
}

describe('sidecarKeyForUrl', () => {
  it('keys by origin so every path on one sidecar shares a circuit', () => {
    expect(sidecarKeyForUrl('http://127.0.0.1:8893/rerank')).toBe('http://127.0.0.1:8893');
    expect(sidecarKeyForUrl('http://127.0.0.1:8893/collections/x/stats')).toBe('http://127.0.0.1:8893');
    // Distinct ports isolate distinct sidecars.
    expect(sidecarKeyForUrl('http://127.0.0.1:9999/health')).toBe('http://127.0.0.1:9999');
  });

  it('falls back to the raw string on an un-parseable URL', () => {
    expect(sidecarKeyForUrl('not a url')).toBe('not a url');
  });
});

describe('daemonFetch — idempotent GET retry', () => {
  it('retries a transient transport failure then succeeds', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      new Error('ECONNREFUSED'),
      jsonResponse(200, { ok: true }),
    ]);
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch('http://127.0.0.1:8893/collections', {}, resilience);
    expect(res.ok).toBe(true);
    expect(calls()).toBe(2); // first failed, retry succeeded
  });

  it('retries a transient 5xx then succeeds', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      jsonResponse(503, { error: 'warming up' }),
      jsonResponse(200, { hits: [] }),
    ]);
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch('http://127.0.0.1:8893/api/search', { method: 'GET' }, resilience);
    expect(res.ok).toBe(true);
    expect(calls()).toBe(2);
  });

  it('does NOT retry a 4xx (client error is not transient)', async () => {
    const { fetchImpl, calls } = scriptedFetch([jsonResponse(404, { error: 'missing' })]);
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch('http://127.0.0.1:8893/collections/x/stats', {}, resilience);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('http_404');
    expect(calls()).toBe(1);
  });

  it('exhausts the bounded attempt budget on a persistent failure', async () => {
    const { fetchImpl, calls } = scriptedFetch([new Error('down'), new Error('down'), new Error('down')]);
    const { resilience } = harness(fetchImpl, { maxAttempts: 3 });
    const res = await daemonFetch('http://127.0.0.1:8893/collections', {}, resilience);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('request_failed');
    expect(calls()).toBe(3); // exactly maxAttempts, no more
  });
});

describe('daemonFetch — stateful writes are never re-sent', () => {
  it('fails fast on a POST transport failure (no retry)', async () => {
    const { fetchImpl, calls } = scriptedFetch([new Error('ECONNRESET'), jsonResponse(200, { id: 'x' })]);
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch(
      'http://127.0.0.1:8893/rerank',
      { method: 'POST', body: { q: 'x' } },
      resilience,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('request_failed');
    expect(calls()).toBe(1); // POST tried exactly once
  });

  it('fails fast on a POST 5xx (no retry)', async () => {
    const { fetchImpl, calls } = scriptedFetch([jsonResponse(500, { error: 'boom' })]);
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch(
      'http://127.0.0.1:8893/collections',
      { method: 'POST', body: { name: 'x', passages: ['a'] } },
      resilience,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('http_500');
    expect(calls()).toBe(1);
  });

  it('does not retry a PATCH', async () => {
    const { fetchImpl, calls } = scriptedFetch([new Error('down'), jsonResponse(200, {})]);
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch(
      'http://127.0.0.1:8893/work-signals/1/status',
      { method: 'PATCH', body: { status: 'done' } },
      resilience,
    );
    expect(res.ok).toBe(false);
    expect(calls()).toBe(1);
  });
});

describe('daemonFetch — per-sidecar circuit breaker', () => {
  it('trips OPEN after consecutive transport outages, then fast-fails truthfully', async () => {
    // Every attempt is an unreachable outage. maxAttempts:1 so each daemonFetch =
    // exactly one transport failure → one breaker failure. threshold:2 → OPEN after 2.
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const { resilience } = harness(fetchImpl, { maxAttempts: 1 });
    const url = 'http://127.0.0.1:8893/collections';

    const r1 = await daemonFetch(url, {}, resilience);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.code).toBe('request_failed');

    const r2 = await daemonFetch(url, {}, resilience);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('request_failed');

    // Circuit now OPEN → next call fast-fails WITHOUT touching fetch.
    const callsBefore = (fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    const r3 = await daemonFetch(url, {}, resilience);
    expect(r3.ok).toBe(false);
    if (!r3.ok) {
      expect(r3.code).toBe('circuit_open');
      expect(r3.reason).toContain('circuit open');
    }
    const callsAfter = (fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(callsAfter).toBe(callsBefore); // no outbound call while OPEN
  });

  it('an HTTP error status (4xx/5xx) does NOT trip the breaker — sidecar is reachable', async () => {
    // Three 500s in a row. Each is a reachable answer → breaker success → never OPEN.
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(500, { error: 'x' }));
    const { resilience, breaker } = harness(fetchImpl, { maxAttempts: 1 });
    const url = 'http://127.0.0.1:8893/collections';
    for (let n = 0; n < 3; n += 1) {
      const res = await daemonFetch(url, { method: 'POST', body: {} }, resilience);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('http_500'); // truthful status, not circuit_open
    }
    expect(breaker.state(sidecarKeyForUrl(url))).toBe('closed');
  });

  it('isolates sidecars — a dead colbert never trips ops-recorder', async () => {
    const colbert = 'http://127.0.0.1:8893/collections';
    const opsRecorder = 'http://127.0.0.1:8894/work-signals';
    const fetchImpl: FetchLike = vi.fn(async (input: string) => {
      if (input.startsWith('http://127.0.0.1:8893')) throw new Error('colbert down');
      return jsonResponse(200, [{ id: 'sig-1' }]);
    });
    const { resilience } = harness(fetchImpl, { maxAttempts: 1 });

    // Trip colbert OPEN.
    await daemonFetch(colbert, {}, resilience);
    await daemonFetch(colbert, {}, resilience);
    const colbertOpen = await daemonFetch(colbert, {}, resilience);
    expect(colbertOpen.ok).toBe(false);
    if (!colbertOpen.ok) expect(colbertOpen.code).toBe('circuit_open');

    // ops-recorder on a different origin is unaffected.
    const opsRes = await daemonFetch(opsRecorder, {}, resilience);
    expect(opsRes.ok).toBe(true);
  });

  it('recovers after cooldown: a half-open probe success closes the circuit', async () => {
    let clock = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000, now: () => clock });
    let mode: 'fail' | 'ok' = 'fail';
    const fetchImpl: FetchLike = vi.fn(async () => {
      if (mode === 'fail') throw new Error('down');
      return jsonResponse(200, { ok: true });
    });
    const resilience: DaemonFetchResilience = { breaker, fetchImpl, sleep: instantSleep, random: () => 0, maxAttempts: 1 };
    const url = 'http://127.0.0.1:8893/collections';

    await daemonFetch(url, {}, resilience);
    await daemonFetch(url, {}, resilience);
    expect(breaker.state(sidecarKeyForUrl(url))).toBe('open');

    // Advance past cooldown → half-open probe; sidecar is healthy now.
    clock = 2_000;
    mode = 'ok';
    const recovered = await daemonFetch(url, {}, resilience);
    expect(recovered.ok).toBe(true);
    expect(breaker.state(sidecarKeyForUrl(url))).toBe('closed');
  });
});

describe('daemonFetch — wire contract preserved', () => {
  it('parses a JSON 2xx body', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(200, { hello: 'world' }));
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch<{ hello: string }>('http://127.0.0.1:8893/x', {}, resilience);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.hello).toBe('world');
  });

  it('returns { raw } for a non-JSON 2xx body', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('plain text', { status: 200 }));
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch<{ raw: string }>('http://127.0.0.1:8893/x', {}, resilience);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.raw).toBe('plain text');
  });

  it('returns undefined value for an empty 2xx body', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('', { status: 200 }));
    const { resilience } = harness(fetchImpl);
    const res = await daemonFetch('http://127.0.0.1:8893/x', {}, resilience);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBeUndefined();
  });
});
