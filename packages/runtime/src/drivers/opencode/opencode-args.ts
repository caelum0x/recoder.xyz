import type { RuntimePolicy } from '@recoder/agent-runtimes';
import { ArgBuilder } from '../shared/arg-builder';

/**
 * Inputs needed to build the `opencode run` argument list, distilled from the
 * `RunCommand` builder in `ts/opencode/packages/opencode/src/cli/cmd/run.ts`.
 */
export type OpenCodeArgsInput = {
  /** Model in opencode's `provider/model` form (e.g. `anthropic/claude-...`). */
  model?: string;
  /** Primary agent name to run with (`--agent`). */
  agent?: string;
  /** Provider-specific reasoning effort variant (`--variant`). */
  variant?: string;
  /** Session id to continue (`--session`). */
  sessionId?: string;
  /** Continue the last session (`--continue`). */
  continueSession?: boolean;
  /** Working directory override (`--dir`); usually left to the spawned cwd. */
  dir?: string;
  /** Policy that gates network + approval behavior. */
  policy: Pick<RuntimePolicy, 'allowNetwork' | 'approvalMode'>;
};

/**
 * Build deterministic `opencode run` args for a non-interactive, JSON-streamed headless run.
 *
 * Key choices (faithful to opencode's non-interactive path):
 *  - `run` subcommand with `--format json` → one JSON event per line on stdout.
 *  - The prompt is fed via stdin (piped), not as a positional, so arbitrarily long
 *    rendered prompts and special chars are safe. opencode reads `Bun.stdin.text()` when
 *    stdout is non-TTY.
 *  - `--dangerously-skip-permissions` ONLY when policy.approvalMode === 'auto'. In every
 *    other mode the run inherits opencode's default deny-on-question behavior so the
 *    runtime's approval gate stays in control (no silent auto-approve).
 */
export function buildOpenCodeRunArgs(input: OpenCodeArgsInput): string[] {
  return ArgBuilder.create(['run'])
    .add('--format', 'json')
    .addFlagIf(typeof input.model === 'string', '--model', input.model)
    .addFlagIf(typeof input.agent === 'string', '--agent', input.agent)
    .addFlagIf(typeof input.variant === 'string', '--variant', input.variant)
    .addFlagIf(typeof input.sessionId === 'string', '--session', input.sessionId)
    .addIf(input.continueSession === true, '--continue')
    .addFlagIf(typeof input.dir === 'string', '--dir', input.dir)
    .addIf(input.policy.approvalMode === 'auto', '--dangerously-skip-permissions')
    .build();
}
