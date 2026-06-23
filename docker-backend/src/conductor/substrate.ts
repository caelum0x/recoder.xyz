/**
 * Conductor substrate — the swappable execution layer under a workspace.
 *
 * A substrate provisions isolation + launches the agent, and lets the
 * orchestration layer capture output, check liveness, and tear down. The
 * control-plane Workspace lifecycle is identical regardless of substrate
 * (`Workspace.substrate` selects it):
 *
 *   - `tmux_worktree` — local git worktree + tmux session (substrate-tmux.ts).
 *   - `daytona`       — remote sandbox via a2a/cli-agent-runtime (planned;
 *                       see CONDUCTOR-ARCHITECTURE.md step 6 reconciliation).
 *
 * Registering a substrate here keeps workspace-service / run-tailer / review free
 * of substrate-specific code.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';

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

export interface SubstrateHandle {
  /** Substrate-specific handle id (e.g. tmux session name or sandbox id). */
  ref: string;
  worktreePath?: string;
  sessionName?: string;
}

export interface SubstrateDiff {
  /** `git diff --stat` summary against the base ref. */
  stat: string;
  /** Full unified patch of tracked changes against the base ref. */
  patch: string;
  /** Untracked files not yet in the patch. */
  untracked: string[];
  changedFiles: number;
}

export interface ConductorSubstrate {
  id: WorkspaceSubstrate;
  available(): Promise<{ available: boolean; reason?: string }>;
  /** Provision isolation and launch the agent command. */
  launch(input: SubstrateLaunchInput): Promise<SubstrateHandle>;
  /** Capture recent agent output (null if the handle is gone). */
  capture(handle: SubstrateHandle, lines?: number): Promise<string | null>;
  /** Whether the agent process/session is still alive. */
  alive(handle: SubstrateHandle): Promise<boolean>;
  /** Reviewable diff of the work against `baseRef`. */
  diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff>;
  /** Stop the agent and (optionally) remove its isolation. */
  teardown(handle: SubstrateHandle, options?: { removeIsolation?: boolean }): Promise<void>;
}

const registry = new Map<WorkspaceSubstrate, ConductorSubstrate>();

export function registerSubstrate(substrate: ConductorSubstrate): void {
  registry.set(substrate.id, substrate);
}

/** Resolve a registered substrate, or throw truthfully if it isn't wired yet. */
export function getSubstrate(id: WorkspaceSubstrate): ConductorSubstrate {
  const substrate = registry.get(id);
  if (!substrate) {
    throw new Error(`conductor substrate not available: ${id} (registered: ${[...registry.keys()].join(', ') || 'none'})`);
  }
  return substrate;
}

export function listSubstrates(): WorkspaceSubstrate[] {
  return [...registry.keys()];
}
