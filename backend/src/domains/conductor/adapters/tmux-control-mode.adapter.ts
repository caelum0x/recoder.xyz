/**
 * `tmux-control-mode.adapter` — OPT-IN real-time `%output` streaming for a run
 * tail via a READ-ONLY tmux control-mode client (`tmux -C attach -r`), the
 * config-injected port of the proven legacy `conductor/tmux-control-mode.ts`.
 *
 * The poll tailer (`@recoder/substrate` `startRunTail` over capture()/alive())
 * is the DEFAULT and stays the authority. This adapter is ADDITIVE:
 * `selectControlModeTail` wraps the tailer's `TailSubstrate` only when
 *   (a) `config.tmuxControlMode` is true (was `TMUX_CONTROL_MODE=1`),
 *   (b) the workspace runs on the `tmux_worktree` substrate, and
 *   (c) the INJECTED tmux binary truthfully reports a control-mode-capable
 *       version (`-V` probe through the shared `supportsControlMode` gate).
 * Anything else returns `undefined` — the caller stays byte-for-byte on the
 * poller, which is the truthful degrade (never a fabricated attach).
 *
 * DEGRADE-SAFE BY CONSTRUCTION while active — the poller keeps running at its
 * normal interval for liveness + exit-code detection (it stays the sole emitter
 * of terminal completed/failed events); only its capture() is suppressed
 * (returns `null`, which the package tailer treats as "nothing to emit") while
 * the control-mode client is healthy. ANY failure (spawn error, unexpected
 * client exit, garbage on the wire) deactivates the listener and the wrapped
 * capture() transparently delegates to the real substrate again — the poller
 * resumes emitting deltas on its very next tick.
 *
 * No `process.env` reads (ARCHITECTURE §10.8): `tmuxBin` + `tmuxControlMode`
 * come from the injected {@link ConductorConfig} slice; the child-process seam
 * (`spawn`) and the `-V` probe seam (`exec`) are injected for tests.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import {
  execFileSafe,
  parseControlModeLine,
  stripAnsi,
  stripDcsEnvelope,
  supportsControlMode,
  MAX_DELTA_CHARS,
  type LoggerPort,
  type RunEventSink,
  type SubstrateHandle,
  type TailSubstrate,
} from '@recoder/substrate';
import type { RunEvent } from '@recoder/agent-os';
import type { ConductorConfig } from '../config.js';
import type { ExecFn } from './tmux-substrate.adapter.js';

/** How often buffered %output is flushed as a `log` RunEvent (ms). */
export const CONTROL_MODE_FLUSH_MS = 250;

/** The only substrate control mode applies to (a local tmux session must exist). */
export const TMUX_SUBSTRATE_ID = 'tmux_worktree';

/** A no-op logger so the adapter works even when none is injected. */
const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/** The minimal child-process surface the adapter drives (spawn seam for tests). */
export interface ControlModeChild {
  readonly stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null;
  readonly stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null;
  once(event: 'error', listener: (err: Error) => void): unknown;
  once(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
  kill(signal?: string): unknown;
  unref?(): void;
}

/** The injectable spawn seam (default: `node:child_process` spawn). */
export type SpawnFn = (bin: string, args: readonly string[]) => ControlModeChild;

export interface ControlModeCallbacks {
  /** Decoded, ANSI-stripped pane output. */
  onOutput(text: string): void;
  /** The control client detached cleanly (`%exit`). */
  onExit(reason?: string): void;
  /** The client failed — the caller must fall back to polling. */
  onDegrade(reason: string): void;
}

export interface ControlModeAttachment {
  /** Whether the control-mode client is still healthy. */
  readonly active: boolean;
  stop(): void;
}

export interface AttachControlModeDeps {
  readonly tmuxBin: string;
  readonly spawn?: SpawnFn;
  readonly logger?: LoggerPort;
}

/**
 * Attach a read-only control-mode client to a tmux session. Returns `undefined`
 * (NO spawn happened) when the client cannot be started — the caller stays on
 * the poller. Never throws.
 */
export function attachControlMode(
  sessionName: string,
  callbacks: ControlModeCallbacks,
  deps: AttachControlModeDeps,
): ControlModeAttachment | undefined {
  const spawn = deps.spawn ?? (nodeSpawn as unknown as SpawnFn);
  const logger = deps.logger ?? NOOP_LOGGER;

  let active = true;
  let sawExit = false;
  let buffer = '';
  let inBlock = false;
  let child: ControlModeChild;
  try {
    // -C SINGLE control mode (not -CC): modern tmux (>=3.4) requires a real
    // tty for the -CC double variant (`tcgetattr` fails over pipes), while -C
    // speaks the same %-notification protocol over plain pipes — verified
    // against the repo tmux (next-3.7). -r read-only: we only PARSE
    // notifications; we never send commands or keys through this client.
    // Loopback/local only — this drives the local tmux server, no network
    // surface.
    child = spawn(deps.tmuxBin, ['-C', 'attach-session', '-r', '-t', sessionName]);
  } catch (err) {
    logger.warn('control-mode spawn threw — staying on poller', {
      sessionName,
      err: message(err),
    });
    return undefined;
  }

  const deactivate = (): void => {
    if (!active) return;
    active = false;
    buffer = '';
    try {
      child.kill('SIGTERM');
    } catch {
      /* best-effort */
    }
  };

  const degrade = (reason: string): void => {
    if (!active) return;
    logger.warn('control-mode degraded — poller resumes capture', { sessionName, reason });
    deactivate();
    try {
      callbacks.onDegrade(reason);
    } catch {
      /* consumer errors must not cascade */
    }
  };

  const exited = (reason?: string): void => {
    if (!active) return;
    sawExit = true;
    deactivate();
    try {
      callbacks.onExit(reason);
    } catch {
      /* consumer errors must not cascade */
    }
  };

  const handleLine = (rawLine: string): void => {
    if (!active) return;
    const line = stripDcsEnvelope(rawLine);
    let parsed: ReturnType<typeof parseControlModeLine>;
    try {
      parsed = parseControlModeLine(line);
    } catch (err) {
      degrade(`parse error: ${message(err)}`);
      return;
    }
    switch (parsed.kind) {
      case 'block-begin':
        inBlock = true;
        return;
      case 'block-end':
        inBlock = false;
        return;
      case 'garbage':
        // Reply blocks carry arbitrary command output — not garbage.
        if (inBlock) return;
        degrade(parsed.reason);
        return;
      case 'output':
        try {
          callbacks.onOutput(stripAnsi(parsed.text));
        } catch {
          /* consumer errors must not cascade */
        }
        return;
      case 'exited':
        exited(parsed.reason);
        return;
      case 'session-changed':
      case 'ignored':
        return;
    }
  };

  child.stdout?.on('data', (chunk) => {
    if (!active) return;
    buffer += chunk.toString('utf8');
    let newline = buffer.indexOf('\n');
    while (newline !== -1 && active) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      handleLine(line);
      newline = buffer.indexOf('\n');
    }
  });
  child.stderr?.on('data', (chunk) => {
    const line = chunk.toString('utf8').trim();
    if (line) logger.debug?.('control-mode client stderr', { sessionName, stderr: line });
  });
  child.once('error', (err) => {
    degrade(`spawn error: ${message(err)}`);
  });
  child.once('exit', (code, signal) => {
    if (!active) return;
    if (sawExit) return;
    degrade(`control client exited unexpectedly (code ${code}, signal ${signal})`);
  });
  if (typeof child.unref === 'function') {
    // Never keep the backend process alive solely for a listener client.
    child.unref();
  }

  return {
    get active(): boolean {
      return active;
    },
    stop: deactivate,
  };
}

export interface ControlModeTailInput {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly agentId?: string;
  /** The substrate the workspace runs on (only `tmux_worktree` qualifies). */
  readonly substrateId: string;
  /** The tmux session hosting the agent. */
  readonly sessionName: string;
  /** The REAL substrate the poll tailer would use (delegated to on degrade). */
  readonly inner: TailSubstrate;
  /** The same terminal-stream seam the poll tailer feeds (RunEvent sink). */
  readonly sink: RunEventSink;
}

export interface ControlModeTailDeps {
  /** The injected conductor config slice (`tmuxBin` + the opt-in flag). */
  readonly config: Pick<ConductorConfig, 'tmuxBin' | 'tmuxControlMode'>;
  readonly logger?: LoggerPort;
  /** Child-process seam for the `-CC` client; defaults to node spawn. */
  readonly spawn?: SpawnFn;
  /** Probe seam for `tmux -V`; defaults to the package's `execFileSafe`. */
  readonly exec?: ExecFn;
  /** Flush cadence override (tests). */
  readonly flushMs?: number;
  /** Clock seam for RunEvent ids/timestamps (tests). */
  readonly nowMs?: () => number;
}

export interface ControlModeTail {
  /**
   * The wrapped `TailSubstrate` to hand to `startRunTail` in place of the real
   * one: capture() is suppressed (null) while the control client is healthy and
   * transparently delegates to the inner substrate after any degrade.
   */
  readonly substrate: TailSubstrate;
  stop(): void;
}

/**
 * Truthful `-V` probe of the INJECTED tmux binary. `false` on a missing binary
 * or an unparseable/pre-1.8 version — control mode is only selected when the
 * binary provably speaks it.
 */
export async function probeControlModeSupport(
  config: Pick<ConductorConfig, 'tmuxBin'>,
  exec: ExecFn = execFileSafe,
): Promise<boolean> {
  const tmuxBin = config.tmuxBin ?? 'tmux';
  try {
    const { stdout } = await exec(tmuxBin, ['-V']);
    return supportsControlMode(stdout);
  } catch {
    return false;
  }
}

/**
 * Start the opt-in control-mode listener for a run tail (flag + substrate
 * already vetted — see {@link selectControlModeTail} for the full gate).
 * Returns `undefined` — leaving the poller path completely untouched — when the
 * client cannot be attached. Never throws.
 */
export function startControlModeTail(
  input: ControlModeTailInput,
  deps: ControlModeTailDeps,
): ControlModeTail | undefined {
  const logger = deps.logger ?? NOOP_LOGGER;
  const tmuxBin = deps.config.tmuxBin ?? 'tmux';
  const flushMs = deps.flushMs ?? CONTROL_MODE_FLUSH_MS;
  const nowMs = deps.nowMs ?? Date.now;

  let pending = '';
  let seq = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const appendLog = (text: string): void => {
    seq += 1;
    const at = nowMs();
    const event: RunEvent = {
      // Poller convention is event_<runId>_<type>_<ms>; the control-mode
      // stream can emit several events per millisecond, so a per-tail sequence
      // keeps ids unique (live-events dedupes on eventId — collisions would
      // silently DROP output).
      eventId: `event_${input.runId}_log_${at}_cm${seq}`,
      type: 'log',
      taskId: input.taskId,
      runId: input.runId,
      agentId: input.agentId,
      message: text,
      createdAt: new Date(at).toISOString(),
      data: { source: 'tmux-control-mode' },
    };
    void input.sink.append(event).catch((err) => {
      logger.warn('control-mode appendEvent failed', {
        workspaceId: input.workspaceId,
        err: message(err),
      });
    });
  };

  const flush = (): void => {
    flushTimer = undefined;
    const text = pending.trim();
    pending = '';
    if (!text) return;
    // Same per-event cap as the poller's delta (keep the most recent output).
    appendLog(text.length > MAX_DELTA_CHARS ? text.slice(-MAX_DELTA_CHARS) : text);
  };

  const scheduleFlush = (): void => {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, flushMs);
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
  };

  const stopFlushing = (finalFlush: boolean): void => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    if (finalFlush) flush();
  };

  const attachment = attachControlMode(
    input.sessionName,
    {
      onOutput: (text) => {
        pending += text;
        // A runaway burst flushes immediately instead of growing unbounded.
        if (pending.length >= MAX_DELTA_CHARS) {
          stopFlushing(true);
          return;
        }
        scheduleFlush();
      },
      onExit: () => {
        // Session/client ended — flush what we have; the poller detects the
        // terminal state (alive/exitCode) and emits completed/failed.
        stopFlushing(true);
      },
      onDegrade: () => {
        // Flush what we have; the wrapped capture() below starts delegating
        // to the real substrate, so the poller resumes on its next tick.
        stopFlushing(true);
      },
    },
    { tmuxBin, spawn: deps.spawn, logger },
  );
  if (!attachment) return undefined;

  const stop = (): void => {
    stopFlushing(true);
    attachment.stop();
  };

  const substrate: TailSubstrate = {
    capture: (handle: SubstrateHandle, lines?: number) =>
      attachment.active ? Promise.resolve(null) : input.inner.capture(handle, lines),
    alive: async (handle: SubstrateHandle) => {
      const isAlive = await input.inner.alive(handle);
      // Natural end of the run: the poller stops itself after this tick, so
      // self-clean the control client too (no lingering tmux clients on
      // remain-on-exit dead panes).
      if (!isAlive) stop();
      return isAlive;
    },
    ...(input.inner.exitCode
      ? { exitCode: (handle: SubstrateHandle) => input.inner.exitCode!(handle) }
      : {}),
  };

  logger.info(
    'tmux control-mode listener attached (opt-in) — capture-poll suppressed while healthy',
    { workspaceId: input.workspaceId, sessionName: input.sessionName },
  );
  return { substrate, stop };
}

/**
 * The FULL selection gate the composition root calls before `startRunTail`:
 * config flag on AND tmux substrate AND the binary provably supports `-CC`.
 * `undefined` = stay on the poll tailer (the truthful default/degrade).
 */
export async function selectControlModeTail(
  input: ControlModeTailInput,
  deps: ControlModeTailDeps,
): Promise<ControlModeTail | undefined> {
  const logger = deps.logger ?? NOOP_LOGGER;
  if (!deps.config.tmuxControlMode) return undefined;
  if (input.substrateId !== TMUX_SUBSTRATE_ID) return undefined;
  const supported = await probeControlModeSupport(deps.config, deps.exec);
  if (!supported) {
    logger.info('tmux binary does not support control mode — poll tailer selected', {
      workspaceId: input.workspaceId,
      tmuxBin: deps.config.tmuxBin ?? 'tmux',
    });
    return undefined;
  }
  return startControlModeTail(input, deps);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
