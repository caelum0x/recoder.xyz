/**
 * `createAcpSubstrate` — a local ConductorSubstrate that runs an ACP agent
 * (`claude-code-acp` / `codex-acp`) over an isolated git worktree, driving it via
 * the {@link AcpAgentDriver} (JSON-RPC over stdio) instead of a tmux PTY.
 *
 * It maps the session-based ACP protocol onto the stateless-handle
 * {@link ConductorSubstrate} contract:
 *  - `launch`  = `git worktree add` (identical to the tmux substrate) → spawn the
 *    agent → `initialize` → `session/new(cwd=worktree)` → fire `session/prompt`
 *    (the task) in the BACKGROUND, buffering `session/update` text for `capture`;
 *  - `capture` = the last N lines of that streamed buffer (polling tailer);
 *  - `alive`   = the agent turn is still running (process up, prompt unresolved);
 *  - `exitCode`= `0` on a clean `end_turn`, the process exit code on a crash,
 *    `undefined` (unknown) while still running — NEVER a fabricated `0`;
 *  - `diff`    = git diff of the worktree (the agent edits files in it, so the
 *    same git-native diff the tmux substrate uses works verbatim);
 *  - `teardown`= stop the agent + `git worktree remove`.
 *
 * Config-injected (NO `process.env` read here — ARCHITECTURE §10.8); the spawn +
 * exec + permission seams are injectable so it is unit-tested with a fake agent
 * and fake git. Degrade-truthful: an unavailable substrate refuses to launch, a
 * dead handle captures `null`. Agent-initiated requests (permission + delegated
 * `fs/*`) are handled by {@link createAcpClientRequestHandler}, bound per-launch
 * to the worktree: permissions use the worktree-isolation policy by default (or an
 * injected `resolvePermission` gate bridge), and fs reads/writes are path-CONTAINED
 * to that worktree — the isolation boundary is enforced, never trusted.
 */
import path from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import {
  execFileSafe,
  which,
  buildSubstrateDiff,
  type ExecOptions,
  type ExecResult,
  type LoggerPort,
  type SubstrateDiff,
} from '@recoder/substrate';
import type {
  ConductorSubstrate,
  ContinueRunInput,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '../ports/substrate-registry.port.js';
import type { ConductorConfig } from '../config.js';
import { tmuxNameFor } from '../session-naming.js';
import { AcpAgentDriver, type AcpProcess } from './acp/acp-driver.js';
import { makeAcpProcess } from './acp/acp-process.js';
import type { AcpNotification } from './acp/acp-codec.js';
import {
  createAcpClientRequestHandler,
  type AcpPermissionContext,
  type AcpPermissionDecision,
} from './acp/acp-client-requests.js';
import { structuredUpdateLine } from './acp/acp-session-update.js';

export type ExecFn = (
  bin: string,
  args: readonly string[],
  options?: ExecOptions
) => Promise<ExecResult>;

/** The default ACP agent binary (Zed's Claude Code ACP adapter). */
export const DEFAULT_ACP_COMMAND = 'claude-code-acp';
/** Bound the per-handle output buffer so a chatty agent can't grow unbounded. */
const MAX_BUFFER_LINES = 4000;

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

export interface CreateAcpSubstrateDeps {
  readonly config: Pick<ConductorConfig, 'worktreeRoot'>;
  readonly logger?: LoggerPort;
  /** Child-process seam for git worktree ops; defaults to the package's execFileSafe. */
  readonly exec?: ExecFn;
  /** The ACP agent binary; defaults to `claude-code-acp`. */
  readonly command?: string;
  /** Spawn seam (default: the real child_process-backed AcpProcess); injected in tests. */
  readonly spawn?: (opts: {
    command: string;
    cwd: string;
    env?: NodeJS.ProcessEnv;
  }) => AcpProcess;
  /**
   * Resolve an agent permission request (`session/request_permission`) to
   * allow/deny — the composer injects a bridge to the approval gate here. Default:
   * the worktree-isolation policy (allow in-worktree work, deny shell/network/
   * unknown). The correct ACP outcome is formed by the client-request handler.
   */
  readonly resolvePermission?: (
    ctx: AcpPermissionContext
  ) => Promise<AcpPermissionDecision> | AcpPermissionDecision;
  /** PATH-presence probe (default: `which`); injected in tests to avoid a real binary. */
  readonly probe?: (bin: string) => Promise<boolean>;
}

/** Per-handle live state — the ACP driver + its streamed output + turn status. */
interface AcpRunState {
  readonly driver: AcpAgentDriver;
  readonly output: string[];
  readonly repoPath: string;
  readonly worktreePath: string;
  sessionId: string;
  done: boolean;
  exit: number | null;
}

/** Best-effort text extraction from a `session/update` notification (any nested `text`). */
export function extractUpdateText(params: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') return;
    if (Array.isArray(v)) {
      for (const e of v) walk(e);
      return;
    }
    if (v == null || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') out.push(o.text);
    for (const key of Object.keys(o)) {
      if (key !== 'text') walk(o[key]);
    }
  };
  walk(params);
  return out.join('');
}

export function createAcpSubstrate(
  deps: CreateAcpSubstrateDeps
): ConductorSubstrate {
  const exec: ExecFn = deps.exec ?? execFileSafe;
  const logger = deps.logger ?? NOOP_LOGGER;
  const worktreeRoot = deps.config.worktreeRoot;
  const command = deps.command ?? DEFAULT_ACP_COMMAND;
  const spawnProcess = deps.spawn ?? (opts => makeAcpProcess(opts));

  const byRef = new Map<string, AcpRunState>();

  const present: (bin: string) => Promise<boolean> =
    deps.probe ??
    (async bin => {
      try {
        return Boolean(await which(bin));
      } catch {
        return false;
      }
    });

  function appendOutput(state: AcpRunState, text: string): void {
    if (text === '') return;
    for (const line of text.split('\n')) state.output.push(line);
    if (state.output.length > MAX_BUFFER_LINES) {
      state.output.splice(0, state.output.length - MAX_BUFFER_LINES);
    }
  }

  return {
    id: 'acp',

    capabilities(): SubstrateCapabilities {
      return {
        remote: false,
        // ACP is JSON-RPC over stdio, NOT a PTY — no live keystroke injection.
        supportsPty: false,
        supportsInteractiveKeys: false,
        // Output is streamed into a buffer and read by the polling tailer.
        capturesByPolling: true,
        supportsDiff: true,
        supportsIsolationRemoval: true,
      };
    },

    async available(): Promise<SubstrateAvailability> {
      const [git, agent] = await Promise.all([
        present('git'),
        present(command),
      ]);
      if (git && agent) return { available: true };
      const missing = [!git && 'git', !agent && command]
        .filter(Boolean)
        .join(', ');
      return {
        available: false,
        reason: `missing: ${missing}`,
        detail: { git, agent, command },
      };
    },

    async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
      const avail = await this.available();
      if (!avail.available) {
        throw new Error(`acp unavailable (${avail.reason})`);
      }
      const branch = input.branch || `recoder/${input.workspaceId}`;
      const name = tmuxNameFor(input.workspaceId);
      const worktreePath = path.join(worktreeRoot, name);

      // Isolated worktree on its own branch — same as tmux, so parallel agents
      // (ACP or PTY) never collide.
      await exec('git', [
        '-C',
        input.repoPath,
        'worktree',
        'add',
        '-B',
        branch,
        worktreePath,
        input.baseRef || 'HEAD',
      ]);

      const state: AcpRunState = {
        driver: null as unknown as AcpAgentDriver,
        output: [],
        repoPath: input.repoPath,
        worktreePath,
        sessionId: '',
        done: false,
        exit: null,
      };
      // The agent→client request handler, bound to THIS workspace's worktree:
      // permission decisions (policy or injected gate) + path-CONTAINED fs reads/
      // writes (the agent may delegate them per the advertised fs capabilities).
      const onRequest = createAcpClientRequestHandler({
        workspaceId: input.workspaceId,
        workspaceRoot: worktreePath,
        ...(deps.resolvePermission
          ? { resolvePermission: deps.resolvePermission }
          : {}),
        warn: (m, meta) =>
          logger.warn(m, { workspaceId: input.workspaceId, meta }),
      });
      const driver = new AcpAgentDriver({
        spawn: () =>
          spawnProcess({
            command,
            cwd: worktreePath,
            ...(input.env ? { env: { ...process.env, ...input.env } } : {}),
          }),
        onNotification: (n: AcpNotification) => {
          // Streaming text goes into the buffer verbatim; a DISCRETE structured
          // update (tool-call lifecycle / plan) additionally appends a one-line
          // marker, so the transcript shows WHAT the agent is doing, not just its
          // prose. Both ride the existing poll-tailer (which carries run context).
          appendOutput(state, extractUpdateText(n.params));
          appendOutput(state, structuredUpdateLine(n.params));
        },
        onRequest,
        warn: m => logger.warn(m, { workspaceId: input.workspaceId }),
      });
      (state as { driver: AcpAgentDriver }).driver = driver;
      byRef.set(input.workspaceId, state);

      // Handshake + session, then fire the task prompt in the BACKGROUND so launch
      // returns a handle promptly (the poller tails `capture` for progress).
      await driver.start();
      state.sessionId = await driver.newSession(worktreePath);
      void driver
        .prompt(state.sessionId, input.command)
        .then(stopReason => {
          state.done = true;
          // A clean turn end is success (0); any other stop reason is a truthful non-zero.
          state.exit = stopReason === 'end_turn' ? 0 : 1;
          appendOutput(state, `\n[acp: turn ended — ${stopReason}]`);
        })
        .catch(err => {
          state.done = true;
          state.exit = 1;
          appendOutput(
            state,
            `\n[acp: turn failed — ${err instanceof Error ? err.message : String(err)}]`
          );
        });

      logger.info('acp workspace launched', {
        workspaceId: input.workspaceId,
        worktreePath,
        branch,
      });
      return { ref: input.workspaceId, worktreePath, sessionName: name };
    },

    async continueRun(
      handle: SubstrateHandle,
      input: ContinueRunInput
    ): Promise<SubstrateHandle> {
      const state = byRef.get(handle.ref);
      if (!state)
        throw new Error('acp continueRun requires a live launched session');
      // ACP is in-process style — it accepts a rendered `prompt`; fall back to the
      // shell `command` field so either launch shape can drive the next turn.
      const instruction = input.prompt ?? input.command;
      if (!instruction)
        throw new Error('acp continueRun requires a prompt or command');
      // Reuse the SAME session (the prior turn's worktree changes are intact).
      state.done = false;
      state.exit = null;
      void state.driver
        .prompt(state.sessionId, instruction)
        .then(stopReason => {
          state.done = true;
          state.exit = stopReason === 'end_turn' ? 0 : 1;
        })
        .catch(() => {
          state.done = true;
          state.exit = 1;
        });
      return {
        ref: handle.ref,
        worktreePath: state.worktreePath,
        sessionName: handle.sessionName ?? tmuxNameFor(handle.ref),
      };
    },

    async capture(
      handle: SubstrateHandle,
      lines = 200
    ): Promise<string | null> {
      const state = byRef.get(handle.ref);
      if (!state) return null;
      const tail = state.output.slice(-lines).join('\n').trimEnd();
      return tail ? tail + '\n' : '';
    },

    async alive(handle: SubstrateHandle): Promise<boolean> {
      const state = byRef.get(handle.ref);
      return state ? !state.done : false;
    },

    async exitCode(
      handle: SubstrateHandle
    ): Promise<number | null | undefined> {
      const state = byRef.get(handle.ref);
      if (!state) return null; // gone
      if (!state.done) return undefined; // still running — unknown, NEVER 0
      return state.exit;
    },

    async diff(
      handle: SubstrateHandle,
      baseRef: string
    ): Promise<SubstrateDiff> {
      if (!handle.worktreePath)
        throw new Error('acp diff requires a worktree path');
      const cwd = handle.worktreePath;
      const base = baseRef || 'HEAD';
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

    async teardown(
      handle: SubstrateHandle,
      options?: { removeIsolation?: boolean }
    ): Promise<void> {
      const state = byRef.get(handle.ref);
      if (state) {
        try {
          state.driver.stop();
        } catch {
          /* best effort */
        }
      }
      if (options?.removeIsolation !== false) {
        const repo = state?.repoPath;
        const wtPath =
          handle.worktreePath ??
          state?.worktreePath ??
          path.join(worktreeRoot, tmuxNameFor(handle.ref));
        if (repo) {
          try {
            await exec('git', [
              '-C',
              repo,
              'worktree',
              'remove',
              '--force',
              wtPath,
            ]);
          } catch (err) {
            logger.warn('acp worktree remove failed (best effort)', {
              ref: handle.ref,
              err: message(err),
            });
          }
        } else if (existsSync(wtPath)) {
          try {
            rmSync(wtPath, { recursive: true, force: true });
          } catch {
            /* best effort */
          }
        }
      }
      byRef.delete(handle.ref);
      logger.info('acp workspace torn down', { ref: handle.ref });
    },
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
