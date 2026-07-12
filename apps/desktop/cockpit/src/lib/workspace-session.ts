/**
 * Project a Workspace onto the ConductorSession shape the terminal components
 * attach to. The conductor runs the agent in a tmux session and exposes its live
 * name via `workspace.sessionName`; the terminal attaches to that real session
 * (local PTY) or polls `/sessions/:id/output` (HTTP). Returns null when no
 * session is attached yet (nothing to show).
 */
import type { ConductorSession, Workspace } from '../types';

export function workspaceSession(workspace: Workspace): ConductorSession | null {
  if (!workspace.sessionName) return null;
  return {
    sessionId: workspace.workspaceId,
    tmuxName: workspace.sessionName,
    worktreePath: workspace.worktreePath || '',
    branch: workspace.branch,
    repoPath: workspace.worktreePath || '',
    command: '',
    createdAt: workspace.createdAt,
  };
}

/** True when running inside the Recoder desktop shell (preload PTY bridge present). */
export function hasDesktopTerminal(): boolean {
  const w = window as unknown as { recoderDesktop?: { spawnTerminal?: unknown } };
  return Boolean(w.recoderDesktop && typeof w.recoderDesktop.spawnTerminal === 'function');
}
