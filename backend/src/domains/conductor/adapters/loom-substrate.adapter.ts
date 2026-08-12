/**
 * `createLoomSubstrate` — a ConductorSubstrate that DRIVES the vendored loom
 * engine (`apps/desktop/engines/loom`, Apache-2.0) as a third execution
 * substrate beside `tmux_worktree` and `acp`. loom runs a headless server
 * (`loom server`) exposing an NDJSON Unix-socket control API; this adapter maps
 * the narrow {@link ConductorSubstrate} contract onto that API via the Phase-0
 * {@link LoomSocketClient} (reused verbatim from `@recoder/agent-runtimes`).
 *
 * Port → loom verb (see docs/LOOM-INTEGRATION.md):
 *  - `available()`  = `ping` → `pong{protocol}`; rejects unless `protocol===20`;
 *    a missing binary / `ECONNREFUSED` / timeout degrades to
 *    `{available:false, reason}` — NEVER a fabricated "available".
 *  - `capabilities()` = `capturesByPolling:false` (loom emits native status
 *    events, so the poller does not drive capture); PTY/Diff/IsolationRemoval:true.
 *  - `launch()`  = `worktree.create{cwd,branch,base}` → `agent.start{name,kind,
 *    pane_id:root_pane, timeout_ms}`; handle carries `{ref:workspaceId,
 *    worktreePath:worktree.path, sessionName:agent.terminal_id}`.
 *  - `capture()` = `agent.read{target,source:'recent',strip_ansi:true}`; `null`
 *    on a dead handle.
 *  - `alive()`   = `agent.get{target}` resolves to an `AgentInfo`.
 *  - `exitCode()`= `agent.get` → `AgentStatus`: `done ⇒ 0`, a LIVE agent
 *    (working/blocked/idle/unknown) ⇒ `undefined` (NEVER a fabricated 0), a gone
 *    agent (probe rejects) ⇒ `null`. loom surfaces no OS exit code — same as acp.
 *  - `diff()`    = HOST git over the worktree (loom has no diff verb), reusing
 *    `buildSubstrateDiff` verbatim from the tmux/acp adapters.
 *  - `teardown()`= `worktree.remove{force}` (removes the worktree AND its live
 *    panes/agents); best-effort, never throws.
 *  - `continueRun()` = `agent.prompt{target,text}` on the SAME live pane/worktree
 *    (the agent stays live — unlike the tmux respawn).
 *
 * Config-injected (ARCHITECTURE §10.8): the socket path is INJECTED via `deps`
 * and this module reads NO `process.env` — resolve it at the composition edge
 * with `defaultLoomSocketPath(env)`. The child-process seam (`exec`, default
 * `execFileSafe`) and the client itself are injectable so the mapping is
 * unit-tested against an in-memory fake loom server with no real engine/git.
 * Truthful degrade everywhere: an unavailable substrate refuses to launch, a
 * dead handle captures `null`, and an exit code is never fabricated.
 *
 * NOTE (Phase 1): the `'loom'` id is not yet a member of the
 * `WorkspaceSubstrate` union (Phase 4 adds it + the registry registration), so
 * the id is asserted here; nothing else depends on the union carrying it yet.
 */
import {
  execFileSafe,
  buildSubstrateDiff,
  type ExecOptions,
  type ExecResult,
  type LoggerPort,
  type SubstrateDiff,
} from '@recoder/substrate';
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import {
  LoomSocketClient,
  type LoomCallOptions,
  type LoomResult,
} from '@recoder/agent-runtimes/loom';
import type {
  ConductorSubstrate,
  ContinueRunInput,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '../ports/substrate-registry.port.js';
import { tmuxNameFor } from '../session-naming.js';

/** The injectable child-process seam (default: the package's `execFileSafe`). */
export type ExecFn = (
  bin: string,
  args: readonly string[],
  options?: ExecOptions
) => Promise<ExecResult>;

/**
 * The narrow slice of the Phase-0 {@link LoomSocketClient} this adapter drives.
 * `LoomSocketClient` satisfies it structurally; injectable so tests can supply a
 * client pointed at an in-memory fake server (or a stub).
 */
export interface LoomClientPort {
  ping(
    options?: LoomCallOptions
  ): Promise<Extract<LoomResult, { type: 'pong' }>>;
  call<Result extends LoomResult = LoomResult>(
    method: string,
    params: unknown,
    options?: LoomCallOptions
  ): Promise<Result>;
  callAndWait<Result extends LoomResult = LoomResult>(
    method: string,
    params: unknown,
    options?: LoomCallOptions
  ): Promise<Result>;
}

/** loom agent-start timeout bounds — loom requires `> 3000 && <= 300000` (ms). */
const TIMEOUT_MIN_MS = 3001;
const TIMEOUT_MAX_MS = 300_000;
const TIMEOUT_DEFAULT_MS = 120_000;

/** The `'loom'` substrate id (see file NOTE — not yet in the union). */
const LOOM_ID = 'loom' as WorkspaceSubstrate;

/** A no-op logger so the substrate works even when none is injected. */
const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

export interface CreateLoomSubstrateDeps {
  /**
   * Absolute path to the loom `loom.sock` Unix socket, INJECTED (never read
   * from `process.env` in-module). Required unless a pre-built `client` is given.
   */
  readonly socketPath?: string;
  /** Pre-built client (overrides `socketPath`); default: a `LoomSocketClient`. */
  readonly client?: LoomClientPort;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
  /** Child-process seam for the host-git diff; defaults to `execFileSafe`. */
  readonly exec?: ExecFn;
}

/**
 * Clamp a caller-provided `timeout_ms` into loom's accepted `(3000, 300000]`
 * window; a missing/NaN value falls back to the default. Never emits an
 * out-of-range value that loom would reject.
 */
function clampTimeoutMs(raw: string | undefined): number {
  if (raw == null || raw.trim() === '') return TIMEOUT_DEFAULT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return TIMEOUT_DEFAULT_MS;
  return Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, parsed));
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Narrow a `LoomResult` to the expected `type`-tagged variant, or throw a
 * truthful error naming what the engine actually returned. The client's result
 * union carries a catch-all `{type:string}` member (unknown tags never fabricate
 * a typed result), so a plain equality guard alone does not narrow the typed
 * fields — this asserts the variant after the runtime check.
 */
function expectResult<T extends LoomResult['type']>(
  res: LoomResult,
  type: T,
  verb: string
): Extract<LoomResult, { type: T }> {
  if (res.type !== type) {
    throw new Error(
      `loom ${verb} returned '${res.type}', expected '${type}'`
    );
  }
  return res as Extract<LoomResult, { type: T }>;
}

/**
 * Build the `loom` ConductorSubstrate over an injected socket path (or client).
 * Register it via `createSubstrateRegistry({ substrates: [createLoomSubstrate(deps)] })`.
 */
export function createLoomSubstrate(
  deps: CreateLoomSubstrateDeps
): ConductorSubstrate {
  const logger = deps.logger ?? NOOP_LOGGER;
  const exec: ExecFn = deps.exec ?? execFileSafe;
  if (
    deps.client == null &&
    (deps.socketPath == null || deps.socketPath === '')
  ) {
    throw new Error(
      'createLoomSubstrate requires an injected socketPath or client'
    );
  }
  const client: LoomClientPort =
    deps.client ?? new LoomSocketClient({ socketPath: deps.socketPath! });

  /** The agent-method `target` for a handle: the loom terminal id (sessionName). */
  function targetOf(handle: SubstrateHandle): string | null {
    return handle.sessionName != null && handle.sessionName !== ''
      ? handle.sessionName
      : null;
  }

  return {
    id: LOOM_ID,

    capabilities(): SubstrateCapabilities {
      return {
        // The loom daemon runs on the local host (not a remote sandbox).
        remote: false,
        // Agents run in real loom panes (PTYs); keystrokes can be injected.
        supportsPty: true,
        supportsInteractiveKeys: true,
        // loom emits NATIVE agent-status events, so capture is not poll-driven.
        capturesByPolling: false,
        supportsDiff: true,
        supportsIsolationRemoval: true,
      };
    },

    async available(): Promise<SubstrateAvailability> {
      // `ping` already rejects a protocol mismatch (LoomError 'protocol_mismatch')
      // and a missing daemon (ECONNREFUSED / connection_closed / timeout). Degrade
      // truthfully on ANY failure — never fabricate availability.
      try {
        const pong = await client.ping();
        return { available: true, detail: { protocol: pong.protocol } };
      } catch (err) {
        return {
          available: false,
          reason: `loom unavailable (${message(err)})`,
        };
      }
    },

    async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
      // Refuse to fabricate a session when the daemon is unreachable/incompatible.
      const avail = await this.available();
      if (!avail.available) {
        throw new Error(`loom unavailable (${avail.reason})`);
      }

      const branch = input.branch || `recoder/${input.workspaceId}`;
      const base = input.baseRef || 'HEAD';

      // 1) Native git worktree — loom owns the checkout (replaces `git worktree add`).
      const createRes = expectResult(
        await client.call('worktree.create', {
          workspace_id: input.workspaceId,
          cwd: input.repoPath,
          branch,
          base,
        }),
        'worktree_created',
        'worktree.create'
      );
      const worktreePath = createRes.worktree.path;
      const paneId = createRes.root_pane.pane_id;

      // 2) Start the agent in the worktree's root pane. `kind` selects the loom
      // agent machine (claude/codex/…); `name` is the instance label; the initial
      // instruction rides `args`. All are injected via the launch env by the
      // conductor's composer (this module reads no process.env).
      const kind = input.env?.RECODER_LOOM_KIND?.trim() || 'claude';
      const name =
        input.env?.RECODER_LOOM_NAME?.trim() ||
        tmuxNameFor(input.workspaceId);
      const timeoutMs = clampTimeoutMs(input.env?.RECODER_LOOM_TIMEOUT_MS);
      const startParams: Record<string, unknown> = {
        name,
        kind,
        pane_id: paneId,
        timeout_ms: timeoutMs,
      };
      if (input.command) startParams.args = [input.command];

      const startRes = await client.call('agent.start', startParams);
      if (startRes.type !== 'agent_started') {
        // Best-effort cleanup of the just-created worktree so a failed start
        // never leaks isolation, then surface the failure truthfully.
        await this.teardown(
          { ref: input.workspaceId, worktreePath },
          { removeIsolation: true }
        ).catch(() => {});
        throw new Error(
          `loom agent.start returned '${startRes.type}', expected 'agent_started'`
        );
      }
      const terminalId = (
        startRes as Extract<LoomResult, { type: 'agent_started' }>
      ).agent.terminal_id;

      logger.info('loom workspace launched', {
        workspaceId: input.workspaceId,
        worktreePath,
        branch,
        kind,
        terminalId,
      });
      // sessionName = the loom terminal id (the agent-method `target`); persisted
      // by the engine so the handle is restart-re-derivable.
      return { ref: input.workspaceId, worktreePath, sessionName: terminalId };
    },

    async capture(
      handle: SubstrateHandle,
      lines = 200
    ): Promise<string | null> {
      const target = targetOf(handle);
      if (target == null) return null;
      try {
        const res = await client.call('agent.read', {
          target,
          source: 'recent',
          lines,
          strip_ansi: true,
        });
        if (res.type !== 'pane_read') return null;
        return (res as Extract<LoomResult, { type: 'pane_read' }>).read.text;
      } catch {
        return null; // dead handle / gone pane
      }
    },

    async alive(handle: SubstrateHandle): Promise<boolean> {
      const target = targetOf(handle);
      if (target == null) return false;
      try {
        const res = await client.call('agent.get', { target });
        return res.type === 'agent_info';
      } catch {
        return false; // agent/pane gone
      }
    },

    async exitCode(
      handle: SubstrateHandle
    ): Promise<number | null | undefined> {
      const target = targetOf(handle);
      if (target == null) return null; // no session ever → gone
      try {
        const res = await client.call('agent.get', { target });
        if (res.type !== 'agent_info') return null;
        const status = (res as Extract<LoomResult, { type: 'agent_info' }>)
          .agent.agent_status;
        // `done` is the only terminal-success signal loom surfaces (no OS code).
        if (status === 'done') return 0;
        // A LIVE agent (working/blocked/idle/unknown) is genuinely unfinished →
        // `undefined` (unknown), NEVER a fabricated 0.
        return undefined;
      } catch {
        return null; // probe rejected → the agent is gone
      }
    },

    async diff(
      handle: SubstrateHandle,
      baseRef: string
    ): Promise<SubstrateDiff> {
      if (!handle.worktreePath) {
        throw new Error('loom diff requires a worktree path');
      }
      const cwd = handle.worktreePath;
      const base = baseRef || 'HEAD';
      // loom has no diff verb — run HOST git over the worktree it created, using
      // the SAME shared parser the tmux/acp substrates use (identical shape).
      const [stat, patch, status] = await Promise.all([
        exec('git', ['-C', cwd, '--no-pager', 'diff', '--stat', base]),
        exec('git', ['-C', cwd, '--no-pager', 'diff', base]),
        exec('git', ['-C', cwd, 'status', '--porcelain']),
      ]);
      return buildSubstrateDiff({
        stat: stat.stdout,
        patch: patch.stdout,
        status: status.stdout,
      });
    },

    async continueRun(
      handle: SubstrateHandle,
      input: ContinueRunInput
    ): Promise<SubstrateHandle> {
      const target = targetOf(handle);
      if (target == null) {
        throw new Error('loom continueRun requires a live loom terminal id');
      }
      // ACP-style: the agent is still LIVE in its pane/worktree (unlike the tmux
      // respawn), so a new instruction is delivered as a prompt into the same
      // session. Accept the rendered `prompt`, else the shell `command`.
      const text = input.prompt ?? input.command;
      if (!text) {
        throw new Error('loom continueRun requires a prompt or command');
      }
      expectResult(
        await client.call('agent.prompt', { target, text }),
        'agent_prompted',
        'agent.prompt'
      );
      const worktreePath = input.worktreePath || handle.worktreePath;
      logger.info('loom workspace continued (prompt into live session)', {
        workspaceId: input.workspaceId,
        worktreePath,
      });
      return {
        ref: handle.ref,
        ...(worktreePath ? { worktreePath } : {}),
        sessionName: handle.sessionName,
      };
    },

    async teardown(
      handle: SubstrateHandle,
      options?: { removeIsolation?: boolean }
    ): Promise<void> {
      // `worktree.remove{force}` removes the worktree AND stops its live panes/
      // agents in one verb. When isolation must be KEPT, there is no standalone
      // agent-stop verb in the substrate slice — surface that truthfully rather
      // than pretend the agent was stopped.
      if (options?.removeIsolation === false) {
        logger.warn(
          'loom teardown skipped worktree.remove (removeIsolation:false) — agent left live',
          { ref: handle.ref }
        );
        return;
      }
      try {
        await client.call('worktree.remove', {
          workspace_id: handle.ref,
          force: true,
        });
      } catch (err) {
        // Best-effort: an already-gone workspace / unreachable daemon must not
        // throw out of teardown.
        logger.warn('loom worktree.remove failed (best effort)', {
          ref: handle.ref,
          err: message(err),
        });
      }
      logger.info('loom workspace torn down', { ref: handle.ref });
    },
  };
}
