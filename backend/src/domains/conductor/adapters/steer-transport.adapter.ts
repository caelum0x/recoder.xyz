/**
 * `createTmuxSteerTransport` — the tmux-backed {@link SteerTransportPort}: live
 * send-keys into the workspace's tmux session (the same session addressing the
 * `tmux_worktree` substrate launches with, `handle.sessionName`).
 *
 * Config-injected like every conductor adapter: `tmuxBin` comes from the
 * {@link ConductorConfig} slice and the child-process seam is injectable (`exec`,
 * default `execFileSafe`) so the transport is unit-testable with no real tmux.
 *
 * Truthful delivery, never faked:
 *  - the session is probed (`has-session`) BEFORE any keys are sent — a gone
 *    session throws (the composer surfaces `ok:false`), no keys are dropped
 *    silently into the void;
 *  - the steer text is sent LITERALLY (`send-keys -l --`) so user text is never
 *    interpreted as tmux key names (and a leading `-` never becomes a flag);
 *  - `submit` appends a separate `Enter` key event so the agent CLI submits.
 */
import { execFileSafe, type LoggerPort } from '@recoder/substrate';
import type { SteerKeysInput, SteerTransportPort } from '../ports/steer-transport.port.js';
import type { ConductorConfig } from '../config.js';
import type { ExecFn } from './tmux-substrate.adapter.js';

/** A no-op logger so the transport works even when none is injected. */
const NOOP_LOGGER: LoggerPort = {
  info() {},
  warn() {},
  error() {},
};

export interface CreateTmuxSteerTransportDeps {
  /** The injected conductor config slice (`tmuxBin`). */
  readonly config: Pick<ConductorConfig, 'tmuxBin'>;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
  /** Child-process seam; defaults to the package's `execFileSafe`. */
  readonly exec?: ExecFn;
}

/**
 * Build the tmux send-keys transport over the injected config + child-process
 * seam. Bootstrap passes it as `ConductorModuleDeps.steerTransport`.
 */
export function createTmuxSteerTransport(deps: CreateTmuxSteerTransportDeps): SteerTransportPort {
  const exec: ExecFn = deps.exec ?? execFileSafe;
  const logger = deps.logger ?? NOOP_LOGGER;
  // `null` config ⇒ resolve the system-PATH `tmux`; a pinned/vendored absolute
  // path wins when bootstrap injected one. NO `process.env` read here.
  const tmuxBin = deps.config.tmuxBin ?? 'tmux';

  return {
    async sendKeys(input: SteerKeysInput): Promise<void> {
      const { substrate, sessionName, keys, submit } = input;
      if (substrate !== 'tmux_worktree') {
        throw new Error(`tmux steer transport cannot deliver to substrate ${substrate}`);
      }
      // Truthful liveness probe first — a gone session is a refusal, not a drop.
      try {
        await exec(tmuxBin, ['has-session', '-t', sessionName]);
      } catch {
        throw new Error(`steer target session not found: ${sessionName}`);
      }
      // Literal injection: `-l` sends the text as-is (never key-name lookup);
      // `--` terminates option parsing so text starting with `-` stays text.
      await exec(tmuxBin, ['send-keys', '-t', sessionName, '-l', '--', keys]);
      if (submit) {
        await exec(tmuxBin, ['send-keys', '-t', sessionName, 'Enter']);
      }
      logger.info('steer keys delivered', { sessionName, bytes: keys.length, submit });
    },
  };
}
