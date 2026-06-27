/**
 * ExecResult — the normalized shape of a child-process invocation.
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  /** Process exit code (0 on success; null if terminated by signal). */
  code: number | null;
}

export interface ExecOptions {
  /** Working directory for the command. */
  cwd?: string;
  /** Environment overlay (merged onto process.env by the caller). */
  env?: Record<string, string>;
  /** Max stdout/stderr buffer (defaults applied in exec-file.ts). */
  maxBuffer?: number;
  /** Timeout in milliseconds before the process is killed. */
  timeoutMs?: number;
}
