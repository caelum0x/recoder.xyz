/**
 * Recloud deploy target — deploys previews through **Recoder Cloud** (our Dokploy
 * fork, `telos/upstream/recloud`) instead of the default URL-allocator. Implements
 * the {@link DeployTarget} port (`kind: 'preview'`); selected by the module when
 * `RECLOUD_BASE_URL` is configured.
 *
 * recloud runs deploys asynchronously (the API enqueues an Inngest
 * `deployment/requested` event and Traefik fronts the app on its generated host),
 * so `deploy` returns `building` with the app's preview URL and `probe` reports the
 * REAL observed HTTP status — never a faked `live`.
 *
 * v1 triggers a deploy for an ALREADY-PROVISIONED recloud application, identified
 * via `DeployInput.metadata.recloud = { refreshToken, host }`. Per-preview app
 * provisioning (create app + branch + generate domain via the recloud tRPC API) is
 * the next step; until then, absent hints ⇒ truthful `Err(SERVICE_UNAVAILABLE)`.
 *
 * Degrade-safe law §37: absent base URL or missing hints ⇒ `Err`; a network fault
 * resolves to a truthful `Err`. Never throws, never fakes a deployment.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { CloudConfig } from '../config.js';
import type { DeployInput, DeployTarget, PreviewHealth } from '../ports/deploy-target.port.js';
import type { Deployment, PreviewHealthStatus } from '../types.js';
import { globalFetch, probe, type FetchLike } from './http.js';
import { provisionPreview } from './recloud-provision.js';

export interface RecloudDeployDeps {
  readonly config: CloudConfig;
  readonly logger: Logger;
  readonly fetchLike?: FetchLike | null;
  readonly now?: () => Date;
}

/** The recloud application a deploy targets, carried on `DeployInput.metadata.recloud`. */
interface RecloudDeployHints {
  readonly refreshToken: string;
  readonly host: string;
}

function readHints(metadata: Readonly<Record<string, unknown>> | undefined): RecloudDeployHints | null {
  const raw = (metadata?.recloud ?? null) as Record<string, unknown> | null;
  if (!raw) return null;
  const refreshToken = typeof raw.refreshToken === 'string' ? raw.refreshToken : null;
  const host = typeof raw.host === 'string' ? raw.host : null;
  if (!refreshToken || !host) return null;
  return { refreshToken, host };
}

function readStr(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | null {
  const v = metadata?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Build the recloud deploy target. Synchronous — pure config + transport. */
export function createRecloudDeployTarget(deps: RecloudDeployDeps): DeployTarget {
  const { config, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const now = deps.now ?? (() => new Date());
  const baseUrl = config.recloud.baseUrl ? config.recloud.baseUrl.replace(/\/+$/, '') : null;
  const apiKey = config.recloud.apiKey;

  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) h['x-api-key'] = apiKey;
    return h;
  }

  async function available(): Promise<boolean> {
    return baseUrl !== null;
  }

  async function resolveHost(input: DeployInput): Promise<Result<string, AppError>> {
    const hints = readHints(input.metadata);
    if (hints) {
      // Pre-provisioned app: trigger its deploy webhook (enqueues recloud's Inngest deploy).
      const r = await probe(fetchLike, `${baseUrl}/api/deploy/${encodeURIComponent(hints.refreshToken)}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ commitSha: input.commitSha ?? null, source: input.source ?? null }),
        timeoutMs: 30000,
      });
      if (!r.ok) {
        logger.warn({ status: r.status, reason: r.reason }, 'recloud.deploy webhook failed');
        return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Recloud deploy failed (${r.status ?? 'no response'}).`));
      }
      return ok(hints.host);
    }

    // No pre-provisioned app: provision a fresh preview for this repo/branch.
    if (!config.recloudEnvironmentId) {
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'recloud deploy needs RECLOUD_ENVIRONMENT_ID (to provision) or metadata.recloud { refreshToken, host }.',
        ),
      );
    }
    const repo = input.source ?? readStr(input.metadata, 'repo');
    if (!repo) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'recloud provisioning needs a repo (DeployInput.source).'));
    }
    const branch = readStr(input.metadata, 'branch') ?? 'main';
    const name = `preview-${(input.runId ?? input.tenantId).slice(0, 24)}`;
    const provisioned = await provisionPreview(
      fetchLike,
      { baseUrl: baseUrl as string, apiKey, environmentId: config.recloudEnvironmentId, serverId: config.recloudServerId },
      { repo, branch, name },
      logger,
    );
    if (!provisioned.ok) return provisioned;
    return ok(provisioned.value.host);
  }

  async function deploy(input: DeployInput): Promise<Result<Deployment, AppError>> {
    if (!baseUrl) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Recoder Cloud (recloud) is not configured (missing RECLOUD_BASE_URL).'));
    }
    const host = await resolveHost(input);
    if (!host.ok) return host;
    const id = randomUUID();
    const createdAt = now().toISOString();
    const expiresAt =
      input.ttlSeconds && input.ttlSeconds > 0 ? new Date(now().getTime() + input.ttlSeconds * 1000).toISOString() : null;
    const deployment: Deployment = {
      id,
      tenantId: input.tenantId,
      sandboxId: input.sandboxId ?? null,
      runId: input.runId ?? null,
      target: input.target,
      status: 'building',
      commitSha: input.commitSha ?? null,
      previewBaseUrl: `https://${host.value}`,
      healthStatus: 'unknown',
      lastHealthAt: null,
      createdAt,
      expiresAt,
    };
    logger.info({ deploymentId: id, host: host.value }, 'recloud deploy triggered');
    return ok(deployment);
  }

  async function probeHealth(deployment: Deployment): Promise<PreviewHealth> {
    const checkedAt = now().toISOString();
    if (!deployment.previewBaseUrl) {
      return { deploymentId: deployment.id, status: 'unknown', httpStatus: null, checkedAt, reason: 'no preview URL' };
    }
    const r = await probe(fetchLike, deployment.previewBaseUrl, { timeoutMs: 5000 });
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
