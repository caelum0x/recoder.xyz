/**
 * `CloudSandboxGatewayPort` — the conductor's narrow view of the cloud domain's
 * remote sandbox substrate (Daytona / E2B / SSH host). This is the seam that
 * bridges the local-only conductor to OFF-BOX execution: without it a workspace
 * can only run in local tmux (`tmux_worktree`) or in-process (`in_process`), so
 * every `daytona`/`ssh` launch fails truthfully `available:false` even though the
 * cloud provider adapters exist.
 *
 * The conductor domain MUST NOT import the cloud domain (seam law / monorepo
 * boundary), so it codes to THIS narrow port. Bootstrap constructs a concrete
 * gateway over the cloud module's `provisioner()` (provision/exec/status/destroy,
 * quota-gated + tenant-scoped) and passes it to
 * {@link createCloudSandboxSubstrate}, which reuses the proven
 * `@recoder/substrate` remote substrate (log-file + exit-sentinel mechanics).
 *
 * Degrade-safe law §37: every method is truthful and never throws across the
 * boundary — an absent provider key ⇒ `isEnabled()` false ⇒ the substrate reports
 * `available:false` and the selector degrades to the local substrate; a transient
 * exec fault surfaces as an execution error the substrate treats as "unknown",
 * never a fabricated finished run.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';

/** The result of one in-sandbox command execution (combined output + exit code). */
export interface CloudSandboxExecResult {
  /** Combined command output (stdout with stderr merged by the launcher). */
  readonly output: string;
  /** Process exit code, when the provider can surface it. */
  readonly exitCode?: number;
}

/** Options for one in-sandbox command execution. */
export interface CloudSandboxExecOptions {
  /** Working directory inside the sandbox. */
  readonly cwd?: string;
  /** Per-command timeout in seconds. */
  readonly timeoutSecs?: number;
}

/**
 * The bridge to the cloud sandbox provisioner, bound (at construction, by
 * bootstrap) to the tenant/region context a conductor run executes under.
 */
export interface CloudSandboxGatewayPort {
  /** Which conductor substrate id this gateway backs (`daytona` | `ssh`). */
  readonly substrateId: WorkspaceSubstrate;
  /**
   * Truthful config gate: is the remote path enabled at all (provider key present
   * + sandbox store reachable)? False ⇒ the substrate reports `available:false`.
   */
  isEnabled(): boolean;
  /** Whether the provider is reachable + responsive right now (never throws). */
  isAvailable(): Promise<boolean>;
  /** Provision a bare remote sandbox; returns its external id (throws on failure). */
  provision(): Promise<{ id: string; workDir?: string }>;
  /** Resolve the sandbox's working-directory root. */
  getWorkDir(sandboxId: string): Promise<string>;
  /** Run a command inside the sandbox and capture its output. */
  exec(
    sandboxId: string,
    command: string,
    options?: CloudSandboxExecOptions,
  ): Promise<CloudSandboxExecResult>;
  /** Destroy the sandbox permanently (best-effort, idempotent). */
  destroy(sandboxId: string): Promise<void>;
}
