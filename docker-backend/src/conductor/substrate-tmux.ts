/**
 * tmux_worktree substrate — local git worktree + tmux session.
 *
 * The default Conductor substrate: real terminals (tmux, pinned in the runtime
 * image) over isolated git worktrees. Wraps tmux-orchestrator + direct tmux
 * liveness checks, exposed through the ConductorSubstrate contract so the
 * orchestration layer stays substrate-agnostic.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  conductorAvailability,
  startSession,
  capturePane,
  killSession,
  paneExitCode,
} from './tmux-orchestrator.js';
import { TMUX_BIN } from './tmux-path.js';
import { buildSubstrateDiff } from '@recoder/substrate';
import {
  registerSubstrate,
  type ConductorSubstrate,
  type SubstrateDiff,
  type SubstrateHandle,
  type SubstrateLaunchInput,
} from './substrate.js';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', cwd, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

const tmuxWorktreeSubstrate: ConductorSubstrate = {
  id: 'tmux_worktree',

  async available() {
    const a = await conductorAvailability();
    return { available: a.available, reason: a.reason };
  },

  async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    const session = await startSession({
      sessionId: input.workspaceId,
      repoPath: input.repoPath,
      command: input.command,
      branch: input.branch,
      baseRef: input.baseRef,
    });
    // ref = the orchestrator's session id (workspaceId, used by capturePane/killSession);
    // sessionName = the tmux session name (used for direct `tmux has-session`).
    return { ref: input.workspaceId, worktreePath: session.worktreePath, sessionName: session.tmuxName };
  },

  async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
    try {
      return await capturePane(handle.ref, lines);
    } catch {
      return null;
    }
  },

  async alive(handle: SubstrateHandle): Promise<boolean> {
    const sessionName = handle.sessionName ?? handle.ref;
    try {
      await exec(TMUX_BIN, ['has-session', '-t', sessionName]);
    } catch {
      return false; // session entirely gone
    }
    // Session exists — but with remain-on-exit, a dead pane keeps the session
    // alive. Check if the pane is actually dead (agent finished/crashed).
    try {
      const { stdout: dead } = await exec(TMUX_BIN, [
        'display-message', '-p', '-t', sessionName, '#{pane_dead}',
      ]);
      return dead.trim() !== '1';
    } catch {
      return true; // can't query pane state — assume alive (safe default)
    }
  },

  async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
    const sessionName = handle.sessionName ?? handle.ref;
    return paneExitCode(sessionName);
  },

  async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
    if (!handle.worktreePath) throw new Error('tmux_worktree diff requires a worktree path');
    const cwd = handle.worktreePath;
    const base = baseRef || 'HEAD';
    const [stat, patch, status] = await Promise.all([
      git(cwd, ['--no-pager', 'diff', '--stat', base]),
      git(cwd, ['--no-pager', 'diff', base]),
      git(cwd, ['status', '--porcelain']),
    ]);
    // Shared --stat/-p + porcelain-untracked parsing (host-side git over the
    // worktree) — promoted to @recoder/substrate so local + remote produce the
    // identical SubstrateDiff. Behavior unchanged.
    return buildSubstrateDiff({ stat, patch, status });
  },

  async teardown(handle: SubstrateHandle, options?: { removeIsolation?: boolean }): Promise<void> {
    await killSession(handle.ref, { removeWorktree: options?.removeIsolation !== false });
  },
};

/** Register the tmux substrate (call once at startup). */
export function registerTmuxSubstrate(): void {
  registerSubstrate(tmuxWorktreeSubstrate);
}
