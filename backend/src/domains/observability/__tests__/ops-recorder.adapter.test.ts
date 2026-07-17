/**
 * `OpsRecorderClient` wire contract — the sidecar's `require_api_key`
 * (backend/engines/py/ops-recorder/work-signals/config.py) reads ONLY the
 * `X-API-Key` header. These tests fake the sidecar via a stubbed global fetch
 * and assert:
 *   (a) the adapter sends `X-API-Key: <token>` (NOT `Authorization: Bearer`),
 *   (b) 200 → availability `up` and signals parsed,
 *   (c) 401 → `down` with an auth reason (truthful, never fabricates),
 *   (d) unreachable → `down`,
 *   (e) malformed JSON → `[]` (no fabricated signals).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import { OpsRecorderClient } from '../adapters/ops-recorder.adapter.js';
import type { RawWorkSignal } from '../ports/signals.port.js';

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
} as unknown as Logger;

const signal: RawWorkSignal = {
  id: 'ws-1',
  source: 'github',
  item_type: 'pr',
  title: 'stuck PR',
  source_url: 'https://github.com/x/y/pull/1',
  detected_reason: 'no review in 3d',
  priority: 'high',
};

function client(overrides: Partial<ConstructorParameters<typeof OpsRecorderClient>[0]> = {}) {
  return new OpsRecorderClient({
    logger,
    baseUrl: 'http://127.0.0.1:8091',
    token: 'sidecar-key',
    timeoutMs: 200,
    ...overrides,
  });
}

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fn =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('OpsRecorderClient wire contract (X-API-Key, not bearer)', () => {
  it('sends the token in X-API-Key — the ONLY header the sidecar accepts', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify([signal]), { status: 200 }));
    await client().fetchSignals();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8091/work-signals');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('sidecar-key');
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('healthy keyed sidecar (200) → availability up', async () => {
    stubFetch(new Response(JSON.stringify([signal]), { status: 200 }));
    await expect(client().availability()).resolves.toEqual({ status: 'up' });
  });

  it('200 → signals parsed through unchanged', async () => {
    stubFetch(new Response(JSON.stringify([signal]), { status: 200 }));
    await expect(client().fetchSignals()).resolves.toEqual([signal]);
  });

  it('401 → down with auth reason (never up on rejected key)', async () => {
    stubFetch(new Response('{"detail":"Invalid or missing API key."}', { status: 401 }));
    await expect(client().availability()).resolves.toEqual({
      status: 'down',
      reason: 'ops-recorder auth preflight rejected',
    });
  });

  it('unreachable sidecar → down, fetchSignals empty (no fabrication)', async () => {
    stubFetch(new Error('ECONNREFUSED'));
    const c = client();
    await expect(c.availability()).resolves.toEqual({
      status: 'down',
      reason: 'ops-recorder sidecar unreachable',
    });
    await expect(c.fetchSignals()).resolves.toEqual([]);
  });

  it('malformed JSON body → [] (no fabricated signals)', async () => {
    stubFetch(new Response('not-json{', { status: 200 }));
    await expect(client().fetchSignals()).resolves.toEqual([]);
  });

  it('no token configured → down before any network call', async () => {
    const fetchMock = stubFetch(new Response('[]', { status: 200 }));
    await expect(client({ token: null }).availability()).resolves.toEqual({
      status: 'down',
      reason: 'ops-recorder auth token absent (preflight would fail)',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
