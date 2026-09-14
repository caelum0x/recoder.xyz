/**
 * Recloud provisioning client — creates an ephemeral preview application in
 * Recoder Cloud (our Dokploy fork) for a repo+branch and returns its live host,
 * so the deploy target does not need a pre-provisioned `metadata.recloud`.
 *
 * Calls recloud's tRPC-over-HTTP endpoint (`POST {base}/api/trpc/<proc>`) with
 * `x-api-key` (recloud's `@better-auth/api-key` plugin resolves the session from
 * the key). recloud uses the superjson transformer, so inputs are wrapped as
 * `{ json: <input> }` and results are read from `result.data.json`.
 *
 * NOTE: the procedure names + input shapes below are derived from the recloud
 * source (application/domain routers), not validated against a live instance.
 * Treat as the first real integration pass; confirm against a running recloud.
 */
import type { Logger } from '../../../shared/logger.js';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { probe, type FetchLike } from './http.js';

export interface RecloudClientConfig {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly environmentId: string;
  readonly serverId: string | null;
}

export interface ProvisionRequest {
  readonly repo: string;
  readonly branch: string;
  readonly name: string;
}

export interface ProvisionedApp {
  readonly applicationId: string;
  readonly host: string;
}

async function trpc<T>(
  fetchLike: FetchLike,
  cfg: RecloudClientConfig,
  proc: string,
  input: unknown,
): Promise<Result<T, AppError>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;
  const r = await probe(fetchLike, `${cfg.baseUrl}/api/trpc/${proc}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: input }),
    timeoutMs: 30000,
  });
  if (!r.ok || !r.response) {
    return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `recloud ${proc} failed (${r.status ?? 'no response'}).`));
  }
  try {
    const body = (await r.response.json()) as { result?: { data?: { json?: T } } };
    const data = body.result?.data?.json;
    if (data === undefined) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `recloud ${proc} returned no data.`));
    }
    return ok(data);
  } catch (cause) {
    return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `recloud ${proc} response was unreadable.`, { cause }));
  }
}

/** Provision + deploy a preview app for a repo/branch; returns its live host. */
export async function provisionPreview(
  fetchLike: FetchLike,
  cfg: RecloudClientConfig,
  req: ProvisionRequest,
  logger: Logger,
): Promise<Result<ProvisionedApp, AppError>> {
  const created = await trpc<{ applicationId: string; appName: string }>(fetchLike, cfg, 'application.create', {
    name: req.name,
    environmentId: cfg.environmentId,
    serverId: cfg.serverId ?? undefined,
    sourceType: 'git',
  });
  if (!created.ok) return created;
  const { applicationId, appName } = created.value;

  const gitSaved = await trpc(fetchLike, cfg, 'application.saveGitProvider', {
    applicationId,
    customGitUrl: req.repo,
    customGitBranch: req.branch,
    sourceType: 'git',
  });
  if (!gitSaved.ok) return gitSaved;

  const host = await trpc<string>(fetchLike, cfg, 'domain.generateDomain', {
    appName,
    serverId: cfg.serverId ?? undefined,
  });
  if (!host.ok) return host;

  const domainCreated = await trpc(fetchLike, cfg, 'domain.create', {
    applicationId,
    host: host.value,
    port: 3000,
    https: true,
    path: '/',
    domainType: 'application',
    certificateType: 'none',
  });
  if (!domainCreated.ok) return domainCreated;

  const deployed = await trpc(fetchLike, cfg, 'application.deploy', { applicationId });
  if (!deployed.ok) return deployed;

  logger.info({ applicationId, host: host.value }, 'recloud preview provisioned + deploy triggered');
  return ok({ applicationId, host: host.value });
}
