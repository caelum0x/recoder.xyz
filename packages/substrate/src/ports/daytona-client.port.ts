/**
 * DaytonaClientPort — the remote-sandbox seam for the `daytona` substrate
 * (design §4.9 / §7).
 *
 * Dependency inversion is what lets `@recoder/substrate` provide a real remote
 * substrate WITHOUT importing `docker-backend`'s `getDaytonaClient()` or the
 * `@recoder/sandbox-daytona` SDK. The backend's
 * `docker-backend/src/conductor/wiring/*` adapter wraps the concrete
 * `DaytonaClient` (or the SDK) onto this minimal interface and passes a
 * `createDaytonaSubstrate({ client, logger })` into `createSubstrateRegistry`.
 *
 * This is the SMALLEST subset the substrate needs — five sandbox operations
 * plus a truthful config gate. Anything richer (snapshots, port previews, file
 * IO) stays in the backend client and is intentionally NOT exposed here, so the
 * package surface stays narrow and the substrate stays SDK-agnostic.
 *
 * Interface only: no behavior, no SDK import. The package's single runtime
 * dependency invariant (`@recoder/agent-os`) is preserved.
 */

/** Result of a single in-sandbox command execution. */
export interface DaytonaExecResult {
  /** Combined command output (stdout; stderr is merged by the launcher). */
  output: string;
  /** Process exit code, when the adapter can surface it. */
  exitCode?: number;
}

/** Options for an in-sandbox command execution. */
export interface DaytonaExecOptions {
  /** Working directory inside the sandbox. */
  cwd?: string;
  /** Per-command timeout in seconds. */
  timeoutSecs?: number;
}

/** Minimal info the substrate needs about a freshly created sandbox. */
export interface DaytonaSandboxRef {
  /** Sandbox id — becomes the substrate handle `ref`/`sandboxId`. */
  id: string;
}

export interface DaytonaClientPort {
  /**
   * Truthful config gate: is the Daytona path enabled at all (creds present /
   * SDK opt-in)? When false the `daytona` substrate reports unavailable and the
   * selector degrades to the local substrate — it NEVER fakes readiness.
   * Replaces the backend's `isDaytonaSdkEnabled()`.
   */
  isEnabled(): boolean;
  /** Whether the Daytona API server is reachable and responsive right now. */
  isAvailable(): Promise<boolean>;
  /** Provision a new remote sandbox. */
  createSandbox(): Promise<DaytonaSandboxRef>;
  /** Resolve the sandbox's working directory root. */
  getWorkDir(sandboxId: string): Promise<string>;
  /** Run a command inside the sandbox and capture its output. */
  execCommand(
    sandboxId: string,
    command: string,
    options?: DaytonaExecOptions,
  ): Promise<DaytonaExecResult>;
  /** Delete the sandbox permanently (best-effort on teardown). */
  deleteSandbox(sandboxId: string): Promise<void>;
}
