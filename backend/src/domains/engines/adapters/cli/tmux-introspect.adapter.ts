/**
 * `TmuxIntrospectPort` — the DEEP, structured, READ-ONLY introspection surface
 * over the pinned tmux binary the Conductor drives (the same tmux server its
 * headless `recoder-*` sessions live in — see `tmux-path.ts` + `tmux.adapter.ts`).
 *
 * The base `TmuxAdapter.invoke` maps ops onto raw tmux verbs and returns the
 * newline stdout; this port adds the capability the raw seam lacked: it drives
 * tmux's `-F` format strings so `list-sessions` / `list-windows` / `list-panes` /
 * `capture-pane` come back as TYPED records (ids, pids, dimensions, active flags,
 * current command/path), plus a `serverInfo` roll-up (version, running, session +
 * client counts). This is what the backend MCP tools expose to agents so they can
 * *observe* the multiplexer substrate without mutating it.
 *
 * STRICTLY READ-ONLY: there is no send-keys / new-session / kill-session here —
 * mutation of a live conductor session stays with the conductor's own gated
 * steer/stop path. This port only observes.
 *
 * DEGRADE-SAFE LAW (mirrors the adapter): tmux not resolvable / not runnable ⇒
 * every method returns a truthful `{ ok:false, reason }`. A tmux that is present
 * but has NO server running yet is NOT a failure — it is the empty state
 * (`list-sessions` → `ok([])`, `serverInfo` → `running:false`). Nothing is ever
 * fabricated.
 */
import type { CliResult, RunCliOptions } from './cli-exec.js';
import { runCli } from './cli-exec.js';
import { ok, fail, type InvokeResult } from '../../types.js';

/** ASCII Unit Separator — the field delimiter for tmux `-F` format rows. */
const FS = '\x1f';

/** A tmux session record (one row of `list-sessions -F`). */
export interface TmuxSession {
  readonly name: string;
  readonly id: string;
  readonly windows: number;
  readonly attached: boolean;
  /** Epoch-seconds string tmux reports for session creation. */
  readonly created?: string;
  /** Epoch-seconds string of the last session activity. */
  readonly activity?: string;
}

/** A tmux window record (one row of `list-windows -F`). */
export interface TmuxWindow {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly panes: number;
  readonly layout?: string;
}

/** A tmux pane record (one row of `list-panes -F`). */
export interface TmuxPane {
  readonly id: string;
  readonly index: number;
  readonly pid: number;
  readonly active: boolean;
  readonly command: string;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly title?: string;
}

/** The captured content of a single pane. */
export interface TmuxCapture {
  readonly target: string;
  readonly lines: readonly string[];
  readonly content: string;
  /** True when `maxLines` clipped the returned lines (older lines dropped). */
  readonly truncated: boolean;
}

/** A roll-up of the tmux server the conductor shares. */
export interface TmuxServerInfo {
  readonly running: boolean;
  readonly version: string;
  readonly vendored: boolean;
  readonly bindingPath: string;
  readonly sessions: number;
  readonly clients: number;
}

/** Bounded input for `capturePane`. `target` is a tmux pane/window/session id. */
export interface CapturePaneInput {
  readonly target: string;
  /** tmux `-S`: first line of the range (negative = scrollback history). */
  readonly startLine?: number;
  /** tmux `-E`: last line of the range. */
  readonly endLine?: number;
  /** tmux `-J`: join wrapped lines + preserve trailing spaces. */
  readonly join?: boolean;
  /** Cap on returned lines (keeps the newest); default 500, hard max 5000. */
  readonly maxLines?: number;
}

/** The read-only tmux introspection capability the MCP tools bind over. */
export interface TmuxIntrospectPort {
  listSessions(): Promise<InvokeResult<readonly TmuxSession[]>>;
  listWindows(session?: string): Promise<InvokeResult<readonly TmuxWindow[]>>;
  listPanes(target?: string): Promise<InvokeResult<readonly TmuxPane[]>>;
  capturePane(input: CapturePaneInput): Promise<InvokeResult<TmuxCapture>>;
  serverInfo(): Promise<InvokeResult<TmuxServerInfo>>;
}

/** The bounded exec seam (defaults to `runCli`); injectable so tests mock tmux. */
export type TmuxRun = (bin: string, args: readonly string[], options?: RunCliOptions) => Promise<CliResult>;

export interface TmuxIntrospectDeps {
  /** The resolved tmux binary (the pinned `TMUX_BIN` in production). */
  readonly bin: string;
  /** Whether the tmux engine is enabled by config (checked per call). */
  readonly enabled: () => boolean;
  /** Whether `bin` is the vendored/pinned binary (surfaced in `serverInfo`). */
  readonly vendored: boolean;
  /** Override the exec seam (tests). Defaults to the shared `runCli`. */
  readonly run?: TmuxRun;
  /** Per-call deadline (ms). Default 10s. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CAPTURE_LINES = 500;
const MAX_CAPTURE_LINES = 5000;

const SESSION_FMT = [
  '#{session_name}',
  '#{session_id}',
  '#{session_windows}',
  '#{session_attached}',
  '#{session_created}',
  '#{session_activity}',
].join(FS);

const WINDOW_FMT = [
  '#{window_index}',
  '#{window_id}',
  '#{window_name}',
  '#{window_active}',
  '#{window_panes}',
  '#{window_layout}',
].join(FS);

const PANE_FMT = [
  '#{pane_id}',
  '#{pane_index}',
  '#{pane_pid}',
  '#{pane_active}',
  '#{pane_current_command}',
  '#{pane_current_path}',
  '#{pane_width}',
  '#{pane_height}',
  '#{pane_title}',
].join(FS);

/** Build the read-only tmux introspection port over the bounded exec seam. */
export function createTmuxIntrospect(deps: TmuxIntrospectDeps): TmuxIntrospectPort {
  const run: TmuxRun = deps.run ?? runCli;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** Run a bounded read-only tmux invocation, classifying the failure mode. */
  async function exec(args: readonly string[]): Promise<
    { readonly kind: 'ok'; readonly stdout: string }
    | { readonly kind: 'empty' } // tmux present, no server running yet
    | { readonly kind: 'fail'; readonly reason: string; readonly code: string }
  > {
    if (!deps.enabled()) return { kind: 'fail', reason: 'tmux engine disabled by config', code: 'disabled' };
    const result = await run(deps.bin, args, { timeoutMs });
    if (result.ok) return { kind: 'ok', stdout: result.stdout };
    const raw = `${result.reason ?? ''} ${result.stderr ?? ''}`;
    if (/no server running/i.test(raw)) return { kind: 'empty' };
    if (/ENOENT|not found|no such file/i.test(raw)) {
      return { kind: 'fail', reason: 'tmux is not installed on this host', code: 'unavailable' };
    }
    return { kind: 'fail', reason: result.reason ?? 'tmux failed', code: 'cli_error' };
  }

  function rows(stdout: string): string[] {
    return stdout.split('\n').filter((line) => line.length > 0);
  }

  return {
    async listSessions() {
      const res = await exec(['list-sessions', '-F', SESSION_FMT]);
      if (res.kind === 'empty') return ok([]);
      if (res.kind === 'fail') return fail(res.reason, res.code);
      return ok(rows(res.stdout).map(parseSession).filter((s): s is TmuxSession => s !== null));
    },

    async listWindows(session?: string) {
      const target = clean(session);
      const args = ['list-windows', ...(target ? ['-t', target] : ['-a']), '-F', WINDOW_FMT];
      const res = await exec(args);
      if (res.kind === 'empty') return ok([]);
      if (res.kind === 'fail') return fail(res.reason, res.code);
      return ok(rows(res.stdout).map(parseWindow).filter((w): w is TmuxWindow => w !== null));
    },

    async listPanes(target?: string) {
      const t = clean(target);
      const args = ['list-panes', ...(t ? ['-t', t] : ['-a']), '-F', PANE_FMT];
      const res = await exec(args);
      if (res.kind === 'empty') return ok([]);
      if (res.kind === 'fail') return fail(res.reason, res.code);
      return ok(rows(res.stdout).map(parsePane).filter((p): p is TmuxPane => p !== null));
    },

    async capturePane(input: CapturePaneInput) {
      const target = clean(input.target);
      if (!target) return fail('tmux capture-pane requires a target pane id', 'bad_input');
      const args = ['capture-pane', '-p', '-t', target];
      if (input.join) args.push('-J');
      if (Number.isInteger(input.startLine)) args.push('-S', String(input.startLine));
      if (Number.isInteger(input.endLine)) args.push('-E', String(input.endLine));
      const res = await exec(args);
      if (res.kind === 'empty') return fail('no tmux server running (no such pane)', 'not_found');
      if (res.kind === 'fail') return fail(res.reason, res.code);
      const allLines = res.stdout.replace(/\n$/, '').split('\n');
      const cap = boundLimit(input.maxLines);
      const truncated = allLines.length > cap;
      const lines = truncated ? allLines.slice(allLines.length - cap) : allLines;
      return ok({ target, lines, content: lines.join('\n'), truncated });
    },

    async serverInfo() {
      const version = await run(deps.bin, ['-V'], { timeoutMs });
      if (!version.ok) {
        const raw = `${version.reason ?? ''} ${version.stderr ?? ''}`;
        if (/ENOENT|not found|no such file/i.test(raw)) {
          return fail('tmux is not installed on this host', 'unavailable');
        }
        return fail(version.reason ?? 'tmux -V did not respond', 'cli_error');
      }
      const sessionsRes = await this.listSessions();
      if (!sessionsRes.ok) return fail(sessionsRes.reason, sessionsRes.code);
      const running = sessionsRes.value.length > 0 || (await serverIsUp(run, deps.bin, timeoutMs));
      const clients = running ? await countClients(run, deps.bin, timeoutMs) : 0;
      return ok({
        running,
        version: version.stdout.trim().slice(0, 60),
        vendored: deps.vendored,
        bindingPath: deps.bin,
        sessions: sessionsRes.value.length,
        clients,
      });
    },
  };
}

/**
 * Detect a running server even with zero sessions. A clean `list-sessions` exit
 * means the server is up; any failure (including "no server running") means down.
 */
async function serverIsUp(run: TmuxRun, bin: string, timeoutMs: number): Promise<boolean> {
  const res = await run(bin, ['list-sessions'], { timeoutMs });
  return res.ok;
}

/** Count attached clients; 0 when the server is down or list-clients fails. */
async function countClients(run: TmuxRun, bin: string, timeoutMs: number): Promise<number> {
  const res = await run(bin, ['list-clients', '-F', '#{client_name}'], { timeoutMs });
  if (!res.ok) return 0;
  return res.stdout.split('\n').filter((line) => line.length > 0).length;
}

function parseSession(row: string): TmuxSession | null {
  const [name, id, windows, attached, created, activity] = row.split(FS);
  if (!name || !id) return null;
  return {
    name,
    id,
    windows: toInt(windows),
    attached: attached === '1',
    ...(created ? { created } : {}),
    ...(activity ? { activity } : {}),
  };
}

function parseWindow(row: string): TmuxWindow | null {
  const [index, id, name, active, panes, layout] = row.split(FS);
  if (!id) return null;
  return {
    index: toInt(index),
    id,
    name: name ?? '',
    active: active === '1',
    panes: toInt(panes),
    ...(layout ? { layout } : {}),
  };
}

function parsePane(row: string): TmuxPane | null {
  const [id, index, pid, active, command, path, width, height, title] = row.split(FS);
  if (!id) return null;
  return {
    id,
    index: toInt(index),
    pid: toInt(pid),
    active: active === '1',
    command: command ?? '',
    path: path ?? '',
    width: toInt(width),
    height: toInt(height),
    ...(title ? { title } : {}),
  };
}

function toInt(value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

function clean(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boundLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || (value as number) <= 0) return DEFAULT_CAPTURE_LINES;
  return Math.min(value as number, MAX_CAPTURE_LINES);
}
