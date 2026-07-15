/**
 * E2B sandbox adapter — implements the LOCAL {@link SandboxProvider} port over
 * the E2B REST API behind the injectable {@link FetchLike} transport.
 *
 * Degrade-safe law §37: absent key ⇒ `availability` reports `down` and every
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

const DEFAULT_BASE = 'https://api.e2b.dev';

export interface E2bAdapterDeps {
  readonly credential: CloudProviderCredential;
  readonly logger: Logger;
  readonly fetchLike?: FetchLike | null;
}

/** Build the E2B adapter. Synchronous — pure config + transport. */
export function createE2bAdapter(deps: E2bAdapterDeps): SandboxProvider {
  const { credential, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const baseUrl = (credential.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');

  const unavailable = (): AppError =>
    createError(ErrorCode.SERVICE_UNAVAILABLE, 'E2B provider is not configured (missing API key).');

  function authHeaders(): Record<string, string> {
    return { 'x-api-key': credential.apiKey ?? '', 'content-type': 'application/json' };
  }

  async function availability(): Promise<ProviderAvailability> {
    if (!credential.present) return { provider: 'e2b', status: 'down', reason: 'E2B_API_KEY not configured' };
    if (!fetchLike) return { provider: 'e2b', status: 'degraded', reason: 'no HTTP transport available' };
    const r = await probe(fetchLike, `${baseUrl}/health`, { headers: authHeaders(), timeoutMs: 3000 });
    if (r.status === null) return { provider: 'e2b', status: 'unknown', reason: r.reason };
    return r.ok || r.status < 500
      ? { provider: 'e2b', status: 'up' }
      : { provider: 'e2b', status: 'degraded', reason: `health returned ${r.status}` };
  }

  async function provision(spec: ProvisionSpec): Promise<Result<ProviderSandbox, AppError>> {
    if (!credential.present) return err(unavailable());
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
      logger.warn({ status: r.status, reason: r.reason }, 'e2b.provision failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `E2B provision failed (${r.status ?? 'no response'}).`));
    }
    try {
      const data = (await r.response.json()) as Record<string, unknown>;
      const externalId = typeof data.sandboxID === 'string' ? data.sandboxID : typeof data.sandboxId === 'string' ? data.sandboxId : null;
      if (!externalId) return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'E2B provision returned no sandbox id.'));
      return ok({
        provider: 'e2b',
        externalId,
        status: 'running',
        workspaceUrl: typeof data.url === 'string' ? data.url : null,
      });
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'E2B provision response was unreadable.', { cause }));
    }
  }

  async function get(externalId: string): Promise<Result<ProviderSandbox, AppError>> {
    if (!credential.present) return err(unavailable());
    const r = await probe(fetchLike, `${baseUrl}/sandboxes/${encodeURIComponent(externalId)}`, {
      headers: authHeaders(),
      timeoutMs: 10000,
    });
    if (r.status === 404) return err(createError(ErrorCode.NOT_FOUND, 'E2B sandbox not found.'));
    if (!r.ok || !r.response) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `E2B get failed (${r.status ?? 'no response'}).`));
    }
    try {
      const data = (await r.response.json()) as Record<string, unknown>;
      const state = typeof data.state === 'string' ? data.state : 'running';
      return ok({
        provider: 'e2b',
        externalId,
        status: state === 'stopped' || state === 'paused' ? 'stopped' : state === 'error' ? 'error' : 'running',
      });
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'E2B get response was unreadable.', { cause }));
    }
  }

  async function destroy(externalId: string): Promise<Result<void, AppError>> {
    if (!credential.present) return err(unavailable());
    const r = await probe(fetchLike, `${baseUrl}/sandboxes/${encodeURIComponent(externalId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
      timeoutMs: 15000,
    });
    if (r.ok || r.status === 404) return ok(undefined);
    if (r.status === null) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `E2B destroy failed: ${r.reason ?? 'unreachable'}.`));
    }
    return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `E2B destroy failed (${r.status}).`));
  }

  async function exec(input: ProviderExecInput): Promise<Result<ProviderExecResult, AppError>> {
    if (!credential.present) return err(unavailable());
    const r = await probe(fetchLike, `${baseUrl}/sandboxes/${encodeURIComponent(input.externalId)}/exec`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ cmd: input.command, cwd: input.cwd, envs: input.env ?? {} }),
      timeoutMs: input.timeoutMs ?? 60000,
    });
    if (!r.ok || !r.response) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `E2B exec failed (${r.status ?? 'no response'}).`));
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
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'E2B exec response was unreadable.', { cause }));
    }
  }

  return { id: 'e2b', availability, provision, get, destroy, exec };
}
