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
    try {
      // The exit-marker file exists once the agent command has finished.
      const res = await getDaytonaClient().execCommand(
        handle.ref,
        `test -f ${EXIT_PATH} && echo done || echo running`,
        { cwd: handle.worktreePath, timeoutSecs: 30 },
      );
      return !(res.output ?? '').includes('done');
    } catch {
      return false;
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
    const untracked = (status.output ?? '')
      .split('\n')
      .filter((line) => line.startsWith('??'))
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const statText = (stat.output ?? '').trim();
    const changedFiles = statText.split('\n').filter((l) => l.includes('|')).length + untracked.length;
    return { stat: statText, patch: patch.output ?? '', untracked, changedFiles };
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
