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
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { DeploymentRepository, PreviewTokenRepository } from '../ports/cloud-repository.port.js';
import type { DeployInput, DeployTarget, PreviewHealth, PreviewService } from '../ports/deploy-target.port.js';
import type { PreviewUrlSigner } from './preview-url-signer.js';
import type { Deployment, PreviewHealthStatus, SignedPreviewUrl } from '../types.js';

const SERVICE_NAME = 'cloud.preview';

export interface PreviewDeployServiceDeps {
  readonly repo: DeploymentRepository;
  readonly tokens: PreviewTokenRepository;
  readonly target: DeployTarget;
  readonly signer: PreviewUrlSigner;
  readonly logger: Logger;
  readonly now?: () => Date;
}

/** The preview surface plus a truthful health probe for the module rollup. */
export interface PreviewDeployService extends PreviewService {
  health(deploymentId: string, tenantId: string): Promise<Result<PreviewHealth, AppError>>;
  moduleHealth(): Promise<ComponentHealth>;
}

export function createPreviewDeployService(deps: PreviewDeployServiceDeps): PreviewDeployService {
  const { repo, tokens, target, signer, logger } = deps;
  const now = deps.now ?? (() => new Date());

  async function deploy(input: DeployInput): Promise<Result<Deployment, AppError>> {
    if (!repo.isAvailable()) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Deployment store is unavailable.'));
    }
    if (!(await target.available())) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'No preview deploy target is available.'));
    }
    const built = await target.deploy(input);
    if (!built.ok) return built;
    const descriptor = built.value;
    try {
      const persisted = await repo.insert({
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
      return ok(persisted);
    } catch (cause) {
      logger.error({ err: cause }, 'preview deploy persist failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Could not persist the deployment.', { cause }));
    }
  }

  async function status(deploymentId: string, tenantId: string): Promise<Result<Deployment, AppError>> {
    if (!repo.isAvailable()) return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Deployment store is unavailable.'));
    try {
      const row = await repo.getById(deploymentId, tenantId);
      if (!row) return err(createError(ErrorCode.NOT_FOUND, 'Deployment not found.'));
      return ok(row);
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Deployment lookup failed.', { cause }));
    }
  }

  async function getSignedUrl(deploymentId: string, tenantId: string): Promise<Result<SignedPreviewUrl, AppError>> {
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
      logger.warn({ err: cause, deploymentId }, 'preview token ledger write failed');
      // A ledger miss must not hand out an unaudited URL.
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Could not record the preview token.', { cause }));
    }
    return ok(signed.value);
  }

  async function health(deploymentId: string, tenantId: string): Promise<Result<PreviewHealth, AppError>> {
    const loaded = await status(deploymentId, tenantId);
    if (!loaded.ok) return err(loaded.error);
    const result = await target.probe(loaded.value);
    try {
      await repo.updateHealth(deploymentId, result.status, result.checkedAt);
    } catch (cause) {
      logger.warn({ err: cause, deploymentId }, 'preview health persist failed');
    }
    return ok(result);
  }

  async function moduleHealth(): Promise<ComponentHealth> {
    if (!repo.isAvailable()) {
      return unhealthy(SERVICE_NAME, 'Deployment store unavailable — preview denies (fail safe).');
    }
    const targetUp = await target.available();
    if (!signer.isConfigured()) {
      return degraded(SERVICE_NAME, 'Preview URL signing not configured; deploy works, signed URLs unavailable.');
    }
    if (!targetUp) {
      return degraded(SERVICE_NAME, 'No preview deploy target available.');
    }
    return healthy(SERVICE_NAME, { signingConfigured: true, targetKind: target.kind });
  }

  return { deploy, status, getSignedUrl, health, moduleHealth };
}

/** Coerce a truthful health status for detail rollups. */
export function previewHealthStatus(h: PreviewHealth): PreviewHealthStatus {
  return h.status;
}
