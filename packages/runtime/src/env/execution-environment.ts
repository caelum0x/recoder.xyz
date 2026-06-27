import type { CliInvocation } from '../contracts/cli-invocation';
import type { SpawnedProcess } from '../drivers/shared/process-driver';

/**
 * Where a CLI actually runs. Decouples *which CLI* (drivers) from *where it runs* (env).
 *
 * The default is `local-environment.ts` (a child process on this host). A
 * `sandbox-environment.ts` (Daytona/E2B) and `git-worktree-env.ts` are wave-staged stubs
 * that delegate to the `SandboxPort` seam and a worktree resolver respectively — they are
 * clearly marked `// TODO(wave)` and throw a truthful `env_unavailable` rather than faking
 * a remote run.
 */
export type ExecResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type ExecStreamChunk = {
  stream: 'stdout' | 'stderr';
  chunk: string;
};

/**
 * The execution-environment port. Process-based drivers `spawn()` an invocation and stream
 * its stdio; the engine owns the rest. `exec()` is a convenience one-shot for evidence /
 * verification commands; `execStream()` streams remote stdio for sandbox/hosted envs.
 */
export interface ExecutionEnvironment {
  /** Stable id of the environment kind: `local | sandbox | hosted`. */
  readonly kind: string;

  /** Spawn a CLI invocation and return the live process + stdio streams. */
  spawn(invocation: CliInvocation): Promise<SpawnedProcess>;

  /** Run a one-shot command, buffering output (used by evidence/verification). */
  exec(input: {
    command: string;
    args: readonly string[];
    cwd: string;
    env?: Readonly<Record<string, string>>;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<ExecResult>;

  /** Stream a one-shot command's stdout/stderr (sandbox/hosted exec). */
  execStream(input: {
    command: string;
    args: readonly string[];
    cwd: string;
    env?: Readonly<Record<string, string>>;
    signal?: AbortSignal;
  }): AsyncIterable<ExecStreamChunk>;

  /** Whether a path exists in the environment (local fs or remote). */
  exists(path: string): Promise<boolean>;

  /** Release any resources held by the environment (sandbox handles, sockets). */
  dispose(): Promise<void>;
}
