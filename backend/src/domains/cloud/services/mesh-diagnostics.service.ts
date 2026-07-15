/**
 * `MeshDiagnosticsService` — the READ-ONLY {@link MeshDiagnostics} implementation
 * that merges the ziti overlay + xDS control-plane adapters into one truthful
 * {@link MeshSnapshot}. Consumed by `observability` (mesh health) and the
 * frontend cloud surface.
 *
 * Never throws (every adapter call is guarded). The merged status is the honest
 * rollup: both engines up ⇒ `up`; any down ⇒ `down`/`degraded` with the failing
 * source named; unknown when a probe could not conclude. This is the observe
 * side of a registered-but-no-live-data-plane mesh — it reports registrations +
 * health, never traffic.
 */
import type { Logger } from '../../../shared/logger.js';
import type { ComponentHealth } from '../../../shared/health-types.js';
import { degraded, healthy } from '../../../shared/health-types.js';
import type {
  MeshDiagnostics,
  MeshEngineStatus,
  MeshSnapshot,
  XdsCluster,
  ZitiIdentity,
} from '../ports/mesh.port.js';
import type { HealthStatus } from '../../../shared/health-types.js';
import type { ZitiMeshAdapter } from '../adapters/ziti-mesh.adapter.js';
import type { XdsEnvoyAdapter } from '../adapters/xds-envoy.adapter.js';

const SERVICE_NAME = 'cloud.mesh';

export interface MeshDiagnosticsDeps {
  readonly ziti: ZitiMeshAdapter;
  readonly xds: XdsEnvoyAdapter;
  readonly logger: Logger;
  readonly now?: () => Date;
}

/** The mesh diagnostics surface + a module-health rollup. */
export interface MeshDiagnosticsService extends MeshDiagnostics {
  moduleHealth(): Promise<ComponentHealth>;
}

/** Roll two engine statuses into one merged status (deny-biased). */
function mergeStatus(engines: readonly MeshEngineStatus[]): HealthStatus {
  if (engines.every((e) => e.status === 'up')) return 'up';
  if (engines.some((e) => e.status === 'up')) return 'degraded';
  if (engines.every((e) => e.status === 'unknown')) return 'unknown';
  return 'down';
}

export function createMeshDiagnosticsService(deps: MeshDiagnosticsDeps): MeshDiagnosticsService {
  const { ziti, xds, logger } = deps;
  const now = deps.now ?? (() => new Date());

  async function zitiIdentities(): Promise<readonly ZitiIdentity[]> {
    try {
      return await ziti.identities();
    } catch (cause) {
      logger.warn({ err: cause }, 'mesh ziti identities failed');
      return [];
    }
  }

  async function xdsClusters(): Promise<readonly XdsCluster[]> {
    try {
      return await xds.clusters();
    } catch (cause) {
      logger.warn({ err: cause }, 'mesh xds clusters failed');
      return [];
    }
  }

  async function status(): Promise<MeshSnapshot> {
    const [zitiStatus, xdsStatus, identities, clusters] = await Promise.all([
      ziti.status().catch((): MeshEngineStatus => ({ engine: 'ziti', status: 'unknown', reason: 'status probe failed' })),
      xds.status().catch((): MeshEngineStatus => ({ engine: 'xds', status: 'unknown', reason: 'status probe failed' })),
      zitiIdentities(),
      xdsClusters(),
    ]);
    const engines: readonly MeshEngineStatus[] = [zitiStatus, xdsStatus];
    return {
      status: mergeStatus(engines),
      engines,
      zitiIdentities: identities,
      xdsClusters: clusters,
      checkedAt: now().toISOString(),
    };
  }

  async function moduleHealth(): Promise<ComponentHealth> {
    const snapshot = await status();
    const engines = snapshot.engines.map((e) => ({
      name: `mesh:${e.engine}`,
      status: e.status,
      ...(e.reason ? { reason: e.reason } : {}),
    }));
    // The mesh is registered-but-no-live-data-plane: both engines down is the
    // expected pre-launch posture, so it degrades (module still serves) rather
    // than failing the whole cloud module.
    if (snapshot.status === 'up') {
      return healthy(SERVICE_NAME, { identities: snapshot.zitiIdentities.length, clusters: snapshot.xdsClusters.length });
    }
    if (snapshot.status === 'down') {
      return degraded(SERVICE_NAME, 'Mesh engines are down (registered, no live data plane).', engines);
    }
    return degraded(SERVICE_NAME, `Mesh status: ${snapshot.status}.`, engines);
  }

  return { zitiIdentities, xdsClusters, status, moduleHealth };
}
