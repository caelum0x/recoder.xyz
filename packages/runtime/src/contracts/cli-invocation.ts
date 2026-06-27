/**
 * A fully-resolved description of how to launch a CLI child process.
 *
 * Built by `drivers/shared/arg-builder` + `env-builder` + `cwd-resolver` from a
 * `RuntimeTaskInput`. The engine and `process-driver` only consume this immutable shape;
 * they never reach back into TaskSpec/bundle to recompute args.
 */
export type CliInvocation = {
  /** Absolute path to or name of the binary to spawn. */
  command: string;
  /** Ordered, already-escaped argument list. */
  args: readonly string[];
  /** Working directory the child runs in (policy-bounded by cwd-resolver). */
  cwd: string;
  /** Child environment (already secret-redacted + policy-scoped by env-builder). */
  env: Readonly<Record<string, string>>;
  /** Optional data to write to the child's stdin (e.g. renderedPrompt or JSONL command). */
  stdin?: string;
  /** Whether stdin should remain open for streaming (rpc/acp) or be closed after the initial write. */
  keepStdinOpen?: boolean;
};

export function makeCliInvocation(input: CliInvocation): CliInvocation {
  return {
    command: input.command,
    args: [...input.args],
    cwd: input.cwd,
    env: { ...input.env },
    stdin: input.stdin,
    keepStdinOpen: input.keepStdinOpen ?? false,
  };
}
