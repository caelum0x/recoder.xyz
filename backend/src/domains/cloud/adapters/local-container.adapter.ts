/**
 * Local-container sandbox adapter — the self-host-tier fallback that runs a
 * sandbox on the user's OWN box (not off-box). It implements the LOCAL
 * {@link SandboxProvider} port over an injectable {@link LocalContainerRuntime}
 * seam (docker / podman / firecracker — wired by bootstrap).
 *
 * Honesty invariant: this adapter NEVER fabricates a running container. When no
 * container runtime is injected, `availability` reports `down` (reason named) and
 * every mutating call returns `Err(SERVICE_UNAVAILABLE)`. Only a real runtime
 * makes it `up`. `config.localEnabled=false` also forces `down`.
 */
import type { Logger } from '../../../shared/logger.js';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type {
  ProviderAvailability,
  ProviderExecInput,
  ProviderExecResult,
  ProviderSandbox,
  ProvisionSpec,
  SandboxProvider,
} from '../ports/sandbox-provider.port.js';

/**
 * The container-runtime seam a local sandbox runs on. Bootstrap injects a real
 * docker/podman-backed impl; absent ⇒ the adapter degrades to truthful `down`.
 * Kept LOCAL (not a frozen cross-domain port) so the self-host path is unblocked
 * without coupling the cloud domain to a container SDK.
 */
export interface LocalContainerRuntime {
  /** Truthful reachability of the local runtime daemon (no throw). */
  ping(): Promise<boolean>;
  /** Launch a container; returns the runtime's container id. */
  run(spec: ProvisionSpec): Promise<{ containerId: string; workspaceUrl?: string | null }>;
  /** Inspect a container's state (`null` when it no longer exists). */
  inspect(containerId: string): Promise<{ running: boolean } | null>;
  /** Remove a container. Idempotent — removing an unknown id succeeds. */
  remove(containerId: string): Promise<void>;
  /** Optional in-container command execution. */
  exec?(containerId: string, input: ProviderExecInput): Promise<ProviderExecResult>;
}

export interface LocalContainerAdapterDeps {
  readonly enabled: boolean;
  readonly logger: Logger;
  /** The real container runtime; absent ⇒ degrade-safe `down`. */
  readonly runtime?: LocalContainerRuntime;
}

/** Build the local-container adapter bound to an optional runtime seam. */
export function createLocalContainerAdapter(deps: LocalContainerAdapterDeps): SandboxProvider {
  const { enabled, logger, runtime } = deps;

  const unavailable = (): AppError =>
    createError(
      ErrorCode.SERVICE_UNAVAILABLE,
      enabled
        ? 'Local container runtime is not wired (no docker/podman seam injected).'
        : 'Local sandbox provider is disabled.',
    );

  async function availability(): Promise<ProviderAvailability> {
    if (!enabled) return { provider: 'local', status: 'down', reason: 'local provider disabled' };
    if (!runtime) return { provider: 'local', status: 'down', reason: 'no local container runtime wired' };
    try {
      const reachable = await runtime.ping();
      return reachable
        ? { provider: 'local', status: 'up' }
        : { provider: 'local', status: 'down', reason: 'local container runtime unreachable' };
    } catch (cause) {
      return {
        provider: 'local',
        status: 'unknown',
        reason: cause instanceof Error ? cause.message : 'runtime ping failed',
      };
    }
  }

  async function provision(spec: ProvisionSpec): Promise<Result<ProviderSandbox, AppError>> {
    if (!enabled || !runtime) return err(unavailable());
    try {
      const { containerId, workspaceUrl } = await runtime.run(spec);
      return ok({ provider: 'local', externalId: containerId, status: 'running', workspaceUrl: workspaceUrl ?? null });
    } catch (cause) {
      logger.warn({ err: cause }, 'local-container.provision failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Local container launch failed.', { cause }));
    }
  }

  async function get(externalId: string): Promise<Result<ProviderSandbox, AppError>> {
    if (!enabled || !runtime) return err(unavailable());
    try {
      const state = await runtime.inspect(externalId);
      if (!state) return err(createError(ErrorCode.NOT_FOUND, 'Local container not found.'));
      return ok({ provider: 'local', externalId, status: state.running ? 'running' : 'stopped' });
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Local container inspect failed.', { cause }));
    }
  }

  async function destroy(externalId: string): Promise<Result<void, AppError>> {
    if (!enabled || !runtime) return err(unavailable());
    try {
      await runtime.remove(externalId); // idempotent
      return ok(undefined);
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Local container remove failed.', { cause }));
    }
  }

  async function exec(input: ProviderExecInput): Promise<Result<ProviderExecResult, AppError>> {
    if (!enabled || !runtime) return err(unavailable());
    if (!runtime.exec) {
      return err(createError(ErrorCode.NOT_IMPLEMENTED, 'Local container runtime does not support exec.'));
    }
    try {
      return ok(await runtime.exec(input.externalId, input));
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Local container exec failed.', { cause }));
    }
  }

  return { id: 'local', availability, provision, get, destroy, exec };
}
