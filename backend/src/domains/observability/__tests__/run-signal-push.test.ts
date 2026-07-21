/**
 * Reverse-push wire contract — the FUSION test: a run-level `stuck`/`failed`
 * signal the conductor detected is forwarded to the Python sidecar's
 * `POST /work-signals/ingest` (X-API-Key auth, run-shaped body), and the whole
 * edge is degrade-truthful (absent/unreachable/unauthorized sidecar ⇒ a
 * `degraded` no-op that NEVER throws, `completed` ⇒ a truthful skip).
 *
 * Covers both the adapter ({@link OpsRecorderClient.forwardToOpsRecorder} /
 * `syncGithub`) and the service ({@link RunSignalPushService.forwardRunSignal})
 * that maps a run outcome onto it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import { OpsRecorderClient } from '../adapters/ops-recorder.adapter.js';
import { RunSignalPushService } from '../services/run-signal-push.service.js';

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
} as unknown as Logger;

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

describe('OpsRecorderClient.forwardToOpsRecorder — reverse-push wire contract', () => {
  it('FUSION FIRES: a stuck run signal POSTs to /work-signals/ingest with X-API-Key', async () => {
    const stored = { id: 'a1b2c3', source: 'github' };
    const fetchMock = stubFetch(new Response(JSON.stringify(stored), { status: 201 }));

    const result = await client().forwardToOpsRecorder({
      outcome: 'stuck',
      title: 'run r-42 stuck awaiting review',
      sourceUrl: 'https://github.com/x/y/pull/9',
      reason: 'no review in 3d',
      runId: 'run_42',
      workspaceId: 'ws-9',
    });

    expect(result).toEqual({ forwarded: true, degraded: false, signalId: 'a1b2c3' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8091/work-signals/ingest');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('sidecar-key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();

    const body = JSON.parse(init.body as string);
    expect(body.source).toBe('github');
    expect(body.item_type).toBe('pull_request');
    expect(body.title).toBe('run r-42 stuck awaiting review');
    expect(body.source_url).toBe('https://github.com/x/y/pull/9');
    expect(body.detected_reason).toBe('no review in 3d');
    expect(body.priority).toBe('high');
    // Run provenance is folded into `status` so the stored signal is correlatable.
    expect(body.status).toContain('run_42');
    expect(body.status).toContain('stuck');
  });

  it('absent sidecar (no URL) ⇒ degraded no-op, NO network call, never throws', async () => {
    const fetchMock = stubFetch(new Response('[]', { status: 200 }));
    const result = await client({ baseUrl: null }).forwardToOpsRecorder({
      outcome: 'failed',
      title: 't',
      sourceUrl: 'u',
      reason: 'boom',
    });
    expect(result.forwarded).toBe(false);
    expect(result.degraded).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('missing token (preflight would fail) ⇒ degraded no-op, no network call', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 201 }));
    const result = await client({ token: null }).forwardToOpsRecorder({
      outcome: 'failed',
      title: 't',
      sourceUrl: 'u',
      reason: 'boom',
    });
    expect(result).toEqual({
      forwarded: false,
      degraded: true,
      reason: 'ops-recorder auth token absent (preflight would fail)',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 ⇒ not forwarded with auth reason (never a silent success)', async () => {
    stubFetch(new Response('{"detail":"Invalid or missing API key."}', { status: 401 }));
    const result = await client().forwardToOpsRecorder({
      outcome: 'stuck',
      title: 't',
      sourceUrl: 'u',
      reason: 'r',
    });
    expect(result).toEqual({
      forwarded: false,
      degraded: true,
      reason: 'ops-recorder auth preflight rejected',
    });
  });

  it('unreachable sidecar ⇒ degraded no-op (transport fault swallowed)', async () => {
    stubFetch(new Error('ECONNREFUSED'));
    const result = await client().forwardToOpsRecorder({
      outcome: 'failed',
      title: 't',
      sourceUrl: 'u',
      reason: 'r',
    });
    expect(result.forwarded).toBe(false);
    expect(result.degraded).toBe(true);
  });

  it('syncGithub POSTs to /work-signals/sync/github and reports triggered on 202', async () => {
    const fetchMock = stubFetch(new Response('{"status":"accepted"}', { status: 202 }));
    const result = await client().syncGithub();
    expect(result).toEqual({ triggered: true, degraded: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8091/work-signals/sync/github');
    expect(init.method).toBe('POST');
  });

  it('syncGithub against an absent sidecar ⇒ degraded no-op', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 202 }));
    const result = await client({ baseUrl: null }).syncGithub();
    expect(result).toEqual({
      triggered: false,
      degraded: true,
      reason: 'ops-recorder sidecar not configured (no URL)',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('syncLinear POSTs to /work-signals/sync/linear and reports triggered on 202', async () => {
    const fetchMock = stubFetch(new Response('{"status":"accepted"}', { status: 202 }));
    const result = await client().syncLinear();
    expect(result).toEqual({ triggered: true, degraded: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8091/work-signals/sync/linear');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('sidecar-key');
  });

  it('syncLinear against an absent sidecar ⇒ degraded no-op, no network call', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 202 }));
    const result = await client({ baseUrl: null }).syncLinear();
    expect(result).toEqual({
      triggered: false,
      degraded: true,
      reason: 'ops-recorder sidecar not configured (no URL)',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('syncLinear missing token (preflight would fail) ⇒ degraded no-op', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 202 }));
    const result = await client({ token: null }).syncLinear();
    expect(result).toEqual({
      triggered: false,
      degraded: true,
      reason: 'ops-recorder auth token absent (preflight would fail)',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('RunSignalPushService.forwardRunSignal — run-outcome mapping', () => {
  it('forwards a stuck run through the port (fusion end-to-end)', async () => {
    const port = {
      forwardToOpsRecorder: vi.fn().mockResolvedValue({ forwarded: true, degraded: false, signalId: 'z9' }),
      syncGithub: vi.fn(),
    };
    const svc = new RunSignalPushService({ logger, port });

    const result = await svc.forwardRunSignal({
      outcome: 'stuck',
      title: 'stuck run',
      reason: 'stalled',
      runId: 'run_7',
      workspaceId: 'ws-7',
    });

    expect(result.forwarded).toBe(true);
    expect(port.forwardToOpsRecorder).toHaveBeenCalledTimes(1);
    const pushed = port.forwardToOpsRecorder.mock.calls[0][0];
    expect(pushed.outcome).toBe('stuck');
    expect(pushed.priority).toBe('high');
    expect(pushed.runId).toBe('run_7');
  });

  it('synthesizes a recoder://run/<id> url when the run has no PR url', async () => {
    const port = {
      forwardToOpsRecorder: vi.fn().mockResolvedValue({ forwarded: true, degraded: false }),
      syncGithub: vi.fn(),
    };
    const svc = new RunSignalPushService({ logger, port });
    await svc.forwardRunSignal({ outcome: 'failed', title: 't', runId: 'run_5' });
    expect(port.forwardToOpsRecorder.mock.calls[0][0].sourceUrl).toBe('recoder://run/run_5');
  });

  it('completed run is a truthful skip — no push', async () => {
    const port = { forwardToOpsRecorder: vi.fn(), syncGithub: vi.fn() };
    const svc = new RunSignalPushService({ logger, port });
    const result = await svc.forwardRunSignal({ outcome: 'completed', title: 'done', runId: 'run_1' });
    expect(result.forwarded).toBe(false);
    expect(result.degraded).toBe(false);
    expect(port.forwardToOpsRecorder).not.toHaveBeenCalled();
  });

  it('a port fault degrades truthfully and never rethrows', async () => {
    const port = {
      forwardToOpsRecorder: vi.fn().mockRejectedValue(new Error('kaput')),
      syncGithub: vi.fn(),
      syncLinear: vi.fn(),
    };
    const svc = new RunSignalPushService({ logger, port });
    const result = await svc.forwardRunSignal({ outcome: 'failed', title: 't', runId: 'run_3' });
    expect(result).toEqual({ forwarded: false, degraded: true, reason: 'kaput' });
  });

  it('syncLinear delegates to the port and reports triggered', async () => {
    const port = {
      forwardToOpsRecorder: vi.fn(),
      syncGithub: vi.fn(),
      syncLinear: vi.fn().mockResolvedValue({ triggered: true, degraded: false }),
    };
    const svc = new RunSignalPushService({ logger, port });
    const result = await svc.syncLinear();
    expect(result).toEqual({ triggered: true, degraded: false });
    expect(port.syncLinear).toHaveBeenCalledTimes(1);
  });

  it('syncLinear swallows a port fault as a degraded no-op (never rethrows)', async () => {
    const port = {
      forwardToOpsRecorder: vi.fn(),
      syncGithub: vi.fn(),
      syncLinear: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const svc = new RunSignalPushService({ logger, port });
    const result = await svc.syncLinear();
    expect(result).toEqual({ triggered: false, degraded: true, reason: 'boom' });
  });
});
