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
} from './tmux-orchestrator.js';
import {
  registerSubstrate,
  type ConductorSubstrate,
  type SubstrateHandle,
  type SubstrateLaunchInput,
} from './substrate.js';

const exec = promisify(execFile);

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
    return { ref: session.tmuxName, worktreePath: session.worktreePath, sessionName: session.tmuxName };
  },

  async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
    try {
      return await capturePane(handle.ref, lines);
    } catch {
      return null;
    }
  },

  async alive(handle: SubstrateHandle): Promise<boolean> {
    try {
      await exec('tmux', ['has-session', '-t', handle.sessionName ?? handle.ref]);
      return true;
    } catch {
      return false;
    }
  },

  async teardown(handle: SubstrateHandle, options?: { removeIsolation?: boolean }): Promise<void> {
    await killSession(handle.ref, { removeWorktree: options?.removeIsolation !== false });
  },
};

/** Register the tmux substrate (call once at startup). */
export function registerTmuxSubstrate(): void {
  registerSubstrate(tmuxWorktreeSubstrate);
}
