/**
 * createDaytonaSubstrate — the remote-sandbox ConductorSubstrate (`daytona`).
 *
 * Ported from docker-backend/src/conductor/substrate-daytona.ts (the proven impl)
 * into the package behind the injected `DaytonaClientPort`, so `@recoder/substrate`
 * provides the remote path WITHOUT importing the backend's `getDaytonaClient()` or
 * the Daytona SDK (design §4.9 — dependency inversion).
 *
 * Behavior is preserved verbatim from the reference:
 *   - launch() resolves the repo's `origin` URL host-side (sandboxes clone a URL,
 *     not a local path), creates a sandbox, clones + checks out the branch, then
 *     runs the SAME resolved headless `command` backgrounded with a log + exit
 *     sentinel.
 *   - capture() tails `.recoder/agent.log`.
 *   - alive() / exitCode() read the `.recoder/agent.exit` sentinel and — critically
 *     — treat a transient/unreachable probe as "still alive / unknown", NEVER as a
 *     finished workspace (the blip-must-not-finalize invariant).
 *   - diff() runs git INSIDE the sandbox and feeds the SAME shared parser
 *     (`buildSubstrateDiff`) the local substrate uses, for an identical SubstrateDiff.
 *   - teardown() best-effort deletes the sandbox.
 *
 * Truthful availability: when the Daytona path is not enabled/reachable it reports
 * `available:false` (the selector then degrades to the local substrate) — it never
 * fakes readiness.
 *
 * NOTE: runtime verification requires Daytona credentials + a repo with a reachable
 * git remote. The marker-parsing logic is unit-tested against a fake client port.
 */
import { execFileSafe } from '../exec/index.js';
import { buildSubstrateDiff } from '../review/index.js';
import type {
  ConductorSubstrate,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateDiff,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '../contract/index.js';
import type { DaytonaClientPort } from '../ports/daytona-client.port.js';
import type { LoggerPort } from '../ports/logger.port.js';

const LOG_PATH = '.recoder/agent.log';
const EXIT_PATH = '.recoder/agent.exit';
const REPO_DIR = 'repo';

/** Single-quote a value for safe interpolation into a `sh -c` command. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A no-op logger so the substrate works even when none is injected. */
const NOOP_LOGGER: LoggerPort = {
  info() {},
  warn() {},
  error() {},
};

export interface CreateDaytonaSubstrateDeps {
  /** Injected remote-sandbox client (the backend adapter wraps the real client). */
  client: DaytonaClientPort;
  /** Structured logger; defaults to a no-op. */
  logger?: LoggerPort;
}

/** Resolve the repo's git `origin` URL host-side (sandboxes clone a URL, not a path). */
async function remoteUrl(repoPath: string): Promise<string> {
  const { stdout } = await execFileSafe('git', ['-C', repoPath, 'remote', 'get-url', 'origin']);
  const url = stdout.trim();
  if (!url) {
    throw new Error(`no git remote 'origin' for ${repoPath} (daytona substrate clones a URL)`);
  }
  return url;
}

/**
 * Build the `daytona` ConductorSubstrate over an injected DaytonaClientPort.
 *
 * Register it via `createSubstrateRegistry({ substrates: [..., createDaytonaSubstrate(deps)] })`.
 * The factory never invents a stub, so an unregistered `'daytona'` fails truthfully.
 */
export function createDaytonaSubstrate(deps: CreateDaytonaSubstrateDeps): ConductorSubstrate {
  const client = deps.client;
  const logger = deps.logger ?? NOOP_LOGGER;

  return {
    id: 'daytona',

    capabilities(): SubstrateCapabilities {
      return {
        // Runs off-machine in a remote sandbox, not on the local host.
        remote: true,
        // No interactive PTY — the agent runs backgrounded with a log file.
        supportsPty: false,
        supportsInteractiveKeys: false,
        // Output is observed by polling capture(), not streamed.
        capturesByPolling: true,
        supportsDiff: true,
        supportsIsolationRemoval: true,
      };
    },

    async available(): Promise<SubstrateAvailability> {
      if (!client.isEnabled()) {
        return {
          available: false,
          reason: 'Daytona is not configured (DAYTONA_API_KEY / sdk disabled)',
        };
      }
      try {
        const ok = await client.isAvailable();
        return { available: ok, reason: ok ? undefined : 'Daytona API unreachable' };
      } catch (err) {
        return {
          available: false,
          reason: err instanceof Error ? err.message : 'Daytona unavailable',
        };
      }
    },

    async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
      const url = await remoteUrl(input.repoPath);
      const sandbox = await client.createSandbox();
      const sandboxId = sandbox.id;

      try {
        const base = input.baseRef && input.baseRef !== 'HEAD' ? input.baseRef : '';
        const clone = [
          `rm -rf ${REPO_DIR}`,
          `git clone ${q(url)} ${REPO_DIR}`,
          `cd ${REPO_DIR}`,
          base ? `git checkout ${q(base)}` : 'true',
          `git checkout -B ${q(input.branch)}`,
          `mkdir -p .recoder`,
        ].join(' && ');
        await client.execCommand(sandboxId, clone, { timeoutSecs: 300 });

        // Launch the agent backgrounded; record output + exit code for capture/alive.
        const workDir = await client.getWorkDir(sandboxId);
        const repoCwd = `${workDir}/${REPO_DIR}`;
        const run = `nohup sh -c ${q(`${input.command}; echo $? > ${EXIT_PATH}`)} > ${LOG_PATH} 2>&1 & echo launched`;
        await client.execCommand(sandboxId, run, { cwd: repoCwd, timeoutSecs: 30 });

        logger.info('daytona workspace launched', { workspaceId: input.workspaceId, sandboxId });
        return { ref: sandboxId, worktreePath: repoCwd, sessionName: sandboxId, sandboxId };
      } catch (err) {
        await client.deleteSandbox(sandboxId).catch(() => {});
        throw err;
      }
    },

    async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
      try {
        const res = await client.execCommand(
          handle.ref,
          `tail -n ${lines} ${LOG_PATH} 2>/dev/null || true`,
          { cwd: handle.worktreePath, timeoutSecs: 30 },
        );
        return res.output ?? '';
      } catch {
        return null;
      }
    },

    async alive(handle: SubstrateHandle): Promise<boolean> {
      // Liveness is decided by a sentinel the launched command writes ON EXIT
      // (`.recoder/agent.exit`). Three cases, kept truthfully distinct:
      //
      //   1. marker present  → the agent finished → NOT alive.
      //   2. marker absent    → the agent is still running → alive.
      //   3. sandbox unreachable / transient exec failure → we do NOT know the
      //      agent finished, so we must NOT report it as finished. Returning
      //      `false` here is exactly the bug that finalizes a still-running remote
      //      workspace on a blip; we return `true` (assume alive) instead. A truly
      //      gone sandbox is detected by teardown/exitCode, not by a transient probe.
      try {
        const res = await client.execCommand(
          handle.ref,
          // Emit an unambiguous token for each case so we never confuse an empty
          // output (transient) with "running".
          `if test -f ${EXIT_PATH}; then echo __FINISHED__; else echo __RUNNING__; fi`,
          { cwd: handle.worktreePath, timeoutSecs: 30 },
        );
        const out = res.output ?? '';
        if (out.includes('__FINISHED__')) return false;
        if (out.includes('__RUNNING__')) return true;
        // Neither token came back (truncated/garbled output) — treat as transient.
        logger.warn('daytona alive probe returned no marker token; assuming alive (transient)', {
          sandboxId: handle.ref,
          out,
        });
        return true;
      } catch (err) {
        // Unreachable / transient: assume still alive rather than falsely finalize.
        logger.warn('daytona alive probe failed (transient); assuming alive', {
          sandboxId: handle.ref,
          err,
        });
        return true;
      }
    },

    async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
      // Read the sentinel written by the launched command (`echo $? > .recoder/agent.exit`).
      //   - file present + parseable int → that exit code (0 = success, >0 = failure).
      //   - file absent (agent still running) → undefined (not finished yet).
      //   - sandbox gone / transient failure → undefined (unknown), NOT a fabricated 0.
      try {
        const res = await client.execCommand(
          handle.ref,
          `if test -f ${EXIT_PATH}; then printf '__EXIT__'; cat ${EXIT_PATH}; else printf '__NONE__'; fi`,
          { cwd: handle.worktreePath, timeoutSecs: 30 },
        );
        const out = (res.output ?? '').trim();
        if (out.includes('__NONE__')) return undefined; // still running / no marker
        const marker = out.indexOf('__EXIT__');
        if (marker === -1) return undefined; // garbled/transient — unknown
        const raw = out.slice(marker + '__EXIT__'.length).trim();
        const code = Number.parseInt(raw, 10);
        return Number.isFinite(code) ? code : undefined;
      } catch (err) {
        logger.warn('daytona exit-code probe failed (transient/unreachable)', {
          sandboxId: handle.ref,
          err,
        });
        return undefined;
      }
    },

    async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
      const base = baseRef || 'HEAD';
      const opts = { cwd: handle.worktreePath, timeoutSecs: 60 } as const;
      const [stat, patch, status] = await Promise.all([
        client.execCommand(handle.ref, `git --no-pager diff --stat ${q(base)}`, opts),
        client.execCommand(handle.ref, `git --no-pager diff ${q(base)}`, opts),
        client.execCommand(handle.ref, 'git status --porcelain', opts),
      ]);
      // Same shared parser as the local substrate (git runs inside the sandbox here,
      // host-side over the worktree there) — identical SubstrateDiff shape.
      return buildSubstrateDiff({
        stat: stat.output ?? '',
        patch: patch.output ?? '',
        status: status.output ?? '',
      });
    },

    async teardown(handle: SubstrateHandle): Promise<void> {
      await client.deleteSandbox(handle.ref).catch((err) => {
        logger.warn('daytona sandbox delete failed (best effort)', { sandboxId: handle.ref, err });
      });
    },
  };
}
