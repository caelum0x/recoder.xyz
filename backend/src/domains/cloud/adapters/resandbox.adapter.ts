/**
 * Resandbox sandbox adapter — the self-hosted **Recoder Sandbox** (our E2B fork,
 * `telos/upstream/resandbox`). Implements the LOCAL {@link SandboxProvider} port
 * over resandbox's E2B-compatible REST API behind the injectable {@link FetchLike}
 * transport.
 *
 * Unlike the hosted {@link createE2bAdapter} (which defaults to `api.e2b.dev`),
 * resandbox is self-hosted: it is "configured" when `credential.baseUrl` points at
 * our control plane. An API key is OPTIONAL (sent as `x-api-key` when present).
 *
 * Degrade-safe law §37: absent base URL ⇒ `availability` reports `down` and every
 * mutating call returns `Err(SERVICE_UNAVAILABLE)`; a network fault resolves to a
 * truthful `Err`. Never throws, never fakes a sandbox.
 */
import type { Logger } from '../../../shared/logger.js';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { CloudProviderCredential } from '../config.js';
import type {
  ProviderAvailability,
  ProviderExecInput,
  ProviderExecResult,
  ProviderSandbox,
  ProvisionSpec,
  SandboxProvider,
} from '../ports/sandbox-provider.port.js';
import { globalFetch, probe, type FetchLike } from './http.js';

export interface ResandboxAdapterDeps {
  readonly credential: CloudProviderCredential;
  readonly logger: Logger;
  readonly fetchLike?: FetchLike | null;
}

/** Build the resandbox adapter. Synchronous — pure config + transport. */
export function createResandboxAdapter(deps: ResandboxAdapterDeps): SandboxProvider {
  const { credential, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  // Self-host: the base URL IS the configuration. No public default.
  const rawBase = credential.baseUrl;
  const baseUrl = rawBase ? rawBase.replace(/\/+$/, '') : null;

  const unconfigured = (): AppError =>
    createError(
      ErrorCode.SERVICE_UNAVAILABLE,
      'Recoder Sandbox (resandbox) is not configured (missing RESANDBOX_BASE_URL).',
    );

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (credential.apiKey) headers['x-api-key'] = credential.apiKey;
    return headers;
  }

  async function availability(): Promise<ProviderAvailability> {
    if (!baseUrl) return { provider: 'resandbox', status: 'down', reason: 'RESANDBOX_BASE_URL not configured' };
    if (!fetchLike) return { provider: 'resandbox', status: 'degraded', reason: 'no HTTP transport available' };
    const r = await probe(fetchLike, `${baseUrl}/health`, { headers: authHeaders(), timeoutMs: 3000 });
    if (r.status === null) return { provider: 'resandbox', status: 'unknown', reason: r.reason };
    return r.ok || r.status < 500
      ? { provider: 'resandbox', status: 'up' }
      : { provider: 'resandbox', status: 'degraded', reason: `health returned ${r.status}` };
  }

  async function provision(spec: ProvisionSpec): Promise<Result<ProviderSandbox, AppError>> {
    if (!baseUrl) return err(unconfigured());
    const body = JSON.stringify({
      templateID: spec.image ?? 'base',
      metadata: { tenantId: spec.tenantId, userId: spec.userId, runId: spec.runId ?? null, ...(spec.metadata ?? {}) },
      envVars: spec.env ?? {},
    });
    const r = await probe(fetchLike, `${baseUrl}/sandboxes`, {
      method: 'POST',
      headers: authHeaders(),
      body,
      timeoutMs: 30000,
    });
    if (!r.ok || !r.response) {
      logger.warn({ status: r.status, reason: r.reason }, 'resandbox.provision failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Resandbox provision failed (${r.status ?? 'no response'}).`));
    }
    try {
      const data = (await r.response.json()) as Record<string, unknown>;
      const externalId =
        typeof data.sandboxID === 'string' ? data.sandboxID : typeof data.sandboxId === 'string' ? data.sandboxId : null;
      if (!externalId) return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Resandbox provision returned no sandbox id.'));
      return ok({
        provider: 'resandbox',
        externalId,
        status: 'running',
        workspaceUrl: typeof data.url === 'string' ? data.url : null,
      });
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Resandbox provision response was unreadable.', { cause }));
    }
  }

  async function get(externalId: string): Promise<Result<ProviderSandbox, AppError>> {
    if (!baseUrl) return err(unconfigured());
    const r = await probe(fetchLike, `${baseUrl}/sandboxes/${encodeURIComponent(externalId)}`, {
      headers: authHeaders(),
      timeoutMs: 10000,
    });
    if (r.status === 404) return err(createError(ErrorCode.NOT_FOUND, 'Resandbox sandbox not found.'));
    if (!r.ok || !r.response) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Resandbox get failed (${r.status ?? 'no response'}).`));
    }
    try {
      const data = (await r.response.json()) as Record<string, unknown>;
      const state = typeof data.state === 'string' ? data.state : 'running';
      return ok({
        provider: 'resandbox',
        externalId,
        status: state === 'stopped' || state === 'paused' ? 'stopped' : state === 'error' ? 'error' : 'running',
      });
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Resandbox get response was unreadable.', { cause }));
    }
  }

  async function destroy(externalId: string): Promise<Result<void, AppError>> {
    if (!baseUrl) return err(unconfigured());
    const r = await probe(fetchLike, `${baseUrl}/sandboxes/${encodeURIComponent(externalId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
      timeoutMs: 15000,
    });
    if (r.ok || r.status === 404) return ok(undefined);
    if (r.status === null) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Resandbox destroy failed: ${r.reason ?? 'unreachable'}.`));
    }
    return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Resandbox destroy failed (${r.status}).`));
  }

  async function exec(input: ProviderExecInput): Promise<Result<ProviderExecResult, AppError>> {
    if (!baseUrl) return err(unconfigured());
    const r = await probe(fetchLike, `${baseUrl}/sandboxes/${encodeURIComponent(input.externalId)}/exec`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ cmd: input.command, cwd: input.cwd, envs: input.env ?? {} }),
      timeoutMs: input.timeoutMs ?? 60000,
    });
    if (!r.ok || !r.response) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Resandbox exec failed (${r.status ?? 'no response'}).`));
    }
    try {
      const data = (await r.response.json()) as Record<string, unknown>;
      return ok({
        exitCode: typeof data.exitCode === 'number' ? data.exitCode : null,
        stdout: typeof data.stdout === 'string' ? data.stdout : '',
        stderr: typeof data.stderr === 'string' ? data.stderr : '',
        timedOut: data.timedOut === true,
      });
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Resandbox exec response was unreadable.', { cause }));
    }
  }

  return { id: 'resandbox', availability, provision, get, destroy, exec };
}
