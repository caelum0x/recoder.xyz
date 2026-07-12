/**
 * SshExecPort — the durable-SSH transport seam for the `ssh` substrate.
 *
 * Dependency inversion is what lets `@recoder/substrate` provide a remote,
 * SSH-backed substrate WITHOUT opening real sockets in the engine or importing
 * a concrete SSH client. The backend's `docker-backend/src/conductor/wiring/*`
 * adapter provides the concrete transport (a real impl shells
 * `ssh -o BatchMode=yes <host> <command>` over Wave's durable SSH session, which
 * survives reconnects) and passes `createSshSubstrate({ exec, config })` into
 * `createSubstrateRegistry`.
 *
 * This is the SMALLEST subset the substrate needs — a truthful config gate plus
 * one command-execution primitive. All worktree/tmux/git operations the
 * substrate performs are expressed as remote shell commands run through `run`.
 *
 * Interface only: no behavior, no socket, no SDK import. The package's single
 * runtime dependency invariant (`@recoder/agent-os`) is preserved.
 */

/** Result of a single remote command execution over SSH. */
export interface SshExecResult {
  /** Remote stdout (the substrate treats this as the authoritative output). */
  stdout: string;
  /** Remote stderr (surfaced in truthful error messages). */
  stderr: string;
  /**
   * Remote process exit code, when the transport can surface it.
   *   - a number → the remote command's exit status (0 = success).
   *   - `null` → terminated by signal / unknown (never a fabricated 0).
   */
  exitCode: number | null;
}

/** Options for a single remote command execution. */
export interface SshExecOptions {
  /** Working directory on the remote host (transport prepends a `cd`). */
  cwd?: string;
  /** Per-command timeout in seconds. */
  timeoutSecs?: number;
}

export interface SshExecPort {
  /**
   * Truthful config gate: is the SSH transport usable at all (the `ssh` binary
   * is present and a target host is configured)? When false the `ssh` substrate
   * reports unavailable and the selector degrades to the local substrate — it
   * NEVER fakes readiness.
   */
  isConfigured(): boolean;
  /**
   * Run a command on the remote host over the durable SSH session and capture
   * its output + exit code. Rejects only on a genuine transport failure
   * (host unreachable, auth failure); the substrate treats a rejection as a
   * transient/unreachable probe, never as a finished/provisioned workspace.
   */
  run(command: string, options?: SshExecOptions): Promise<SshExecResult>;
}
