/**
 * Mesh diagnostics degrade-safety tests. The mesh is REGISTERED but has NO LIVE
 * DATA PLANE, so its truthful pre-launch posture is: both engines `down` ⇒ the
 * module reports `degraded` (never `down`, never a faked `up`), never throws,
 * and always names the failing source. Proves the ARCHITECTURE §10.1 /§37
 * degrade contract that keeps the mesh from failing the whole cloud module.
 */
import { describe, it, expect } from 'vitest';
import { createMeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import { createZitiMeshAdapter } from '../adapters/ziti-mesh.adapter.js';
import { createXdsEnvoyAdapter } from '../adapters/xds-envoy.adapter.js';
import type { FetchLike } from '../adapters/http.js';
import type { Logger } from '../../../shared/logger.js';

const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Logger;

function service(zitiEndpoint: string | null, xdsEndpoint: string | null) {
  const ziti = createZitiMeshAdapter({ endpoint: zitiEndpoint, logger: silentLogger, fetchLike: null });
  const xds = createXdsEnvoyAdapter({ endpoint: xdsEndpoint, logger: silentLogger, fetchLike: null });
  return createMeshDiagnosticsService({ ziti, xds, logger: silentLogger });
}

describe('mesh diagnostics degrade-safety', () => {
  it('reports degraded (not down) when both engines are unconfigured', async () => {
    const health = await service(null, null).moduleHealth();
    expect(health.status).toBe('degraded');
    expect(health.degraded).toBe(true);
    expect(health.reason).toBeTruthy();
  });

  it('names both failing mesh engines in the snapshot', async () => {
    const snapshot = await service(null, null).status();
    expect(snapshot.status).toBe('down');
    const engines = snapshot.engines.map((e) => e.engine).sort();
    expect(engines).toEqual(['xds', 'ziti']);
    for (const e of snapshot.engines) {
      expect(e.status).toBe('down');
      expect(e.reason).toContain('not configured');
    }
  });

  it('returns empty identities/clusters without a live data plane', async () => {
    const svc = service(null, null);
    expect(await svc.zitiIdentities()).toEqual([]);
    expect(await svc.xdsClusters()).toEqual([]);
  });

  it('never throws and stamps a checkedAt timestamp', async () => {
    const snapshot = await service(null, null).status();
    expect(() => new Date(snapshot.checkedAt).toISOString()).not.toThrow();
    expect(snapshot.zitiIdentities).toEqual([]);
    expect(snapshot.xdsClusters).toEqual([]);
  });
});

/** A FetchLike that always answers with the given HTTP status. */
function fetchReturning(status: number): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => '',
    json: async () => ({}),
  });
}

function adapters(fetchLike: FetchLike) {
  return {
    ziti: createZitiMeshAdapter({ endpoint: 'http://127.0.0.1:1', logger: silentLogger, fetchLike }),
    xds: createXdsEnvoyAdapter({ endpoint: 'http://127.0.0.1:1', logger: silentLogger, fetchLike }),
  };
}

describe('mesh engine health is status-truthful (only 2xx is up)', () => {
  it('reports up on 200', async () => {
    const { ziti, xds } = adapters(fetchReturning(200));
    expect((await ziti.status()).status).toBe('up');
    expect((await xds.status()).status).toBe('up');
  });

  it('does NOT report up on 404 — a wrong path must not fake success', async () => {
    const { ziti, xds } = adapters(fetchReturning(404));
    const zitiStatus = await ziti.status();
    const xdsStatus = await xds.status();
    expect(zitiStatus.status).toBe('degraded');
    expect(zitiStatus.reason).toContain('unexpected 404');
    expect(zitiStatus.reason).toContain('may not be the ziti engine');
    expect(xdsStatus.status).toBe('degraded');
    expect(xdsStatus.reason).toContain('unexpected 404');
    expect(xdsStatus.reason).toContain('may not be the xds engine');
  });

  it('does NOT report up on 401', async () => {
    const { ziti, xds } = adapters(fetchReturning(401));
    expect((await ziti.status()).status).toBe('degraded');
    expect((await xds.status()).status).toBe('degraded');
  });

  it('reports degraded with the status named on 503', async () => {
    const { ziti, xds } = adapters(fetchReturning(503));
    const zitiStatus = await ziti.status();
    const xdsStatus = await xds.status();
    expect(zitiStatus.status).toBe('degraded');
    expect(zitiStatus.reason).toContain('503');
    expect(xdsStatus.status).toBe('degraded');
    expect(xdsStatus.reason).toContain('503');
  });

  it('reports unknown (never up) on connect failure', async () => {
    const failing: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    const { ziti, xds } = adapters(failing);
    const zitiStatus = await ziti.status();
    expect(zitiStatus.status).toBe('unknown');
    expect(zitiStatus.reason).toContain('ECONNREFUSED');
    expect((await xds.status()).status).toBe('unknown');
  });
});
