/**
 * `PreviewDeployService` — the domain-facing {@link PreviewService}: it composes
 * a {@link DeployTarget} (push + REAL health probe) with the durable deployment
 * projection, the signed-URL signer, and the token ledger.
 *
 * Invariants:
 *  - a deploy PERSISTS the deployment row (state-of-record) — a target that
 *    returns a live-looking descriptor is not authoritative until persisted;
 *  - `getSignedUrl` mints an HMAC-expiring URL and records only `sha256(token)`
 *    (never the raw token) into `cloud_preview_tokens` for revocation + audit;
 *  - `health` runs a REAL probe and persists the truthful outcome — a bare 200 is
 *    never taken as "healthy" without the actual status flowing through.
 *
 * Fail-safe law §37: repo down / target unavailable / signing unconfigured all
 * resolve to a truthful `Err(SERVICE_UNAVAILABLE)`; nothing is faked `live`.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type { ComponentHealth } from '../../../shared/health-types.js';
import { degraded, healthy, unhealthy } from '../../../shared/health-types.js';
import {
  createError,
  ErrorCode,
  type AppError,
} from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type {
  DeploymentRepository,
  MeshRepository,
  PreviewTokenRepository,
} from '../ports/cloud-repository.port.js';
import type {
  DeployInput,
  DeployTarget,
  PreviewHealth,
  PreviewService,
} from '../ports/deploy-target.port.js';
import type { PreviewUrlSigner } from './preview-url-signer.js';
import type { MeshFabricService } from './mesh-fabric.service.js';
import { previewEdgeTarget } from './mesh-fabric.service.js';
import type {
  Deployment,
  MeshEndpoint,
  PreviewHealthStatus,
  SignedPreviewUrl,
  Tenant,
} from '../types.js';
import type { ZitiService } from '../ports/mesh.port.js';

const SERVICE_NAME = 'cloud.preview';

/** The read side the preview overlay resolver reads (ziti service registrations). */
export interface PreviewOverlayReader {
  zitiServices(): Promise<readonly ZitiService[]>;
}

export interface PreviewDeployServiceDeps {
  readonly repo: DeploymentRepository;
  readonly tokens: PreviewTokenRepository;
  readonly target: DeployTarget;
  readonly signer: PreviewUrlSigner;
  readonly logger: Logger;
  readonly now?: () => Date;
  /**
   * The GOVERNED mesh-fabric write seam. When present, a SUCCESSFUL deploy
   * registers the `cloud_mesh_endpoints` edge AND bumps the recoder-xds snapshot
   * so Envoy fronts the preview. The tenant is resolved via {@link tenantOf}.
   * Best-effort + degrade-truthful: a mesh miss NEVER fails the deploy.
   */
  readonly meshFabric?: Pick<MeshFabricService, 'registerPreviewEdge'>;
  /** The durable mesh registry (read for `resolvePreviewOverlay`; absent ⇒ null). */
  readonly mesh?: MeshRepository;
  /** The ziti overlay read side (matches the preview edge to its ziti service). */
  readonly overlay?: PreviewOverlayReader;
  /** Resolve the owning tenant for a deployment's tenantId (for the governed mesh write). */
  readonly tenantOf?: (tenantId: string) => Promise<Tenant | null>;
}

/**
 * The "preview over overlay" resolution: the deployment plus how it is fronted on
 * the mesh — its durable endpoint registration + the matched ziti service (the
 * overlay policy object a client dials). Truthful nulls when the mesh is absent.
 */
export interface PreviewOverlayResolution {
  readonly deployment: Deployment;
  readonly meshEndpoint: MeshEndpoint | null;
  readonly zitiService: ZitiService | null;
  readonly cluster: string | null;
}

/** The preview surface plus a truthful health probe for the module rollup. */
export interface PreviewDeployService extends PreviewService {
  health(
    deploymentId: string,
    tenantId: string
  ): Promise<Result<PreviewHealth, AppError>>;
  moduleHealth(): Promise<ComponentHealth>;
  /**
   * Resolve a preview to its mesh/overlay fronting (preview-over-overlay). The
   * deployment must be tenant-owned; the mesh endpoint + matched ziti service are
   * truthfully `null` when the mesh is absent. Never fabricates a registration.
   */
  resolvePreviewOverlay(
    deploymentId: string,
    tenantId: string
  ): Promise<Result<PreviewOverlayResolution, AppError>>;
}

export function createPreviewDeployService(
  deps: PreviewDeployServiceDeps
): PreviewDeployService {
  const {
    repo,
    tokens,
    target,
    signer,
    logger,
    meshFabric,
    mesh,
    overlay,
    tenantOf,
  } = deps;
  const now = deps.now ?? (() => new Date());

  async function deploy(
    input: DeployInput
  ): Promise<Result<Deployment, AppError>> {
    if (!repo.isAvailable()) {
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Deployment store is unavailable.'
        )
      );
    }
    if (!(await target.available())) {
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'No preview deploy target is available.'
        )
      );
    }
    const built = await target.deploy(input);
    if (!built.ok) return built;
    const descriptor = built.value;
    let persisted: Deployment;
    try {
      persisted = await repo.insert({
        id: descriptor.id,
        tenantId: input.tenantId,
        sandboxId: input.sandboxId ?? null,
        runId: input.runId ?? null,
        target: input.target,
        status: descriptor.status,
        commitSha: input.commitSha ?? null,
        previewBaseUrl: descriptor.previewBaseUrl ?? null,
        expiresAt: descriptor.expiresAt ?? null,
      });
    } catch (cause) {
      logger.error({ err: cause }, 'preview deploy persist failed');
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Could not persist the deployment.',
          { cause }
        )
      );
    }

    // FUSE the preview onto the mesh: register the edge + bump the xds snapshot so
    // Envoy fronts it. Best-effort + degrade-truthful — a mesh miss never fails
    // the deploy; the deployment is already durable.
    await frontOnMesh(persisted);

    return ok(persisted);
  }

  /**
   * Register the preview edge on the mesh + bump the xDS snapshot (Envoy fronts
   * it). Degrade-truthful: no mesh-fabric wired, no derivable upstream target, or
   * an unresolvable tenant is a silent skip. Never throws.
   */
  async function frontOnMesh(deployment: Deployment): Promise<void> {
    if (!meshFabric || !tenantOf) return;
    const edge = previewEdgeTarget(deployment.previewBaseUrl);
    if (!edge) {
      logger.debug(
        { deploymentId: deployment.id },
        'preview mesh edge skipped: no derivable upstream target'
      );
      return;
    }
    try {
      const tenant = await tenantOf(deployment.tenantId);
      if (!tenant) {
        logger.debug(
          { deploymentId: deployment.id, tenantId: deployment.tenantId },
          'preview mesh edge skipped: tenant not resolvable'
        );
        return;
      }
      const outcome = await meshFabric.registerPreviewEdge(
        tenant,
        deployment,
        edge
      );
      if (outcome.fronted) {
        logger.info(
          {
            deploymentId: deployment.id,
            cluster: outcome.cluster,
            snapshotVersion: outcome.version,
          },
          'preview fronted on xds mesh'
        );
      } else {
        logger.debug(
          {
            deploymentId: deployment.id,
            reason: outcome.reason,
            degraded: outcome.degraded,
          },
          'preview mesh edge skipped'
        );
      }
    } catch (cause) {
      logger.warn(
        { err: cause, deploymentId: deployment.id },
        'preview mesh edge errored (non-blocking)'
      );
    }
  }

  async function status(
    deploymentId: string,
    tenantId: string
  ): Promise<Result<Deployment, AppError>> {
    if (!repo.isAvailable())
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Deployment store is unavailable.'
        )
      );
    try {
      const row = await repo.getById(deploymentId, tenantId);
      if (!row)
        return err(createError(ErrorCode.NOT_FOUND, 'Deployment not found.'));
      return ok(row);
    } catch (cause) {
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Deployment lookup failed.',
          { cause }
        )
      );
    }
  }

  async function getSignedUrl(
    deploymentId: string,
    tenantId: string
  ): Promise<Result<SignedPreviewUrl, AppError>> {
    const loaded = await status(deploymentId, tenantId);
    if (!loaded.ok) return err(loaded.error);
    const signed = signer.sign(deploymentId, tenantId);
    if (!signed.ok) return signed;
    // Ledger the issued token by hash (audit + revocation); never the raw token.
    try {
      await tokens.insert({
        id: randomUUID(),
        deploymentId,
        tokenHash: signer.hashToken(signed.value.token),
        exp: new Date(signed.value.claims.exp * 1000).toISOString(),
      });
    } catch (cause) {
      logger.warn(
        { err: cause, deploymentId },
        'preview token ledger write failed'
      );
      // A ledger miss must not hand out an unaudited URL.
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Could not record the preview token.',
          { cause }
        )
      );
    }
    return ok(signed.value);
  }

  async function health(
    deploymentId: string,
    tenantId: string
  ): Promise<Result<PreviewHealth, AppError>> {
    const loaded = await status(deploymentId, tenantId);
    if (!loaded.ok) return err(loaded.error);
    const result = await target.probe(loaded.value);
    try {
      await repo.updateHealth(deploymentId, result.status, result.checkedAt);
    } catch (cause) {
      logger.warn(
        { err: cause, deploymentId },
        'preview health persist failed'
      );
    }
    return ok(result);
  }

  async function resolvePreviewOverlay(
    deploymentId: string,
    tenantId: string
  ): Promise<Result<PreviewOverlayResolution, AppError>> {
    const loaded = await status(deploymentId, tenantId);
    if (!loaded.ok) return err(loaded.error);
    const deployment = loaded.value;
    const cluster = `preview-${deployment.id}`;

    // Resolve the durable edge registration (tenant-scoped), truthful null-safe.
    let meshEndpoint: MeshEndpoint | null = null;
    if (mesh?.isAvailable()) {
      try {
        const endpoints = await mesh.listByTenant(tenantId);
        meshEndpoint = endpoints.find(e => e.id === deployment.id) ?? null;
      } catch (cause) {
        logger.warn(
          { err: cause, deploymentId },
          'preview overlay mesh lookup failed'
        );
      }
    }

    // Match the ziti service registration backing the edge (preview-over-overlay).
    let zitiService: ZitiService | null = null;
    if (overlay) {
      const wanted = meshEndpoint?.service ?? cluster;
      try {
        const services = await overlay.zitiServices();
        zitiService = services.find(s => s.name === wanted) ?? null;
      } catch (cause) {
        logger.warn(
          { err: cause, deploymentId },
          'preview overlay ziti service lookup failed'
        );
      }
    }

    return ok({
      deployment,
      meshEndpoint,
      zitiService,
      cluster: meshEndpoint?.xdsCluster ?? (meshEndpoint ? cluster : null),
    });
  }

  async function moduleHealth(): Promise<ComponentHealth> {
    if (!repo.isAvailable()) {
      return unhealthy(
        SERVICE_NAME,
        'Deployment store unavailable — preview denies (fail safe).'
      );
    }
    const targetUp = await target.available();
    if (!signer.isConfigured()) {
      return degraded(
        SERVICE_NAME,
        'Preview URL signing not configured; deploy works, signed URLs unavailable.'
      );
    }
    if (!targetUp) {
      return degraded(SERVICE_NAME, 'No preview deploy target available.');
    }
    return healthy(SERVICE_NAME, {
      signingConfigured: true,
      targetKind: target.kind,
    });
  }

  return {
    deploy,
    status,
    getSignedUrl,
    health,
    moduleHealth,
    resolvePreviewOverlay,
  };
}

/** Coerce a truthful health status for detail rollups. */
export function previewHealthStatus(h: PreviewHealth): PreviewHealthStatus {
  return h.status;
}
