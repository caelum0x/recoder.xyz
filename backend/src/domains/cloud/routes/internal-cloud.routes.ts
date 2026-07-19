/**
 * `internal-cloud.routes` — the `/internal/cloud/*` worker-to-backend networking
 * surface (api rule: `INTERNAL_SERVICE_KEY`-gated only). It is the backend's
 * authoritative view of the mesh network config the recoder-xds control plane
 * fronts: the registered `cloud_mesh_endpoints` projected as Envoy upstreams, plus
 * the LIVE served-snapshot version + both mesh engines' health.
 *
 *  - `GET /network-config` — the assembled network-config view. This is the
 *    source the recoder-xds engine's `--config-url` can PULL at boot AND the
 *    observability surface reads to confirm which preview / sandbox edges the
 *    control plane is fronting and at which snapshot version. It is READ-ONLY: the
 *    actual snapshot WRITE happens inside `PreviewDeployService.deploy()` (the
 *    governed `mesh-fabric` push to the engine), not here.
 *
 * Every route sits behind `requireInternal` (constant-time, fail-closed: an unset
 * `INTERNAL_SERVICE_KEY` yields 503, a wrong key 401). Degrade-truthful: an absent
 * mesh registry / xds engine yields an empty-but-well-formed view with a `null`
 * snapshot + a `down` engine — never a fabricated version.
 */
import { Router } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Logger } from '../../../shared/logger.js';
import { asyncHandler, sendSuccess } from '../../../shared/errors.js';
import type { MeshRepository } from '../ports/cloud-repository.port.js';
import type { MeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import type { MeshEndpoint } from '../types.js';

export interface InternalCloudRoutesDeps {
  readonly mesh: MeshRepository;
  readonly meshDiagnostics: MeshDiagnosticsService;
  readonly middleware: AuthMiddleware;
  readonly logger: Logger;
  readonly now?: () => Date;
}

/** Project a mesh endpoint into the Envoy-upstream shape the control plane fronts. */
function toUpstream(e: MeshEndpoint): {
  name: string;
  kind: string;
  status: string;
  xdsCluster: string | null;
  zitiIdentity: string | null;
} {
  return {
    name: e.service,
    kind: typeof e.metadata.kind === 'string' ? e.metadata.kind : 'unknown',
    status: e.status,
    xdsCluster: e.xdsCluster,
    zitiIdentity: e.zitiIdentity,
  };
}

/** Build the internal cloud router (mount at `/internal/cloud`). */
export function buildInternalCloudRouter(
  deps: InternalCloudRoutesDeps
): Router {
  const { mesh, meshDiagnostics, middleware, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const router = Router();

  // Every edge here is worker-to-backend only — gate once, up front.
  router.use(middleware.requireInternal);

  // GET /network-config — the assembled mesh network-config view.
  router.get(
    '/network-config',
    asyncHandler(async (_req, res) => {
      let endpoints: readonly MeshEndpoint[] = [];
      if (mesh.isAvailable()) {
        try {
          endpoints = await mesh.list();
        } catch (cause) {
          logger.warn(
            { err: cause },
            'internal network-config: mesh registry list failed'
          );
        }
      }
      const [snapshot, meshStatus] = await Promise.all([
        meshDiagnostics.xds().snapshot(),
        meshDiagnostics.status(),
      ]);
      sendSuccess(res, {
        upstreams: endpoints.map(toUpstream),
        upstreamCount: endpoints.length,
        // The LIVE served-snapshot version — the governed evidence of what the
        // control plane is actually fronting (`null` when the engine is absent).
        snapshot,
        engines: meshStatus.engines,
        meshStatus: meshStatus.status,
        checkedAt: now().toISOString(),
      });
    })
  );

  return router;
}
