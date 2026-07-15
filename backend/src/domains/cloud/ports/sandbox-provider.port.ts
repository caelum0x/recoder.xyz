/**
 * `SandboxProvider` — the provider-agnostic remote-sandbox contract.
 *
 * FROZEN CONTRACT — Phase 10. The `conductor` domain drives remote worktrees
 * through this port (via the `@recoder/substrate` remote/exec seam); the
 * `sandbox-provisioner.service` selects a concrete adapter (daytona / e2b /
 * local-container) by tenant tier + region + availability. The shape mirrors
 * `@recoder/agent-sandbox`'s `SandboxProvider` — the adapters wrap that SDK — but
 * is re-declared here so no domain compiles against a package transport type.
 *
 * Degrade-safe law: an adapter whose key/binary is absent reports `status:'down'`
 * from {@link SandboxProvider.availability} and returns a failed `Result` from
 * every mutating call — it NEVER throws and never fakes a provisioned sandbox.
 */
import type { Result } from '../../../shared/result.js';
import type { AppError } from '../../../shared/errors.js';
import type { ProviderId, SandboxResources, SandboxStatus } from '../types.js';

/** Truthful provider availability (drives module health + provider selection). */
export interface ProviderAvailability {
  readonly provider: ProviderId;
  readonly status: 'up' | 'down' | 'degraded' | 'unknown';
  /** Why the provider is not `up` (missing key, unreachable endpoint). */
  readonly reason?: string;
}

/** The request to provision a sandbox (quota-clamped before it reaches here). */
export interface ProvisionSpec {
  readonly tenantId: string;
  readonly userId: string;
  readonly runId?: string | null;
  readonly region: string;
  readonly image?: string | null;
  readonly resources: SandboxResources;
  /** Repo/branch the worktree seeds from, when launched by a run. */
  readonly repo?: string | null;
  readonly branch?: string | null;
  readonly env?: Readonly<Record<string, string>>;
  /** TTL seconds — the provisioner sets `expires_at` from this. */
  readonly ttlSeconds?: number | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** The provider's view of a provisioned sandbox (mapped into the `Sandbox` row). */
export interface ProviderSandbox {
  readonly provider: ProviderId;
  readonly externalId: string;
  readonly status: SandboxStatus;
  readonly workspaceUrl?: string | null;
  readonly previewUrl?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A command execution against a live sandbox (conductor exec seam). */
export interface ProviderExecInput {
  readonly externalId: string;
  readonly command: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
}

export interface ProviderExecResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface SandboxProvider {
  readonly id: ProviderId;
  /** Truthful, cheap availability probe (no throw). */
  availability(): Promise<ProviderAvailability>;
  /** Provision a sandbox. Fail-safe: absent key ⇒ `Err(SERVICE_UNAVAILABLE)`. */
  provision(spec: ProvisionSpec): Promise<Result<ProviderSandbox, AppError>>;
  /** Fetch the provider's current view of a sandbox (reconcile source of truth). */
  get(externalId: string): Promise<Result<ProviderSandbox, AppError>>;
  /** Destroy a sandbox. Idempotent — destroying an unknown id succeeds. */
  destroy(externalId: string): Promise<Result<void, AppError>>;
  /** Run a command inside a live sandbox (optional; not all providers exec). */
  exec?(input: ProviderExecInput): Promise<Result<ProviderExecResult, AppError>>;
}
