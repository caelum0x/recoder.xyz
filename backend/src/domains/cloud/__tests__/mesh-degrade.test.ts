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
