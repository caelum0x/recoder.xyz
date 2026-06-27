/**
 * SubstrateLaunchInput — the substrate-agnostic launch request.
 *
 * Promoted verbatim from docker-backend/src/conductor/substrate.ts. The engine
 * resolves the real headless `command` (see ../command) and hands the substrate
 * everything it needs to provision isolation and start the agent CLI inside it.
 */
export interface SubstrateLaunchInput {
  workspaceId: string;
  /** Resolved headless command the agent runs. */
  command: string;
  /** Git repo to branch a worktree from (tmux_worktree). */
  repoPath: string;
  branch: string;
  baseRef: string;
  env?: Record<string, string>;
  /** Daytona-specific context (sandbox provisioning) when substrate === 'daytona'. */
  projectId?: string;
  sandboxId?: string;
}
