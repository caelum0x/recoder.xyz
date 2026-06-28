/**
 * Engine input/output types — the workspace lifecycle surface (design §4.5/§4.6).
 *
 * `CreateWorkspaceInput` is the substrate-agnostic create request; the backend
 * adapter keeps an identically-shaped `CreateWorkspaceInput` so its callers
 * (conductor.routes, a2a-entry, connectors gateway) are unchanged.
 *
 * `ReconcileReport` mirrors the proven backend report (string-id buckets) 1:1 so
 * `server.ts`, `conductor.routes`, and the survivability test consume the exact
 * same shape after the engine move.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';

export interface CreateWorkspaceInput {
  spaceId: string;
  projectId: string;
  taskId: string;
  /** Absolute path to the git repo to branch a worktree from. */
  repoPath: string;
  /** Runtime that will drive the work (agent-os surface id, e.g. 'claude_code'). */
  runtimeId: string;
  /** Execution substrate to launch on (defaults to 'tmux_worktree'). */
  substrate?: WorkspaceSubstrate;
  /** Explicit command to run; if omitted, resolved from runtimeId + prompt. */
  command?: string;
  /** Task prompt — used to resolve the headless CLI invocation for the runtime. */
  prompt?: string;
  /** Optional model override passed to the runtime CLI. */
  model?: string;
  /** Library to enrich the prompt with docs via context7 (e.g. 'next.js'). */
  library?: string;
  createdBy: string;
  branch?: string;
  baseRef?: string;
  /** Extra env for the session (e.g. provider keys). */
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface ReconcileReport {
  /** Workspaces whose tmux session is still alive. */
  live: string[];
  /** Live workspaces whose run-tailer was (re)bound this pass (streaming resumed). */
  rebound: string[];
  /** Live workspaces whose write-lock was re-acquired this pass (scope re-held). */
  relocked: string[];
  /** Non-terminal workspaces whose tmux session is gone (agent ended/crashed). */
  orphanedWorkspaces: string[];
  /** Orphaned workspaces finalized this pass (advanced to a terminal record state). */
  finalized: string[];
  /** Live tmux sessions with no matching workspace record. */
  orphanedSessions: string[];
  /** Conductor worktrees on disk with no matching workspace record. */
  orphanedWorktrees: string[];
  checkedAt: string;
}
