/**
 * createSshSubstrate — the durable-SSH remote ConductorSubstrate (`ssh`).
 *
 * A sibling of `createDaytonaSubstrate` that satisfies the SAME contract but
 * executes over an injected `SshExecPort` instead of the Daytona client port, so
 * `@recoder/substrate` gains a remote-host path WITHOUT opening real sockets in
 * the engine. A real transport shells `ssh -o BatchMode=yes <host> <command>`
 * over Wave's durable SSH session (which survives reconnects), so the remote
 * git worktree + tmux session outlive network drops.
 *
 * Model (remote-host, persistent — unlike Daytona's per-run sandbox):
 *   - The remote host already has a base git repo at `config.repoPath`.
 *   - launch() adds a per-workspace git WORKTREE under `config.worktreeRoot`,
 *     then starts the SAME resolved headless `command` inside a DURABLE tmux
 *     session, redirected to `.recoder/agent.log` with an `.recoder/agent.exit`
 *     sentinel — the identical observability the Daytona substrate uses.
 *   - capture() tails `.recoder/agent.log`.
 *   - alive() / exitCode() read the `.recoder/agent.exit` sentinel and —
 *     critically — treat a transient/unreachable probe as "still alive / unknown",
 *     NEVER as a finished workspace (the blip-must-not-finalize invariant).
 *   - diff() runs git INSIDE the remote worktree and feeds the SAME shared parser
 *     (`buildSubstrateDiff`) the local + Daytona substrates use.
 *   - teardown() best-effort kills the tmux session and (optionally) removes the
 *     worktree.
 *
 * DEGRADE-SAFE: with no transport / an unreachable host, available() reports
 * `available:false` (the selector degrades to the local substrate), the liveness
 * probes never throw, and launch surfaces a truthful error rather than returning
 * a fake provisioned handle. It never fakes readiness or success.
 *
 * NOTE: runtime verification requires a reachable SSH host with a base repo; the
 * marker-parsing + degrade logic is unit-tested against a fake SshExecPort.
 */
import { buildSubstrateDiff } from '../review/index.js';
import type {
  ConductorSubstrate,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateDiff,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '../contract/index.js';
import type { SshExecPort } from '../ports/ssh-exec.port.js';
import type { LoggerPort } from '../ports/logger.port.js';

const LOG_REL = '.recoder/agent.log';
const EXIT_REL = '.recoder/agent.exit';

/** Single-quote a value for safe interpolation into a remote `sh -c` command. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** First non-empty line of remote output, for compact truthful error messages. */
function firstLine(text: string): string {
  return (text.split('\n').find((l) => l.trim().length > 0) ?? '').trim();
}

/** A no-op logger so the substrate works even when none is injected. */
const NOOP_LOGGER: LoggerPort = {
  info() {},
  warn() {},
  error() {},
};

/** Static config for the SSH target, resolved from env by the wiring layer. */
export interface SshSubstrateConfig {
  /** SSH host (or `user@host`) the transport connects to — for logging/gate. */
  host: string;
  /** Remote path to the base git repo that worktrees branch from. */
  repoPath: string;
  /** Remote directory under which per-workspace worktrees are created. */
  worktreeRoot: string;
}

export interface CreateSshSubstrateDeps {
  /** Injected durable-SSH transport (the backend adapter wraps the real client). */
  exec: SshExecPort;
  /** SSH target config (host + remote repo + worktree root). */
  config: SshSubstrateConfig;
  /** Structured logger; defaults to a no-op. */
  logger?: LoggerPort;
}

/** Per-workspace remote layout derived from a handle/launch input. */
function worktreeDirFor(config: SshSubstrateConfig, workspaceId: string): string {
  return `${config.worktreeRoot}/${workspaceId}`;
}

/** Durable tmux session name for a workspace. */
function sessionFor(workspaceId: string): string {
  return `recoder-${workspaceId}`;
}

/**
 * Build the `ssh` ConductorSubstrate over an injected SshExecPort.
 *
 * Register it via `createSubstrateRegistry({ substrates: [..., createSshSubstrate(deps)] })`,
 * or use `registerSshSubstrate(registry, ...)` to register it ONLY when SSH env
 * is configured. The factory never invents a stub, so an unregistered `'ssh'`
 * fails truthfully.
 */
export function createSshSubstrate(deps: CreateSshSubstrateDeps): ConductorSubstrate {
  const exec = deps.exec;
  const config = deps.config;
  const logger = deps.logger ?? NOOP_LOGGER;

  const configured = (): boolean =>
    exec.isConfigured() && config.host.length > 0 && config.repoPath.length > 0;

  return {
    id: 'ssh',

    capabilities(): SubstrateCapabilities {
      return {
        // Runs off-machine on a remote SSH host, not on the local host.
        remote: true,
        // The agent runs inside a durable tmux pane (a real PTY exists)...
        supportsPty: true,
        // ...but we launch it as a one-shot command; live keystroke injection
        // (tmux send-keys) is not wired, so we report it truthfully.
        supportsInteractiveKeys: false,
        // Output is observed by polling capture(), not streamed.
        capturesByPolling: true,
        supportsDiff: true,
        supportsIsolationRemoval: true,
      };
    },

    async available(): Promise<SubstrateAvailability> {
      if (!configured()) {
        return {
          available: false,
          reason: 'SSH substrate not configured (RECODER_SSH_HOST / RECODER_SSH_REPO_PATH / ssh binary)',
        };
      }
      try {
        // Cheap reachability probe over the durable SSH session.
        const res = await exec.run('true', { timeoutSecs: 15 });
        const ok = res.exitCode === 0;
        return {
          available: ok,
          reason: ok ? undefined : `SSH host ${config.host} unreachable (exit ${res.exitCode})`,
        };
      } catch (err) {
        return {
          available: false,
          reason: err instanceof Error ? err.message : `SSH host ${config.host} unreachable`,
        };
      }
    },

    async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
      const worktreeDir = worktreeDirFor(config, input.workspaceId);
      const session = sessionFor(input.workspaceId);
      const dotRecoder = `${worktreeDir}/.recoder`;
      const logFile = `${worktreeDir}/${LOG_REL}`;
      const exitFile = `${worktreeDir}/${EXIT_REL}`;
      const base = input.baseRef && input.baseRef !== 'HEAD' ? input.baseRef : 'HEAD';

      // 1) Provision isolation: a per-workspace git worktree on the remote host.
      const provision = [
        `git -C ${q(config.repoPath)} worktree add -f -B ${q(input.branch)} ${q(worktreeDir)} ${q(base)}`,
        `mkdir -p ${q(dotRecoder)}`,
      ].join(' && ');
      const prov = await exec.run(provision, { timeoutSecs: 120 });
      if (prov.exitCode !== 0) {
        // Never return a fake handle — surface the provisioning failure truthfully.
        throw new Error(
          `ssh worktree provision failed on ${config.host} (exit ${prov.exitCode}): ${firstLine(prov.stderr || prov.stdout)}`,
        );
      }

      // 2) Launch the SAME resolved command inside a durable tmux session, with a
      //    log file + exit sentinel (identical observability to the Daytona path).
      const inner = `{ ${input.command}; echo $? > ${q(exitFile)}; } > ${q(logFile)} 2>&1`;
      const startTmux = `tmux new-session -d -s ${q(session)} -c ${q(worktreeDir)} ${q(inner)}`;
      const started = await exec.run(startTmux, { timeoutSecs: 30 });
      if (started.exitCode !== 0) {
        // Best-effort cleanup of the half-provisioned worktree, then surface truthfully.
        await exec
          .run(`git -C ${q(config.repoPath)} worktree remove -f ${q(worktreeDir)} 2>/dev/null || true`)
          .catch(() => {});
        throw new Error(
          `ssh tmux launch failed on ${config.host} (exit ${started.exitCode}): ${firstLine(started.stderr || started.stdout)}`,
        );
      }

      logger.info('ssh workspace launched', {
        workspaceId: input.workspaceId,
        host: config.host,
        session,
        worktreeDir,
      });
      return { ref: session, worktreePath: worktreeDir, sessionName: session };
    },

    async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
      try {
        const logFile = `${handle.worktreePath}/${LOG_REL}`;
        const res = await exec.run(`tail -n ${lines} ${q(logFile)} 2>/dev/null || true`, {
          timeoutSecs: 30,
        });
        return res.stdout ?? '';
      } catch {
        // Transport gone / unreachable — the handle is not observable.
        return null;
      }
    },

    async alive(handle: SubstrateHandle): Promise<boolean> {
      // Liveness is decided by the sentinel the launched command writes ON EXIT
      // (`.recoder/agent.exit`), kept truthfully distinct:
      //   1. marker present  → finished → NOT alive.
      //   2. marker absent    → still running → alive.
      //   3. host unreachable / transient exec failure → UNKNOWN; we must NOT
      //      report finished (that would finalize a still-running remote
      //      workspace on a blip). We return `true` (assume alive) instead.
      const exitFile = `${handle.worktreePath}/${EXIT_REL}`;
      try {
        const res = await exec.run(
          `if test -f ${q(exitFile)}; then echo __FINISHED__; else echo __RUNNING__; fi`,
          { timeoutSecs: 30 },
        );
        const out = res.stdout ?? '';
        if (out.includes('__FINISHED__')) return false;
        if (out.includes('__RUNNING__')) return true;
        logger.warn('ssh alive probe returned no marker token; assuming alive (transient)', {
          session: handle.ref,
          out,
        });
        return true;
      } catch (err) {
        logger.warn('ssh alive probe failed (transient); assuming alive', {
          session: handle.ref,
          err,
        });
        return true;
      }
    },

    async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
      // Read the sentinel written by the launched command (`echo $? > .recoder/agent.exit`).
      //   - file present + parseable int → that exit code (0 = success, >0 = failure).
      //   - file absent (still running) → undefined (not finished yet).
      //   - host gone / transient failure → undefined (unknown), NOT a fabricated 0.
      const exitFile = `${handle.worktreePath}/${EXIT_REL}`;
      try {
        const res = await exec.run(
          `if test -f ${q(exitFile)}; then printf '__EXIT__'; cat ${q(exitFile)}; else printf '__NONE__'; fi`,
          { timeoutSecs: 30 },
        );
        const out = (res.stdout ?? '').trim();
        if (out.includes('__NONE__')) return undefined; // still running / no marker
        const marker = out.indexOf('__EXIT__');
        if (marker === -1) return undefined; // garbled/transient — unknown
        const raw = out.slice(marker + '__EXIT__'.length).trim();
        const code = Number.parseInt(raw, 10);
        return Number.isFinite(code) ? code : undefined;
      } catch (err) {
        logger.warn('ssh exit-code probe failed (transient/unreachable)', {
          session: handle.ref,
          err,
        });
        return undefined;
      }
    },

    async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
      const base = baseRef || 'HEAD';
      const dir = handle.worktreePath ?? worktreeDirFor(config, handle.ref);
      const opts = { timeoutSecs: 60 } as const;
      const [stat, patch, status] = await Promise.all([
        exec.run(`git -C ${q(dir)} --no-pager diff --stat ${q(base)}`, opts),
        exec.run(`git -C ${q(dir)} --no-pager diff ${q(base)}`, opts),
        exec.run(`git -C ${q(dir)} status --porcelain`, opts),
      ]);
      // Same shared parser as the local + Daytona substrates — identical shape.
      return buildSubstrateDiff({
        stat: stat.stdout ?? '',
        patch: patch.stdout ?? '',
        status: status.stdout ?? '',
      });
    },

    async teardown(handle: SubstrateHandle, options?: { removeIsolation?: boolean }): Promise<void> {
      const session = handle.sessionName ?? handle.ref;
      const dir = handle.worktreePath;
      // Stop the durable tmux session (best effort — never throw on teardown).
      await exec
        .run(`tmux kill-session -t ${q(session)} 2>/dev/null || true`, { timeoutSecs: 30 })
        .catch((err) => logger.warn('ssh tmux kill-session failed (best effort)', { session, err }));
      if (options?.removeIsolation && dir) {
        await exec
          .run(
            `git -C ${q(config.repoPath)} worktree remove -f ${q(dir)} 2>/dev/null || rm -rf ${q(dir)}`,
            { timeoutSecs: 60 },
          )
          .catch((err) => logger.warn('ssh worktree remove failed (best effort)', { dir, err }));
      }
    },
  };
}
