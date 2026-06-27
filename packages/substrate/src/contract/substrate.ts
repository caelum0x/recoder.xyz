/**
 * ConductorSubstrate — the swappable execution layer under a workspace.
 *
 * Promoted from docker-backend/src/conductor/substrate.ts (the contract is
 * verbatim; `capabilities()` is added per design §4.1). A substrate provisions
 * isolation + launches the agent, and lets the orchestration layer capture
 * output, check liveness, produce a reviewable diff, and tear down. The
 * control-plane Workspace lifecycle is identical regardless of substrate
 * (`Workspace.substrate` selects it):
 *
 *   - `tmux_worktree` — local git worktree + tmux session.
 *   - `daytona`       — remote sandbox via the injected Daytona client port.
 *
 * Registering a substrate keeps the engine / run-tailer / review / reconcile
 * free of substrate-specific code.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import type { SubstrateLaunchInput } from './launch-input.js';
import type { SubstrateHandle } from './handle.js';
import type { SubstrateDiff } from './diff.js';
import type { SubstrateAvailability } from './availability.js';
import type { SubstrateCapabilities } from './capabilities.js';

export interface ConductorSubstrate {
  id: WorkspaceSubstrate;
  /** Static description of what this substrate can structurally do. */
  capabilities(): SubstrateCapabilities;
  /** Truthful readiness: missing git/tmux/gh/Daytona creds → available:false. */
  available(): Promise<SubstrateAvailability>;
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
