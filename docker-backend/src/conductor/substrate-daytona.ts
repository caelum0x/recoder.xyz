/**
 * daytona substrate — remote sandbox execution.
 *
 * The alternate Conductor substrate (CONDUCTOR-ARCHITECTURE.md step 6): instead of
 * a local git worktree + tmux, each workspace gets a Daytona sandbox that clones
 * the repo, runs the SAME resolved headless command (the tmux substrate runs in a
 * pane; this runs it in the sandbox, backgrounded with a log + exit marker), and
 * exposes capture/alive/diff over the sandbox toolbox.
 *
 * This unifies on the conductor's runtime-commands (all six CLIs) rather than the
 * qwen/gemini-only a2a/cli-agent-runtime, while staying behind the same
 * ConductorSubstrate contract. Truthful availability: reports unavailable (never
 * fakes) when Daytona is not configured.
 *
 * NOTE: tsc-verified; runtime verification requires Daytona credentials + a repo
 * with a reachable git remote (sandboxes clone a URL, not a local path).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDaytonaClient } from '../daytona-client.js';
import { isDaytonaSdkEnabled } from '../daytona-sdk.js';
import { createLogger } from '../logger';
import { buildSubstrateDiff } from '@recoder/substrate';
import {
  registerSubstrate,
  type ConductorSubstrate,
  type SubstrateDiff,
  type SubstrateHandle,
  type SubstrateLaunchInput,
} from './substrate.js';

const exec = promisify(execFile);
const logger = createLogger('conductor:daytona');

const LOG_PATH = '.recoder/agent.log';
const EXIT_PATH = '.recoder/agent.exit';
const REPO_DIR = 'repo';

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Resolve the repo's git remote URL host-side (sandboxes clone a URL, not a path). */
async function remoteUrl(repoPath: string): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, 'remote', 'get-url', 'origin']);
  const url = stdout.trim();
  if (!url) throw new Error(`no git remote 'origin' for ${repoPath} (daytona substrate clones a URL)`);
  return url;
}

const daytonaSubstrate: ConductorSubstrate = {
  id: 'daytona',

  async available() {
    if (!isDaytonaSdkEnabled()) {
      return { available: false, reason: 'Daytona is not configured (DAYTONA_API_KEY / sdk disabled)' };
    }
    try {
      const ok = await getDaytonaClient().isAvailable();
      return { available: ok, reason: ok ? undefined : 'Daytona API unreachable' };
    } catch (err) {
      return { available: false, reason: err instanceof Error ? err.message : 'Daytona unavailable' };
    }
  },

  async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    const dc = getDaytonaClient();
    const url = await remoteUrl(input.repoPath);
    const sandbox = await dc.createSandbox();
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
      await dc.execCommand(sandboxId, clone, { timeoutSecs: 300 });

      // Launch the agent backgrounded; record output + exit code for capture/alive.
      const workDir = await dc.getWorkDir(sandboxId);
      const repoCwd = `${workDir}/${REPO_DIR}`;
      const run = `nohup sh -c ${q(`${input.command}; echo $? > ${EXIT_PATH}`)} > ${LOG_PATH} 2>&1 & echo launched`;
      await dc.execCommand(sandboxId, run, { cwd: repoCwd, timeoutSecs: 30 });

      logger.info({ workspaceId: input.workspaceId, sandboxId }, 'daytona workspace launched');
      return { ref: sandboxId, worktreePath: repoCwd, sessionName: sandboxId };
    } catch (err) {
      await dc.deleteSandbox(sandboxId).catch(() => {});
      throw err;
    }
  },

  async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
    try {
      const res = await getDaytonaClient().execCommand(
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
    //      gone sandbox is detected by teardown/exitCode, not by a transient
    //      probe.
    try {
      const res = await getDaytonaClient().execCommand(
        handle.ref,
        // Emit an unambiguous token for each case so we never confuse an empty
        // output (transient) with "running".
        `if test -f ${EXIT_PATH}; then echo __FINISHED__; else echo __RUNNING__; fi`,
        { cwd: handle.worktreePath, timeoutSecs: 30 },
      );
      const out = res.output ?? '';
      if (out.includes('__FINISHED__')) return false;
      if (out.includes('__RUNNING__')) return true;
      // Neither token came back (truncated/garbled output) — treat as transient,
      // not as finished.
      logger.warn({ sandboxId: handle.ref, out }, 'daytona alive probe returned no marker token; assuming alive (transient)');
      return true;
    } catch (err) {
      // Unreachable / transient: assume still alive rather than falsely finalize.
      logger.warn({ sandboxId: handle.ref, err }, 'daytona alive probe failed (transient); assuming alive');
      return true;
    }
  },

  async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
    // Read the sentinel written by the launched command (`echo $? > .recoder/agent.exit`).
    //   - file present + parseable int → that exit code (0 = success, >0 = failure).
    //   - file absent (agent still running) → undefined (not finished yet).
    //   - sandbox gone / transient failure → undefined (unknown), NOT a fabricated 0.
    try {
      const res = await getDaytonaClient().execCommand(
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
      logger.warn({ sandboxId: handle.ref, err }, 'daytona exit-code probe failed (transient/unreachable)');
      return undefined;
    }
  },

  async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
    const dc = getDaytonaClient();
    const base = baseRef || 'HEAD';
    const opts = { cwd: handle.worktreePath, timeoutSecs: 60 } as const;
    const [stat, patch, status] = await Promise.all([
      dc.execCommand(handle.ref, `git --no-pager diff --stat ${q(base)}`, opts),
      dc.execCommand(handle.ref, `git --no-pager diff ${q(base)}`, opts),
      dc.execCommand(handle.ref, 'git status --porcelain', opts),
    ]);
    // Same shared parser as the local substrate (git runs inside the sandbox
    // here, host-side over the worktree there) — identical SubstrateDiff shape.
    return buildSubstrateDiff({
      stat: stat.output ?? '',
      patch: patch.output ?? '',
      status: status.output ?? '',
    });
  },

  async teardown(handle: SubstrateHandle): Promise<void> {
    await getDaytonaClient().deleteSandbox(handle.ref).catch((err) => {
      logger.warn({ sandboxId: handle.ref, err }, 'daytona sandbox delete failed (best effort)');
    });
  },
};

/** Register the daytona substrate (call once at startup). */
export function registerDaytonaSubstrate(): void {
  registerSubstrate(daytonaSubstrate);
}
