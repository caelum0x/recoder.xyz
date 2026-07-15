/**
 * `MulticaLoopbackAdapter` — degrade-safe contract + the real squad/assign wire.
 * Scripted supervisor + stubbed fetch (no network).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { MulticaLoopbackAdapter } from './multica-loopback.adapter.js';
import { FakeSupervisor, silentLog, stubFetch } from './test-support.js';
import { up } from '../../types.js';
import type { DaemonAdapterConfig } from './daemon-adapter-base.js';

const enabled: DaemonAdapterConfig = {
  enabled: true,
  externalUrl: null,
  binOverride: null,
  listenAddr: '127.0.0.1:8895',
};

afterEach(() => vi.restoreAllMocks());

describe('MulticaLoopbackAdapter (degrade-safe)', () => {
  it('degrades to {ok:false} when the server is absent', async () => {
    const adapter = new MulticaLoopbackAdapter(new FakeSupervisor(), enabled, silentLog);
    const res = await adapter.invoke({ op: 'squads.list', input: {} });
    expect(res.ok).toBe(false);
  });

  it('is down "disabled" when disabled', async () => {
    const adapter = new MulticaLoopbackAdapter(new FakeSupervisor(), { ...enabled, enabled: false }, silentLog);
    expect((await adapter.health()).reason).toBe('disabled');
  });

  it('validates assign input', async () => {
    const bound = new FakeSupervisor({
      handle: { engineId: 'multica', mode: 'spawned', baseUrl: 'http://127.0.0.1:8895' },
    });
    const adapter = new MulticaLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'assign', input: { title: 'x', assigneeId: 'a', assigneeType: 'nope' as never } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });
});

describe('MulticaLoopbackAdapter (real squad wire)', () => {
  const bound = new FakeSupervisor({
    handle: { engineId: 'multica', mode: 'spawned', baseUrl: 'http://127.0.0.1:8895' },
    health: up('multica', 'daemon'),
  });

  it('lists squads', async () => {
    stubFetch(200, [{ id: 's1', leader_id: 'l1', name: 'core' }]);
    const adapter = new MulticaLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'squads.list', input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value as { squads: unknown[] }).squads.length).toBe(1);
  });

  it('routes an assignment to a squad leader', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'issue-9' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const adapter = new MulticaLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({
      op: 'assign',
      input: { title: 'ship it', assigneeId: 's1', assigneeType: 'squad' },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value as { issueId?: string }).issueId).toBe('issue-9');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8895/api/issues');
    expect(JSON.parse(init.body as string)).toMatchObject({ assignee_type: 'squad', assignee_id: 's1' });
  });
});
