/**
 * Daytona sandbox adapter — implements the LOCAL {@link SandboxProvider} port
 * (never the `@recoder/agent-sandbox` package transport type, per the frozen
 * seam). It wraps the Daytona workspace REST API behind the injectable
 * {@link FetchLike} transport.
 *
 * Degrade-safe law §37: an absent key ⇒ `availability` reports `down` (reason
 * named) and every mutating call returns `Err(SERVICE_UNAVAILABLE)` — it NEVER
 * throws and NEVER fakes a provisioned sandbox. A network fault resolves to a
 * truthful `Err`, not an exception.
 *
 * REUSE: the later hardening step swaps the raw REST calls for the
 * `@recoder/sandbox-daytona` SDK / `@recoder/daytona-api-client` IN PLACE — the
 * transport seam is the swap point.
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

const DEFAULT_BASE = 'https://app.daytona.io/api';

export interface DaytonaAdapterDeps {
  readonly credential: CloudProviderCredential;
  readonly logger: Logger;
  /** Injectable transport (defaults to the Node global fetch). */
  readonly fetchLike?: FetchLike | null;
}

/** Build the Daytona adapter. Synchronous, no daemon — pure config + transport. */
export function createDaytonaAdapter(deps: DaytonaAdapterDeps): SandboxProvider {
  const { credential, logger } = deps;
  const fetchLike = deps.fetchLike !== undefined ? deps.fetchLike : globalFetch();
  const baseUrl = (credential.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');

  const unavailable = (): AppError =>
    createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona provider is not configured (missing API key).');

  function authHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${credential.apiKey ?? ''}`,
      'content-type': 'application/json',
    };
  }

  async function availability(): Promise<ProviderAvailability> {
    if (!credential.present) {
      return { provider: 'daytona', status: 'down', reason: 'DAYTONA_API_KEY not configured' };
    }
    if (!fetchLike) {
      return { provider: 'daytona', status: 'degraded', reason: 'no HTTP transport available' };
    }
    // Cheap reachability probe; never throws.
    const r = await probe(fetchLike, `${baseUrl}/health`, { headers: authHeaders(), timeoutMs: 3000 });
    if (r.status === null) return { provider: 'daytona', status: 'unknown', reason: r.reason };
    return r.ok || r.status < 500
      ? { provider: 'daytona', status: 'up' }
      : { provider: 'daytona', status: 'degraded', reason: `health returned ${r.status}` };
  }

  async function provision(spec: ProvisionSpec): Promise<Result<ProviderSandbox, AppError>> {
    if (!credential.present) return err(unavailable());
    const body = JSON.stringify({
      image: spec.image ?? undefined,
      target: spec.region,
      cpu: spec.resources.cpuMillis,
      memory: spec.resources.memMb,
      envVars: spec.env ?? {},
      repository: spec.repo ?? undefined,
      branch: spec.branch ?? undefined,
      metadata: spec.metadata ?? {},
    });
    const r = await probe(fetchLike, `${baseUrl}/workspace`, {
      method: 'POST',
      headers: authHeaders(),
      body,
      timeoutMs: 30000,
    });
    if (!r.ok || !r.response) {
      logger.warn({ status: r.status, reason: r.reason }, 'daytona.provision failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Daytona provision failed (${r.status ?? 'no response'}).`));
    }
    try {
      const data = (await r.response.json()) as Record<string, unknown>;
      const externalId = typeof data.id === 'string' ? data.id : typeof data.workspaceId === 'string' ? data.workspaceId : null;
      if (!externalId) {
        return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona provision returned no workspace id.'));
      }
      return ok({
        provider: 'daytona',
        externalId,
        status: 'running',
        workspaceUrl: typeof data.workspaceUrl === 'string' ? data.workspaceUrl : null,
        previewUrl: typeof data.previewUrl === 'string' ? data.previewUrl : null,
        metadata: {},
      });
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona provision response was unreadable.', { cause }));
    }
  }

  async function get(externalId: string): Promise<Result<ProviderSandbox, AppError>> {
    if (!credential.present) return err(unavailable());
    const r = await probe(fetchLike, `${baseUrl}/workspace/${encodeURIComponent(externalId)}`, {
      headers: authHeaders(),
      timeoutMs: 10000,
    });
    if (r.status === 404) return err(createError(ErrorCode.NOT_FOUND, 'Daytona workspace not found.'));
    if (!r.ok || !r.response) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Daytona get failed (${r.status ?? 'no response'}).`));
    }
    try {
      const data = (await r.response.json()) as Record<string, unknown>;
      const state = typeof data.state === 'string' ? data.state : typeof data.status === 'string' ? data.status : 'running';
      return ok({
        provider: 'daytona',
        externalId,
        status: state === 'stopped' ? 'stopped' : state === 'error' || state === 'failed' ? 'error' : 'running',
        workspaceUrl: typeof data.workspaceUrl === 'string' ? data.workspaceUrl : null,
      });
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona get response was unreadable.', { cause }));
    }
  }

  async function destroy(externalId: string): Promise<Result<void, AppError>> {
    if (!credential.present) return err(unavailable());
    const r = await probe(fetchLike, `${baseUrl}/workspace/${encodeURIComponent(externalId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
      timeoutMs: 15000,
    });
    // Idempotent: destroying an unknown id succeeds.
    if (r.ok || r.status === 404) return ok(undefined);
    if (r.status === null) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Daytona destroy failed: ${r.reason ?? 'unreachable'}.`));
    }
    return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Daytona destroy failed (${r.status}).`));
  }

  async function exec(input: ProviderExecInput): Promise<Result<ProviderExecResult, AppError>> {
    if (!credential.present) return err(unavailable());
    const r = await probe(fetchLike, `${baseUrl}/workspace/${encodeURIComponent(input.externalId)}/exec`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ command: input.command, cwd: input.cwd, env: input.env ?? {} }),
      timeoutMs: input.timeoutMs ?? 60000,
    });
    if (!r.ok || !r.response) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, `Daytona exec failed (${r.status ?? 'no response'}).`));
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
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona exec response was unreadable.', { cause }));
    }
  }

  return { id: 'daytona', availability, provision, get, destroy, exec };
}
