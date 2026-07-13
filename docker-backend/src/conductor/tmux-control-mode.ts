/**
 * tmux control-mode listener — OPT-IN real-time output events (TMUX_CONTROL_MODE=1).
 *
 * The run-tailer polls `tmux capture-pane` every 3s (the proven default path).
 * This module is the smallest safe increment toward real-time: when the
 * TMUX_CONTROL_MODE=1 flag is set, it attaches a persistent READ-ONLY tmux
 * control-mode client (`tmux -CC attach -r -t <session>`), parses the
 * `%output`/`%session-changed`/`%exit(ed)` notifications from its stdout
 * (including tmux's octal-escape encoding), and feeds decoded output to the
 * SAME consumer the poller feeds (the RunEventSink) as `log` RunEvents.
 *
 * DEGRADE-SAFE BY CONSTRUCTION — the poller stays the authority:
 *   - Flag off (default): `startControlModeTail` returns undefined and NOTHING
 *     is spawned. The poller path is byte-for-byte untouched.
 *   - Flag on: the poller keeps running at its normal interval for liveness +
 *     exit-code detection (it stays the sole emitter of terminal
 *     completed/failed events); only its capture() is suppressed (returns null,
 *     which the package tailer already treats as "nothing to emit") while the
 *     control-mode client is healthy.
 *   - ANY control-mode failure (spawn error, unexpected client exit, garbage on
 *     the wire, tmux too old to speak the protocol) deactivates the listener,
 *     and the wrapped capture() transparently delegates to the real substrate
 *     again — the poller resumes emitting deltas on its very next tick.
 *   - Test-mode guard: under NODE_ENV=test nothing is spawned unless the test
 *     injects its own spawn implementation.
 *
 * Known trade-offs while control mode is active (documented, opt-in only):
 *   - needs_input detection (which reads the polled pane) is paused; it resumes
 *     automatically on degrade or when the flag is off.
 *   - after a mid-run degrade the poller's first delta is computed from an
 *     empty baseline, so up to one capped (MAX_DELTA_CHARS) re-emission of
 *     already-seen output can occur. Capped and log-only — never state-bearing.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import type { RunEvent } from '@recoder/agent-os';
import {
  MAX_DELTA_CHARS,
  type RunEventSink,
  type SubstrateHandle,
  type TailSubstrate,
} from '@recoder/substrate';
import { createLogger } from '../logger.js';
import { TMUX_BIN } from './tmux-path.js';

const logger = createLogger('conductor:tmux-control-mode');

/** The opt-in flag. Default OFF — the capture-poll path stays the default. */
export const TMUX_CONTROL_MODE_ENV = 'TMUX_CONTROL_MODE';

/** How often buffered %output is flushed as a `log` RunEvent (ms). */
export const CONTROL_MODE_FLUSH_MS = 250;

/** The only substrate control mode applies to (a tmux session must exist). */
const TMUX_SUBSTRATE_ID = 'tmux_worktree';

/** Whether the operator opted in to the control-mode listener. */
export function controlModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TMUX_CONTROL_MODE_ENV] === '1';
}

// ---------------------------------------------------------------------------
// Protocol parsing (pure — unit-testable without a spawn)
// ---------------------------------------------------------------------------

export type ControlModeNotification =
  /** `%output %<pane-id> <data>` — decoded pane output. */
  | { kind: 'output'; paneId: string; text: string }
  /** `%session-changed $<id> <name>` — informational, safe to observe. */
  | { kind: 'session-changed'; sessionId: string; name: string }
  /** `%exit`/`%exited [reason]` — the control client is detaching. */
  | { kind: 'exited'; reason?: string }
  /** A recognized-but-irrelevant notification (`%window-add`, …). */
  | { kind: 'ignored' }
  /** Reply-block delimiters (`%begin` … `%end`/`%error`). */
  | { kind: 'block-begin' }
  | { kind: 'block-end' }
  /** Not valid control-mode protocol — the caller must degrade. */
  | { kind: 'garbage'; reason: string };

/**
 * Decode tmux control-mode escaping: non-printable/non-ASCII bytes arrive as
 * `\ooo` (three octal digits) and a literal backslash as `\\`. The escaped
 * stream is byte-oriented, so decoded bytes are reassembled as UTF-8.
 */
export function decodeControlModeData(data: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const ch = data[i];
    if (ch === '\\') {
      const octal = data.slice(i + 1, i + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        bytes.push(parseInt(octal, 8));
        i += 3;
        continue;
      }
      if (data[i + 1] === '\\') {
        bytes.push(0x5c);
        i += 1;
        continue;
      }
      // Lone backslash — keep it literally (defensive; tmux always escapes).
      bytes.push(0x5c);
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code > 0xff) {
      for (const byte of Buffer.from(ch, 'utf8')) bytes.push(byte);
      continue;
    }
    bytes.push(code);
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Strip ANSI escape sequences + normalize line endings so control-mode output
 * matches the plain text the capture-poll path produces (`capture-pane` without
 * `-e` already drops escapes). Cursor-movement fidelity is not a goal here —
 * the RunEvent log is a text audit trail, not a terminal emulator.
 */
export function stripAnsi(text: string): string {
  return (
    text
      // CSI sequences (colors, cursor movement): ESC [ … final byte
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      // OSC sequences (titles): ESC ] … (BEL | ESC \)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
      // Remaining two-byte ESC sequences
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[@-_]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '')
  );
}

/** Parse ONE line of control-mode stdout into a typed notification. */
export function parseControlModeLine(line: string): ControlModeNotification {
  if (line === '') return { kind: 'ignored' };
  if (!line.startsWith('%')) {
    return { kind: 'garbage', reason: `non-notification line: ${line.slice(0, 80)}` };
  }
  if (line.startsWith('%begin')) return { kind: 'block-begin' };
  if (line.startsWith('%end') || line.startsWith('%error')) return { kind: 'block-end' };
  if (line.startsWith('%output')) {
    const match = /^%output (%\d+) (.*)$/s.exec(line);
    if (!match) return { kind: 'garbage', reason: `malformed %output: ${line.slice(0, 80)}` };
    return { kind: 'output', paneId: match[1], text: decodeControlModeData(match[2]) };
  }
  if (line.startsWith('%session-changed')) {
    const match = /^%session-changed (\$\d+) (.*)$/.exec(line);
    if (!match) {
      return { kind: 'garbage', reason: `malformed %session-changed: ${line.slice(0, 80)}` };
    }
    return { kind: 'session-changed', sessionId: match[1], name: match[2] };
  }
  if (/^%exit(ed)?(\s|$)/.test(line)) {
    const reason = line.replace(/^%exit(ed)?\s*/, '').trim();
    return { kind: 'exited', reason: reason || undefined };
  }
  // Any other %-notification (%window-add, %layout-change, …) is valid
  // protocol we simply do not consume.
  return { kind: 'ignored' };
}

// ---------------------------------------------------------------------------
// Low-level attachment (spawn + line pump + callbacks)
// ---------------------------------------------------------------------------

export interface ControlModeCallbacks {
  /** Decoded, ANSI-stripped pane output (may arrive in many small chunks). */
  onOutput(text: string): void;
  /** The control client detached cleanly (`%exit`) or the session ended. */
  onExit(reason?: string): void;
  /** Anything went wrong — the caller MUST fall back to the poller. */
  onDegrade(reason: string): void;
}

export interface ControlModeDeps {
  /** Injectable spawn (tests). Defaults to node:child_process.spawn. */
  spawn?: typeof nodeSpawn;
  env?: NodeJS.ProcessEnv;
}

export interface ControlModeAttachment {
  readonly active: boolean;
  /** Detach silently (no callbacks). Idempotent. */
  stop(): void;
}

/**
 * Attach a read-only control-mode client to a tmux session. Returns undefined
 * (NO spawn) when spawning is not possible/allowed — the caller stays on the
 * poller. Never throws.
 */
export function attachControlMode(
  sessionName: string,
  callbacks: ControlModeCallbacks,
  deps: ControlModeDeps = {},
): ControlModeAttachment | undefined {
  const env = deps.env ?? process.env;
  // Test-mode guard: never spawn a real tmux client under the test runner.
  // Tests exercising the pump inject their own spawn implementation.
  if (env.NODE_ENV === 'test' && !deps.spawn) return undefined;
  const spawn = deps.spawn ?? nodeSpawn;

  let active = true;
  let sawExit = false;
  let buffer = '';
  let inBlock = false;

  let child: ReturnType<typeof nodeSpawn>;
  try {
    // -CC control mode, -r read-only: we only PARSE notifications; we never
    // send commands or keys through this client. Loopback/local only — this
    // drives the local tmux server, no network surface.
    child = spawn(TMUX_BIN, ['-CC', 'attach-session', '-r', '-t', sessionName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    logger.warn({ sessionName, err }, 'control-mode spawn threw — staying on poller');
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
    logger.warn({ sessionName, reason }, 'control-mode degraded — poller resumes capture');
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
    // -CC wraps the stream in a DCS envelope; strip the markers.
    // eslint-disable-next-line no-control-regex
    const line = rawLine.replace(/\x1bP1000p/g, '').replace(/\x1b\\/g, '');
    let parsed: ControlModeNotification;
    try {
      parsed = parseControlModeLine(line);
    } catch (err) {
      degrade(`parse error: ${String(err)}`);
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

  child.stdout?.on('data', (chunk: Buffer) => {
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

  child.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString('utf8').trim();
    if (line) logger.debug({ sessionName, stderr: line }, 'control-mode client stderr');
  });

  child.once('error', (err) => {
    degrade(`spawn error: ${String(err)}`);
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
    get active() {
      return active;
    },
    stop: deactivate,
  };
}

// ---------------------------------------------------------------------------
// Tail integration (the surface run-tailer.ts wires in)
// ---------------------------------------------------------------------------

export interface ControlModeTailInput {
  workspaceId: string;
  taskId: string;
  runId: string;
  agentId?: string;
  /** tmux session name hosting the agent. */
  sessionName: string;
  /** The workspace's substrate id — control mode only applies to tmux. */
  substrateId: string;
  /** The real substrate the poller would use (delegated to). */
  inner: TailSubstrate;
  /** The SAME consumer the poller feeds (the RunEvent sink of record). */
  sink: RunEventSink;
}

export interface ControlModeTail {
  /**
   * Substrate wrapper to hand the poller: capture() is suppressed (null) while
   * the control-mode client is healthy and transparently delegates to the real
   * substrate once degraded/ended. alive()/exitCode() always delegate — the
   * poller remains the terminal-event authority.
   */
  substrate: TailSubstrate;
  /** Stop the control-mode client (called alongside the tail's stop). */
  stop(): void;
}

/**
 * Start the opt-in control-mode listener for a run tail. Returns undefined —
 * leaving the poller path completely untouched — when the flag is off, the
 * substrate is not tmux, or the client cannot be attached. Never throws.
 */
export function startControlModeTail(
  input: ControlModeTailInput,
  deps: ControlModeDeps & { flushMs?: number } = {},
): ControlModeTail | undefined {
  const env = deps.env ?? process.env;
  if (!controlModeEnabled(env)) return undefined;
  if (input.substrateId !== TMUX_SUBSTRATE_ID) return undefined;

  const flushMs = deps.flushMs ?? CONTROL_MODE_FLUSH_MS;
  let pending = '';
  let seq = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const appendLog = (message: string): void => {
    seq += 1;
    const event: RunEvent = {
      // Poller convention is event_<runId>_<type>_<ms>; the control-mode
      // stream can emit several events per millisecond, so a per-tail sequence
      // keeps ids unique (live-events dedupes on eventId — collisions would
      // silently DROP output).
      eventId: `event_${input.runId}_log_${Date.now()}_cm${seq}`,
      type: 'log',
      taskId: input.taskId,
      runId: input.runId,
      agentId: input.agentId,
      message,
      createdAt: new Date().toISOString(),
      data: { source: 'tmux-control-mode' },
    };
    void input.sink.append(event).catch((err) => {
      logger.warn({ workspaceId: input.workspaceId, err }, 'control-mode appendEvent failed');
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
    deps,
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
    { workspaceId: input.workspaceId, sessionName: input.sessionName },
    'tmux control-mode listener attached (opt-in) — capture-poll suppressed while healthy',
  );
  return { substrate, stop };
}
