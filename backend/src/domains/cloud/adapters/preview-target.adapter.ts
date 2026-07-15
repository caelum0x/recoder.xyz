/**
 * `PreviewDeployTarget` — the default {@link DeployTarget} backend: it allocates
 * a per-deployment preview URL under the configured base domain and runs a REAL
 * HTTP health probe against it. There is NO faked `live`: `deploy` yields a
 * `building` deployment with its allocated URL, and `probe` reports the ACTUAL
 * observed HTTP status (never inferred from a bare 200 — the real status is
 * carried through). Absent base domain ⇒ `available()` is false and `deploy`
 * returns `Err(SERVICE_UNAVAILABLE)`.
 *
 * REUSE: the transport is the injectable {@link FetchLike}; the later hardening
 * step swaps the URL-allocation for a real preview-runner deploy IN PLACE.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { CloudConfig } from '../config.js';
import type { DeployInput, DeployTarget, PreviewHealth } from '../ports/deploy-target.port.js';
import type { Deployment, PreviewHealthStatus } from '../types.js';
import { globalFetch, probe, type FetchLike } from './http.js';

export interface PreviewTargetDeps {
  readonly config: CloudConfig;
  readonly logger: Logger;
  readonly fetchLike?: FetchLike | null;
  readonly now?: () => Date;
}

/** Build the default preview deploy target. */
export function createPreviewTarget(deps: PreviewTargetDeps): DeployTarget {
  const { config, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const now = deps.now ?? (() => new Date());

  async function available(): Promise<boolean> {
    return config.previewBaseDomain !== null;
  }

  async function deploy(input: DeployInput): Promise<Result<Deployment, AppError>> {
    if (!config.previewBaseDomain) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Preview base domain is not configured.'));
    }
    const id = randomUUID();
    const previewBaseUrl = `https://${id}.${config.previewBaseDomain}`;
    const createdAt = now().toISOString();
    const expiresAt =
      input.ttlSeconds && input.ttlSeconds > 0
        ? new Date(now().getTime() + input.ttlSeconds * 1000).toISOString()
        : null;
    // Honest posture: the artifact is registered as `building`; only a real probe
    // (health()) can confirm the target is actually serving.
    const deployment: Deployment = {
      id,
      tenantId: input.tenantId,
      sandboxId: input.sandboxId ?? null,
      runId: input.runId ?? null,
      target: input.target,
      status: 'building',
      commitSha: input.commitSha ?? null,
      previewBaseUrl,
      healthStatus: 'unknown',
      lastHealthAt: null,
      createdAt,
      expiresAt,
    };
    logger.info({ deploymentId: id, target: input.target }, 'preview target allocated URL');
    return ok(deployment);
  }

  async function probeHealth(deployment: Deployment): Promise<PreviewHealth> {
    const checkedAt = now().toISOString();
    if (!deployment.previewBaseUrl) {
      return { deploymentId: deployment.id, status: 'unknown', httpStatus: null, checkedAt, reason: 'no preview URL' };
    }
    const r = await probe(fetchLike, deployment.previewBaseUrl, { timeoutMs: 5000 });
    // Truthful mapping from the REAL observed status — never inferred.
    let status: PreviewHealthStatus;
    if (r.status === null) status = 'unhealthy';
    else if (r.status >= 200 && r.status < 400) status = 'healthy';
    else status = 'unhealthy';
    return {
      deploymentId: deployment.id,
      status,
      httpStatus: r.status,
      checkedAt,
      ...(r.reason ? { reason: r.reason } : {}),
    };
  }

  return { kind: 'preview', available, deploy, probe: probeHealth };
}
