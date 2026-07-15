/**
 * `createTmuxSubstrate` — the local `tmux_worktree` ConductorSubstrate the domain
 * wires by default: real terminals (tmux) over isolated git worktrees.
 *
 * This is the CONFIG-INJECTED port of the legacy `src/conductor/substrate-tmux.ts`
 * + `tmux-orchestrator.ts` behaviour, adapted to the `@recoder/substrate`
 * `ConductorSubstrate` contract. The load-bearing difference from the legacy impl
 * (which read `process.env.CONDUCTOR_WORKTREE_ROOT` / `TMUX_BIN` at module scope,
 * making it package-incompatible) is that `tmuxBin` + `worktreeRoot` are taken from
 * the INJECTED {@link ConductorConfig} slice — this adapter reads NO `process.env`
 * (ARCHITECTURE §10.8). The child-process seam is injected too (`exec`, default
 * `execFileSafe`) so the launch/attach/capture/kill logic is unit-testable against
 * a fake exec with no real tmux/git on the box.
 *
 * Degrade-safe & truthful: `available()` probes git + tmux and reports
 * `available:false` with the missing binary when either is absent; `launch()`
 * refuses (throws) rather than fabricate a session when the substrate is
 * unavailable; `capture()` returns `null` on a dead handle; `exitCode()` returns
 * `undefined` (unknown) while alive and NEVER a fabricated `0`.
 */
import path from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import {
  execFileSafe,
  buildSubstrateDiff,
  type ExecOptions,
  type ExecResult,
  type LoggerPort,
  type SubstrateDiff,
} from '@recoder/substrate';
import type {
  ConductorSubstrate,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '../ports/substrate-registry.port.js';
import type { ConductorConfig } from '../config.js';

/** The injectable child-process seam (default: the package's `execFileSafe`). */
export type ExecFn = (
  bin: string,
  args: readonly string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

/** tmux session names + worktree dirs are namespaced under this prefix. */
const SESSION_PREFIX = 'recoder-';

/** Deterministic tmux session name for a workspace id (restart-survivable). */
function tmuxNameFor(id: string): string {
  return `${SESSION_PREFIX}${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * tmux's remain-on-exit dead-pane banner ("Pane is dead (status 0, …)"). We keep
 * remain-on-exit ON to read `#{pane_dead_status}` for exit-code detection, so a
 * finished pane keeps showing this banner in its capture — strip it at the source.
 */
const PANE_DEAD_BANNER = /\n*[ \t]*Pane is dead \(status\s*-?\d+[^)]*\)[ \t]*/gi;

/** A no-op logger so the substrate works even when none is injected. */
const NOOP_LOGGER: LoggerPort = {
  info() {},
  warn() {},
  error() {},
};

export interface CreateTmuxSubstrateDeps {
  /** The injected conductor config slice (`tmuxBin` + `worktreeRoot`). */
  readonly config: Pick<ConductorConfig, 'tmuxBin' | 'worktreeRoot'>;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
  /** Child-process seam; defaults to the package's `execFileSafe`. */
  readonly exec?: ExecFn;
}

/**
 * Build the local `tmux_worktree` ConductorSubstrate over the injected config +
 * child-process seam. Register it via
 * `createSubstrateRegistry({ substrates: [createTmuxSubstrate(deps)] })`.
 */
export function createTmuxSubstrate(deps: CreateTmuxSubstrateDeps): ConductorSubstrate {
  const exec: ExecFn = deps.exec ?? execFileSafe;
  const logger = deps.logger ?? NOOP_LOGGER;
  // `null` config ⇒ resolve the system-PATH `tmux`; a pinned/vendored absolute path
  // wins when bootstrap injected one. NO `process.env` read here (config-injected).
  const tmuxBin = deps.config.tmuxBin ?? 'tmux';
  const worktreeRoot = deps.config.worktreeRoot;

  // Live handle → source-repo mapping captured at launch so teardown can run the
  // proper `git worktree remove`. Substrate-owned live state (never a module
  // singleton); empty after a restart ⇒ teardown falls back to a direct dir remove.
  const repoByRef = new Map<string, string>();

  /** Truthful binary presence probe (never throws; a missing bin ⇒ false). */
  async function present(bin: string, versionArg: string): Promise<boolean> {
    try {
      await exec(bin, [versionArg]);
      return true;
    } catch {
      return false;
    }
  }

  /** git + tmux availability (mirrors legacy `conductorAvailability`). */
  async function availability(): Promise<SubstrateAvailability> {
    const [git, tmux] = await Promise.all([
      present('git', '--version'),
      present(tmuxBin, '-V'),
    ]);
    if (git && tmux) return { available: true };
    const missing = [!git && 'git', !tmux && 'tmux'].filter(Boolean).join(', ');
    return {
      available: false,
      reason: `missing: ${missing}`,
      detail: { git, tmux, tmuxBin },
    };
  }

  /** Ensure `remain-on-exit` is globally on (best-effort; bootstraps a server if needed). */
  async function ensureRemainOnExit(): Promise<void> {
    try {
      await exec(tmuxBin, ['set-option', '-g', 'remain-on-exit', 'on']);
    } catch {
      // No running server yet — start a throwaway session, set the global, drop it.
      const init = `__recoder_init_${Date.now()}`;
      try {
        await exec(tmuxBin, ['new-session', '-d', '-s', init, 'true']);
        await exec(tmuxBin, ['set-option', '-g', 'remain-on-exit', 'on']);
      } catch {
        /* server bootstrap failed — per-session set below is the fallback */
      }
      try {
        await exec(tmuxBin, ['kill-session', '-t', init]);
      } catch {
        /* already gone */
      }
    }
  }

  return {
    id: 'tmux_worktree',

    capabilities(): SubstrateCapabilities {
      return {
        // Runs on the local host (not a remote sandbox).
        remote: false,
        // A real tmux pane PTY hosts the agent; live keystrokes can be injected.
        supportsPty: true,
        supportsInteractiveKeys: true,
        // Output is observed by polling capture() (the poller tailer default).
        capturesByPolling: true,
        supportsDiff: true,
        supportsIsolationRemoval: true,
      };
    },

    available(): Promise<SubstrateAvailability> {
      return availability();
    },

    async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
      const avail = await availability();
      if (!avail.available) {
        // Truthful refusal — never a fabricated session (design §8 fail-safe).
        throw new Error(`tmux_worktree unavailable (${avail.reason})`);
      }

      const branch = input.branch || `recoder/${input.workspaceId}`;
      const tmuxName = tmuxNameFor(input.workspaceId);
      const worktreePath = path.join(worktreeRoot, tmuxName);

      // Isolated worktree on its own branch — parallel agents never collide.
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

      // Prime remain-on-exit BEFORE launch so `#{pane_dead_status}` survives a clean
      // exit-0 completion (distinguishes success from crash in exitCode()).
      await ensureRemainOnExit();

      // Forward the conductor-built launch env (already assembled by the composer;
      // this adapter adds nothing from process.env). tmux only forwards env to a NEW
      // server; when one already runs, also push each var via `set-environment -g` so
      // the fresh pane picks it up regardless of when the server started.
      const env = input.env;
      if (env) {
        for (const [key, value] of Object.entries(env)) {
          try {
            await exec(tmuxBin, ['set-environment', '-g', key, value]);
          } catch {
            /* no server yet / unsupported — the exec env below covers cold start */
          }
        }
      }
      await exec(
        tmuxBin,
        ['new-session', '-d', '-s', tmuxName, '-c', worktreePath, input.command],
        env ? { env } : {},
      );

      // Per-session remain-on-exit is the deterministic guarantee (independent of the
      // server's inherited global). Best-effort: a failure only weakens exit-code
      // detection, it must not abort a successful launch.
      try {
        await exec(tmuxBin, ['set-option', '-t', tmuxName, 'remain-on-exit', 'on']);
      } catch (err) {
        logger.warn('tmux per-session remain-on-exit set failed (best effort)', {
          workspaceId: input.workspaceId,
          err: message(err),
        });
      }

      repoByRef.set(input.workspaceId, input.repoPath);
      logger.info('tmux_worktree workspace launched', {
        workspaceId: input.workspaceId,
        worktreePath,
        branch,
      });
      // ref = workspaceId (drives capture/kill); sessionName = the tmux session name.
      return { ref: input.workspaceId, worktreePath, sessionName: tmuxName };
    },

    async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
      const tmuxName = handle.sessionName ?? tmuxNameFor(handle.ref);
      try {
        const { stdout } = await exec(tmuxBin, [
          'capture-pane',
          '-p',
          '-t',
          tmuxName,
          '-S',
          `-${lines}`,
        ]);
        const cleaned = stdout
          .replace(PANE_DEAD_BANNER, '')
          .replace(/[ \t]+\n/g, '\n')
          .trimEnd();
        return cleaned ? cleaned + '\n' : '';
      } catch {
        return null; // handle gone
      }
    },

    async alive(handle: SubstrateHandle): Promise<boolean> {
      const tmuxName = handle.sessionName ?? tmuxNameFor(handle.ref);
      try {
        await exec(tmuxBin, ['has-session', '-t', tmuxName]);
      } catch {
        return false; // session entirely gone
      }
      // Session exists — with remain-on-exit a dead pane keeps it alive; check the pane.
      try {
        const { stdout: dead } = await exec(tmuxBin, [
          'display-message',
          '-p',
          '-t',
          tmuxName,
          '#{pane_dead}',
        ]);
        return dead.trim() !== '1';
      } catch {
        return true; // can't query pane state — assume alive (safe default)
      }
    },

    async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
      const tmuxName = handle.sessionName ?? tmuxNameFor(handle.ref);
      try {
        await exec(tmuxBin, ['has-session', '-t', tmuxName]);
      } catch {
        return null; // session entirely gone (already killed)
      }
      try {
        const { stdout: dead } = await exec(tmuxBin, [
          'display-message',
          '-p',
          '-t',
          tmuxName,
          '#{pane_dead}',
        ]);
        if (dead.trim() !== '1') return undefined; // still alive → unknown (NEVER 0)
        const { stdout: status } = await exec(tmuxBin, [
          'display-message',
          '-p',
          '-t',
          tmuxName,
          '#{pane_dead_status}',
        ]);
        const code = Number.parseInt(status.trim(), 10);
        return Number.isNaN(code) ? 0 : code;
      } catch {
        return null; // can't query → treat as gone
      }
    },

    async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
      if (!handle.worktreePath) {
        throw new Error('tmux_worktree diff requires a worktree path');
      }
      const cwd = handle.worktreePath;
      const base = baseRef || 'HEAD';
      const [stat, patch, status] = await Promise.all([
        exec('git', ['-C', cwd, '--no-pager', 'diff', '--stat', base]),
        exec('git', ['-C', cwd, '--no-pager', 'diff', base]),
        exec('git', ['-C', cwd, 'status', '--porcelain']),
      ]);
      // Same shared parser the local + remote substrates use — identical shape.
      return buildSubstrateDiff({
        stat: stat.stdout,
        patch: patch.stdout,
        status: status.stdout,
      });
    },

    async teardown(
      handle: SubstrateHandle,
      options?: { removeIsolation?: boolean },
    ): Promise<void> {
      const tmuxName = handle.sessionName ?? tmuxNameFor(handle.ref);
      try {
        await exec(tmuxBin, ['kill-session', '-t', tmuxName]);
      } catch {
        /* already gone */
      }
      if (options?.removeIsolation !== false) {
        const repo = repoByRef.get(handle.ref);
        const wtPath = handle.worktreePath ?? path.join(worktreeRoot, tmuxName);
        if (repo) {
          try {
            await exec('git', ['-C', repo, 'worktree', 'remove', '--force', wtPath]);
          } catch (err) {
            logger.warn('tmux worktree remove failed (best effort)', {
              ref: handle.ref,
              err: message(err),
            });
          }
        } else if (existsSync(wtPath)) {
          // No source-repo ref (post-restart) — remove the worktree dir directly.
          try {
            rmSync(wtPath, { recursive: true, force: true });
          } catch {
            /* best effort */
          }
        }
      }
      repoByRef.delete(handle.ref);
      logger.info('tmux_worktree workspace torn down', { ref: handle.ref });
    },
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
