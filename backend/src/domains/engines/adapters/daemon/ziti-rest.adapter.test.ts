/**
 * `ZitiRestAdapter` — degrade-safe contract. Ziti is an external REST controller;
 * with no controller configured the vendored client degrades truthfully, so the
 * adapter reports `down` (health) and `{ ok:false }` (invoke) with NO network IO.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ZitiRestAdapter } from './ziti-rest.adapter.js';
import { __resetZitiForTest } from '../../../../engines/ziti-client.js';
import { silentLog } from './test-support.js';
import type { DaemonAdapterConfig } from './daemon-adapter-base.js';

const enabled: DaemonAdapterConfig = { enabled: true, externalUrl: null, binOverride: null };

beforeEach(() => {
  // Ensure the controller is unconfigured so the client short-circuits (no network).
  delete process.env.ZITI_CONTROLLER_URL;
  delete process.env.ZITI_API_TOKEN;
  delete process.env.ZITI_ADMIN_USERNAME;
  delete process.env.ZITI_ADMIN_PASSWORD;
  __resetZitiForTest();
});

describe('ZitiRestAdapter (degrade-safe)', () => {
  it('has daemon transport and ziti id', () => {
    const adapter = new ZitiRestAdapter(enabled, silentLog);
    expect(adapter.id).toBe('ziti');
    expect(adapter.transport).toBe('daemon');
  });

  it('reports down when the controller is not configured', async () => {
    const adapter = new ZitiRestAdapter(enabled, silentLog);
    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(health.reason).toBeTruthy();
  });

  it('reports down "disabled" when disabled', async () => {
    const adapter = new ZitiRestAdapter({ ...enabled, enabled: false }, silentLog);
    expect((await adapter.health()).reason).toBe('disabled');
  });

  it('invoke identities.list degrades truthfully when unconfigured', async () => {
    const adapter = new ZitiRestAdapter(enabled, silentLog);
    const res = await adapter.invoke({ op: 'identities.list', input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('engine_down');
  });

  it('validates provision input before any call', async () => {
    const adapter = new ZitiRestAdapter(enabled, silentLog);
    const res = await adapter.invoke({ op: 'identity.provision', input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });

  it('rejects an unknown op truthfully', async () => {
    const adapter = new ZitiRestAdapter(enabled, silentLog);
    const res = await adapter.invoke({ op: 'nope', input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unknown_op');
  });

  it('start/stop are no-op and never throw (external controller)', async () => {
    const adapter = new ZitiRestAdapter(enabled, silentLog);
    await expect(adapter.start()).resolves.toBeUndefined();
    await expect(adapter.stop()).resolves.toBeUndefined();
  });
});
