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
 *
 * Git-hygiene safety (clean-room, design lineage: herdr's `src/worktree.rs`
 * `run_worktree_add_command` + `leftover_worktree_checkout_matches_repo`,
 * Apache-2.0 — design only, no code copied):
 *  - launch NEVER uses `git worktree add -B` (which force-resets an existing
 *    branch ref to the start point = silent commit loss); it probes `show-ref`
 *    and checks out an existing branch as-is, else creates a fresh one with `-b`.
 *  - restart-cleanup NEVER `rmSync`s a checkout dir until it is verified to be a
 *    genuine git worktree checkout (a `gitdir:` pointer into `<common>/worktrees/`);
 *    an unverifiable path is skipped + logged, never deleted.
 */
import path from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  execFileSafe,
  buildSubstrateDiff,
  shellQuote,
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
// The `recoder-<id>` naming contract is single-sourced (golden-locked) here.
import { tmuxNameFor } from '../session-naming.js';

/** The injectable child-process seam (default: the package's `execFileSafe`). */
export type ExecFn = (
  bin: string,
  args: readonly string[],
  options?: ExecOptions
) => Promise<ExecResult>;

/**
 * tmux's remain-on-exit dead-pane banner ("Pane is dead (status 0, …)"). We keep
 * remain-on-exit ON to read `#{pane_dead_status}` for exit-code detection, so a
 * finished pane keeps showing this banner in its capture — strip it at the source.
 */
const PANE_DEAD_BANNER =
  /\n*[ \t]*Pane is dead \(status\s*-?\d+[^)]*\)[ \t]*/gi;

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
export function createTmuxSubstrate(
  deps: CreateTmuxSubstrateDeps
): ConductorSubstrate {
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

  /**
   * Durable local run-state lives beside (never inside) agent worktrees, so the
   * exit marker survives a short-lived tmux pane without appearing in Git diff.
   * The filename is derived only from Recoder's validated workspace id contract.
   */
  function exitSentinelFor(workspaceId: string): string {
    return path.join(
      worktreeRoot,
      '.run-state',
      `${tmuxNameFor(workspaceId)}.exit`
    );
  }

  /** Read a complete POSIX process exit code; absent/partial markers are unknown. */
  function readExitSentinel(workspaceId: string): number | undefined {
    try {
      const raw = readFileSync(exitSentinelFor(workspaceId), 'utf8').trim();
      if (!/^\d{1,3}$/.test(raw)) return undefined;
      const code = Number.parseInt(raw, 10);
      return code >= 0 && code <= 255 ? code : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Run the generated CLI command in a subshell, then atomically persist its real
   * status before exiting with that same status. A command-local `exit`/`set -e`
   * cannot bypass the outer recorder. Paths are POSIX-quoted at the single shared
   * shell-quoting choke point.
   */
  function withExitSentinel(command: string, workspaceId: string): string {
    const exitFile = exitSentinelFor(workspaceId);
    const pending = `${exitFile}.pending`;
    return [
      `( ${command} )`,
      '__recoder_exit_code=$?',
      `mkdir -p ${shellQuote(path.dirname(exitFile))}`,
      `printf '%s\\n' "$__recoder_exit_code" > ${shellQuote(pending)}`,
      `mv ${shellQuote(pending)} ${shellQuote(exitFile)}`,
      'exit "$__recoder_exit_code"',
    ].join('; ');
  }

  /** A new turn must never inherit the previous turn's completed marker. */
  function clearExitSentinel(workspaceId: string): void {
    rmSync(exitSentinelFor(workspaceId), { force: true });
    rmSync(`${exitSentinelFor(workspaceId)}.pending`, { force: true });
  }

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

  /**
   * Truthful local-branch existence probe via `git show-ref --verify --quiet
   * refs/heads/<branch>`. Resolves (exit 0) ⇒ the branch exists; ANY rejection
   * (exit 1 = absent, or a probe error) ⇒ treated as ABSENT so the caller creates
   * a fresh branch with `-b`. This never force-resets: if the branch somehow
   * exists but the probe errored, `-b` fails loudly rather than silently
   * discarding the branch's commits.
   */
  async function branchExists(repo: string, branch: string): Promise<boolean> {
    try {
      await exec('git', [
        '-C',
        repo,
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${branch}`,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify a checkout dir is genuinely one of git's worktree checkouts BEFORE any
   * recursive delete: its `.git` must be a FILE holding a `gitdir:` pointer that
   * resolves INTO the repo's `<git-common-dir>/worktrees/` admin area. Guards the
   * post-restart `rmSync` fallback from ever deleting an unrelated/user directory
   * when the source-repo ref is absent. Returns `false` (skip the delete) on ANY
   * ambiguity — never fabricate a "safe to delete" signal.
   */
  async function isRepoWorktreeCheckout(wtPath: string): Promise<boolean> {
    // A worktree checkout's `.git` is a FILE (not a dir) with a `gitdir:` pointer.
    let pointer: string;
    try {
      pointer = readFileSync(path.join(wtPath, '.git'), 'utf8');
    } catch {
      return false; // no `.git` file (plain dir / bare repo / user dir) → skip
    }
    const gitdirLine = pointer
      .split('\n')
      .map(line => line.trim())
      .find(line => line.startsWith('gitdir:'));
    if (!gitdirLine) return false;
    const gitdirRaw = gitdirLine.slice('gitdir:'.length).trim();
    if (!gitdirRaw) return false;
    const gitdir = path.resolve(wtPath, gitdirRaw);
    // Authoritative common dir from the checkout itself (shared with its repo).
    let commonDir: string;
    try {
      const { stdout } = await exec('git', [
        '-C',
        wtPath,
        'rev-parse',
        '--git-common-dir',
      ]);
      const trimmed = stdout.trim();
      if (!trimmed) return false;
      commonDir = path.resolve(wtPath, trimmed);
    } catch {
      return false; // not inside a git repo at all → skip
    }
    // The gitdir MUST live under `<common>/worktrees/` (git's per-worktree admin).
    const worktreesAdmin = path.join(commonDir, 'worktrees') + path.sep;
    return (gitdir + path.sep).startsWith(worktreesAdmin);
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
      clearExitSentinel(input.workspaceId);

      // Isolated worktree on its own branch — parallel agents never collide.
      // NEVER `-B` (it force-resets an EXISTING branch ref to the start point =
      // silent commit loss). Probe first: an existing branch is checked out AS-IS
      // (no reset); a missing branch is created fresh with `-b` off the base ref.
      const worktreeAddArgs = (await branchExists(input.repoPath, branch))
        ? ['-C', input.repoPath, 'worktree', 'add', worktreePath, branch]
        : [
            '-C',
            input.repoPath,
            'worktree',
            'add',
            '-b',
            branch,
            worktreePath,
            input.baseRef || 'HEAD',
          ];
      await exec('git', worktreeAddArgs);

      // Prime remain-on-exit BEFORE launch so `#{pane_dead_status}` survives a clean
      // exit-0 completion (distinguishes success from crash in exitCode()).
      await ensureRemainOnExit();

      // Forward the conductor-built launch env (already assembled by the composer;
      // this adapter adds nothing from process.env). tmux only forwards env to a NEW
      // server; when one already runs, also push each var via `set-environment -g` so
      // the fresh pane picks it up regardless of when the server started.
      // Always propagate the backend's login-shell-merged PATH into the tmux server
      // env so agent CLIs (claude/codex) resolve; a fresh pane otherwise inherits a
      // minimal PATH and dies with "command not found". Idempotent, best-effort.
      try {
        await exec(tmuxBin, [
          'set-environment',
          '-g',
          'PATH',
          process.env.PATH ?? '',
        ]);
      } catch {
        /* no server yet / unsupported — the exec env below covers cold start */
      }
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
        [
          'new-session',
          '-d',
          '-s',
          tmuxName,
          '-c',
          worktreePath,
          withExitSentinel(input.command, input.workspaceId),
        ],
        env ? { env } : {}
      );

      // Some tmux builds can print a socket-creation error yet still return exit
      // status 0 from `new-session` (observed on macOS when a managed sandbox
      // denies the default Unix socket). Do not turn that false zero into a
      // fabricated running workspace: prove the named session exists before the
      // handle escapes. Roll back only the worktree checkout on failure; preserve
      // the branch ref so a retry cannot discard work from an earlier attempt.
      try {
        await exec(tmuxBin, ['has-session', '-t', tmuxName]);
      } catch (err) {
        try {
          await exec('git', [
            '-C',
            input.repoPath,
            'worktree',
            'remove',
            '--force',
            worktreePath,
          ]);
        } catch (cleanupErr) {
          logger.warn('tmux launch rollback could not remove worktree', {
            workspaceId: input.workspaceId,
            worktreePath,
            err: message(cleanupErr),
          });
        }
        throw new Error(
          `tmux session ${tmuxName} did not materialize after launch: ${message(err)}`
        );
      }

      // Per-session remain-on-exit is the deterministic guarantee (independent of the
      // server's inherited global). Best-effort: a failure only weakens exit-code
      // detection, it must not abort a successful launch.
      try {
        await exec(tmuxBin, [
          'set-option',
          '-t',
          tmuxName,
          'remain-on-exit',
          'on',
        ]);
      } catch (err) {
        logger.warn(
          'tmux per-session remain-on-exit set failed (best effort)',
          {
            workspaceId: input.workspaceId,
            err: message(err),
          }
        );
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

    async continueRun(
      handle: SubstrateHandle,
      input: ContinueRunInput
    ): Promise<SubstrateHandle> {
      const worktreePath = input.worktreePath || handle.worktreePath;
      if (!worktreePath)
        throw new Error(
          'tmux_worktree continueRun requires an existing worktree'
        );
      if (!input.command)
        throw new Error('tmux_worktree continueRun requires a command');
      const tmuxName = handle.sessionName ?? tmuxNameFor(handle.ref);
      clearExitSentinel(handle.ref);
      // Reuse the EXISTING worktree (the prior run's changes are intact); replace
      // the finished session with a fresh one running the new instruction in place.
      try {
        await exec(tmuxBin, ['kill-session', '-t', tmuxName]);
      } catch {
        /* prior session already gone */
      }
      await ensureRemainOnExit();
      // Always propagate the backend's login-shell-merged PATH into the tmux server
      // env so agent CLIs (claude/codex) resolve; a fresh pane otherwise inherits a
      // minimal PATH and dies with "command not found". Idempotent, best-effort.
      try {
        await exec(tmuxBin, [
          'set-environment',
          '-g',
          'PATH',
          process.env.PATH ?? '',
        ]);
      } catch {
        /* no server yet / unsupported — the exec env below covers cold start */
      }
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
        [
          'new-session',
          '-d',
          '-s',
          tmuxName,
          '-c',
          worktreePath,
          withExitSentinel(input.command, handle.ref),
        ],
        env ? { env } : {}
      );
      try {
        await exec(tmuxBin, ['has-session', '-t', tmuxName]);
      } catch (err) {
        throw new Error(
          `tmux session ${tmuxName} did not materialize after continue: ${message(err)}`
        );
      }
      try {
        await exec(tmuxBin, [
          'set-option',
          '-t',
          tmuxName,
          'remain-on-exit',
          'on',
        ]);
      } catch (err) {
        logger.warn(
          'tmux per-session remain-on-exit set failed (best effort)',
          {
            workspaceId: input.workspaceId,
            err: message(err),
          }
        );
      }
      logger.info(
        'tmux_worktree workspace continued (new run in same worktree)',
        {
          workspaceId: input.workspaceId,
          worktreePath,
        }
      );
      return { ref: handle.ref, worktreePath, sessionName: tmuxName };
    },

    async capture(
      handle: SubstrateHandle,
      lines = 200
    ): Promise<string | null> {
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
      // The wrapper writes this BEFORE its shell exits, so it remains authoritative
      // even when tmux removes the pane/session before the next 3s poll.
      if (readExitSentinel(handle.ref) !== undefined) return false;
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

    async exitCode(
      handle: SubstrateHandle
    ): Promise<number | null | undefined> {
      const persisted = readExitSentinel(handle.ref);
      if (persisted !== undefined) return persisted;
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
        return Number.isNaN(code) ? undefined : code;
      } catch {
        return null; // can't query → treat as gone
      }
    },

    async diff(
      handle: SubstrateHandle,
      baseRef: string
    ): Promise<SubstrateDiff> {
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
      options?: { removeIsolation?: boolean }
    ): Promise<void> {
      const tmuxName = handle.sessionName ?? tmuxNameFor(handle.ref);
      try {
        await exec(tmuxBin, ['kill-session', '-t', tmuxName]);
      } catch {
        /* already gone */
      }
      clearExitSentinel(handle.ref);
      if (options?.removeIsolation !== false) {
        const repo = repoByRef.get(handle.ref);
        const wtPath = handle.worktreePath ?? path.join(worktreeRoot, tmuxName);
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
            logger.warn('tmux worktree remove failed (best effort)', {
              ref: handle.ref,
              err: message(err),
            });
          }
        } else if (existsSync(wtPath)) {
          // No source-repo ref (post-restart) — remove the worktree dir directly,
          // but ONLY after verifying it is genuinely one of git's worktree
          // checkouts. Never `rmSync` an unrelated/user dir: an unverifiable path
          // is skipped + logged truthfully rather than deleted.
          if (await isRepoWorktreeCheckout(wtPath)) {
            try {
              rmSync(wtPath, { recursive: true, force: true });
            } catch {
              /* best effort */
            }
          } else {
            logger.warn(
              'tmux worktree remove skipped — path is not a verified git worktree checkout',
              { ref: handle.ref, wtPath }
            );
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
