/**
 * `TmuxAdapter` — the `EngineClientPort` over the PINNED tmux binary that is the
 * Conductor's session substrate (docs/RECODER-PRODUCT-ARCHITECTURE.md §8c: tmux is
 * a vendored C binary we own by vendoring + pinning + driving). It REUSES
 * `conductor/tmux-path.ts` (`TMUX_BIN` / `TMUX_IS_VENDORED`) so the seam drives the
 * SAME tmux server the conductor's headless `recoder-*` sessions live in — one
 * tmux server, one binary.
 *
 * `invoke` maps ops onto real tmux CLI verbs (`list-sessions`, `list-windows`,
 * `capture-pane`, `send-keys`, `new-session`, `kill-session`) through the bounded
 * `runCli` primitive. This is the raw multiplexer transport the seam owns
 * (conflict #8); the conductor consumes it as a typed client.
 *
 * DEGRADE-SAFE LAW: tmux not resolvable / not runnable ⇒ `health()` is a truthful
 * `down` and every `invoke` returns `{ ok:false, reason }`. Never fabricates
 * session output.
 */
import { TMUX_BIN, TMUX_IS_VENDORED } from '../../tmux-path.js';
import type { Logger } from '../../../../shared/logger.js';
import type { EnginesConfig } from '../../config.js';
import { isEngineEnabled } from '../../config.js';
import { EngineClientBase } from '../../ports/engine-client.port.js';
import type { EngineCall } from '../../ports/engine-client.port.js';
import { down, fail, ok, up, type EngineHealth, type InvokeResult } from '../../types.js';
import { runCli } from './cli-exec.js';

/** The multiplexer ops the adapter maps onto tmux CLI verbs. */
export type TmuxOp =
  | 'list-sessions'
  | 'list-windows'
  | 'list-panes'
  | 'capture-pane'
  | 'send-keys'
  | 'new-session'
  | 'kill-session'
  | 'raw';

export interface TmuxAdapterDeps {
  readonly config: EnginesConfig;
  readonly log: Logger;
  /** Override the resolved tmux binary (defaults to the pinned `TMUX_BIN`). */
  readonly bin?: string;
}

export class TmuxAdapter extends EngineClientBase<unknown, unknown> {
  private readonly deps: TmuxAdapterDeps;
  private readonly bin: string;

  constructor(deps: TmuxAdapterDeps) {
    super('tmux', 'cli');
    this.deps = deps;
    this.bin = deps.bin ?? TMUX_BIN;
  }

  async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
    if (!isEngineEnabled(this.deps.config, 'tmux')) {
      return fail('tmux engine disabled by config', 'disabled');
    }
    const op = call.op as TmuxOp;
    const input = (call.input ?? {}) as Record<string, unknown>;
    const args = buildArgs(op, input);
    if (!args) return fail(`invalid tmux op '${call.op}' or missing required arg`, 'bad_input');

    const result = await runCli(this.bin, args, { timeoutMs: call.timeoutMs ?? 10_000 });
    if (!result.ok) {
      const reason = /ENOENT|not found/i.test(result.reason ?? '') ? 'tmux is not installed on this host' : result.reason ?? 'tmux failed';
      return fail(reason, 'cli_error');
    }
    // tmux prints newline-delimited records; return raw + a split convenience view.
    const lines = result.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    return ok({ stdout: result.stdout, lines });
  }

  async health(): Promise<EngineHealth> {
    if (!isEngineEnabled(this.deps.config, 'tmux')) {
      return down('tmux', 'cli', 'tmux engine disabled by config');
    }
    const result = await runCli(this.bin, ['-V'], { timeoutMs: 5_000 });
    if (result.ok) {
      return up('tmux', 'cli', {
        bindingPath: this.bin,
        version: `${result.stdout.trim()}${TMUX_IS_VENDORED ? ' (vendored)' : ''}`.slice(0, 60),
      });
    }
    return down('tmux', 'cli', result.reason ?? 'tmux -V did not respond (binary missing?)', { bindingPath: this.bin });
  }
}

/** Translate a tmux op + input into a concrete argv (null → invalid). */
function buildArgs(op: TmuxOp, input: Record<string, unknown>): string[] | null {
  const session = str(input.session);
  const target = str(input.target);
  switch (op) {
    case 'list-sessions':
      return ['list-sessions', '-F', str(input.format) ?? '#{session_name}'];
    case 'list-windows':
      return ['list-windows', ...(session ? ['-t', session] : []), '-F', str(input.format) ?? '#{window_name}'];
    case 'list-panes':
      return ['list-panes', ...(target ? ['-t', target] : session ? ['-t', session] : []), '-F', str(input.format) ?? '#{pane_id}'];
    case 'capture-pane': {
      if (!target) return null;
      return ['capture-pane', '-p', '-t', target];
    }
    case 'send-keys': {
      const keys = str(input.keys);
      if (!target || !keys) return null;
      // Send the literal text then an Enter (tmux `send-keys ... Enter`).
      const args = ['send-keys', '-t', target, keys];
      if (input.enter !== false) args.push('Enter');
      return args;
    }
    case 'new-session': {
      if (!session) return null;
      return ['new-session', '-d', '-s', session, ...(str(input.cwd) ? ['-c', str(input.cwd) as string] : [])];
    }
    case 'kill-session': {
      if (!session) return null;
      return ['kill-session', '-t', session];
    }
    case 'raw': {
      const raw = Array.isArray(input.args) ? input.args.filter((a): a is string => typeof a === 'string') : null;
      return raw && raw.length > 0 ? raw : null;
    }
    default:
      return null;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
