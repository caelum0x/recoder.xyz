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
  MeshTopology,
  XdsCluster,
  ZitiEnrollment,
  ZitiIdentity,
  ZitiService,
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

/**
 * The mesh diagnostics surface + a module-health rollup + the deeper ziti
 * introspection reads (services / enrollment posture / topology). All read-only
 * and degrade-safe (never throw). The ziti enrollment WRITE is NOT here — it is a
 * governed mutation exposed only through the mesh MCP write tool + the gate.
 */
export interface MeshDiagnosticsService extends MeshDiagnostics {
  moduleHealth(): Promise<ComponentHealth>;
  /** Registered ziti services (empty when the overlay is absent). */
  zitiServices(): Promise<readonly ZitiService[]>;
  /** Enrollment posture per ziti identity/endpoint (empty when absent). */
  zitiEnrollments(): Promise<readonly ZitiEnrollment[]>;
  /** The read-only ziti topology/health snapshot (engine + registrations). */
  meshTopology(): Promise<MeshTopology>;
  /**
   * The READ-ONLY xDS introspection adapter (clusters/routes/listeners/endpoints
   * + served-snapshot version). Exposed so the cloud xDS MCP tools can read the
   * live control-plane config without re-plumbing the endpoint. Degrade-safe:
   * absent engine ⇒ empty results / `down` status, never a throw.
   */
  xds(): XdsEnvoyAdapter;
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

  async function zitiServices(): Promise<readonly ZitiService[]> {
    try {
      return await ziti.services();
    } catch (cause) {
      logger.warn({ err: cause }, 'mesh ziti services failed');
      return [];
    }
  }

  async function zitiEnrollments(): Promise<readonly ZitiEnrollment[]> {
    try {
      return await ziti.enrollments();
    } catch (cause) {
      logger.warn({ err: cause }, 'mesh ziti enrollments failed');
      return [];
    }
  }

  async function meshTopology(): Promise<MeshTopology> {
    try {
      return await ziti.topology();
    } catch (cause) {
      logger.warn({ err: cause }, 'mesh ziti topology failed');
      return {
        engine: { engine: 'ziti', status: 'unknown', reason: 'topology probe failed' },
        identities: [],
        services: [],
        enrollments: [],
        checkedAt: now().toISOString(),
      };
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

  return { zitiIdentities, xdsClusters, status, moduleHealth, zitiServices, zitiEnrollments, meshTopology, xds: () => xds };
}
