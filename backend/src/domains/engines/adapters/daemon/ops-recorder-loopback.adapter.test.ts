/**
 * `OpsRecorderLoopbackAdapter` — degrade-safe contract, the API-key preflight,
 * and real work-signals ops. Scripted supervisor + stubbed fetch (no network).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { OpsRecorderLoopbackAdapter } from './ops-recorder-loopback.adapter.js';
import { FakeSupervisor, silentLog, stubFetch } from './test-support.js';
import { up } from '../../types.js';
import type { DaemonAdapterConfig } from './daemon-adapter-base.js';
import type { OpsRecorderIngestShape } from '../../../../conductor/ops-recorder-adapter.js';

const authed: DaemonAdapterConfig = {
  enabled: true,
  externalUrl: null,
  binOverride: null,
  listenAddr: '127.0.0.1:8894',
  childEnv: { OPS_RECORDER_API_KEY: 'test-key' },
};

const signal: OpsRecorderIngestShape = {
  source: 'github',
  item_type: 'pull_request',
  title: 'stuck PR',
  source_url: 'https://github.com/x/y/pull/1',
  detected_reason: 'no review in 5 days',
  priority: 'high',
};

afterEach(() => vi.restoreAllMocks());

describe('OpsRecorderLoopbackAdapter (degrade-safe)', () => {
  it('is down when disabled', async () => {
    const adapter = new OpsRecorderLoopbackAdapter(new FakeSupervisor(), { ...authed, enabled: false }, silentLog);
    expect((await adapter.health()).reason).toBe('disabled');
  });

  it('invoke degrades to {ok:false} when the daemon cannot bind', async () => {
    const adapter = new OpsRecorderLoopbackAdapter(new FakeSupervisor(), authed, silentLog);
    const res = await adapter.invoke({ op: 'list', input: {} });
    expect(res.ok).toBe(false);
  });

  it('validates ingest input before hitting the wire', async () => {
    const bound = new FakeSupervisor({
      handle: { engineId: 'ops-recorder', mode: 'spawned', baseUrl: 'http://127.0.0.1:8894' },
    });
    const adapter = new OpsRecorderLoopbackAdapter(bound, authed, silentLog);
    const res = await adapter.invoke({ op: 'ingest', input: { signal: { source: 'x' } as never } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });
});

describe('OpsRecorderLoopbackAdapter (real work-signals wire)', () => {
  const bound = new FakeSupervisor({
    handle: { engineId: 'ops-recorder', mode: 'spawned', baseUrl: 'http://127.0.0.1:8894' },
    health: up('ops-recorder', 'daemon'),
  });

  it('ingests a detected signal and sends the X-API-Key header', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'sig-1' }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const adapter = new OpsRecorderLoopbackAdapter(bound, authed, silentLog);
    const res = await adapter.invoke({ op: 'ingest', input: { signal } });
    expect(res.ok).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8894/work-signals/ingest');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
  });

  it('triggers the github detector at the sync endpoint', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'accepted' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const adapter = new OpsRecorderLoopbackAdapter(bound, authed, silentLog);
    const res = await adapter.invoke({ op: 'sync.github', input: {} });
    expect(res.ok).toBe(true);
    expect((spy.mock.calls[0] as [string])[0]).toBe('http://127.0.0.1:8894/work-signals/sync/github');
  });

  it('lists detected signals', async () => {
    stubFetch(200, [{ id: 'sig-1' }]);
    const adapter = new OpsRecorderLoopbackAdapter(bound, authed, silentLog);
    const res = await adapter.invoke({ op: 'list', input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) expect(Array.isArray(res.value)).toBe(true);
  });

  it('rejects an unknown op truthfully', async () => {
    const adapter = new OpsRecorderLoopbackAdapter(bound, authed, silentLog);
    const res = await adapter.invoke({ op: 'nope', input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unknown_op');
  });
});
