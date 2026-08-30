/**
 * ConductorSubstrate — the swappable execution layer under a workspace.
 *
 * Promoted from backend/src/conductor/substrate.ts (the contract is
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
  /**
   * Exit code of the finished agent, when the substrate can observe it.
   *   - a number → the process exit code (0 = success, >0 = failure).
   *   - `undefined` → still running, or unknown on a transient/unreachable probe
   *     (NEVER a fabricated 0). `null` means the handle is gone or was terminated
   *     without a recoverable numeric status.
   * Optional: substrates that cannot surface an exit code (e.g. a tmux pane with
   * no sentinel) simply omit it; callers must treat absence as an unverified
   * outcome, never as a clean completion.
   */
  exitCode?(handle: SubstrateHandle): Promise<number | null | undefined>;
  /** Reviewable diff of the work against `baseRef`. */
  diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff>;
  /** Stop the agent and (optionally) remove its isolation. */
  teardown(handle: SubstrateHandle, options?: { removeIsolation?: boolean }): Promise<void>;
  /**
   * CONTINUE / CHAT: start ANOTHER agent run in the SAME isolation (the prior
   * run's worktree, with its accumulated changes intact). This is how a user
   * message keeps directing the agent — each message is a new run over the same
   * work. Optional: substrates without an in-place relaunch simply omit it and
   * callers surface a truthful "cannot continue" instead of re-provisioning.
   */
  continueRun?(handle: SubstrateHandle, input: ContinueRunInput): Promise<SubstrateHandle>;
}

/**
 * Input for {@link ConductorSubstrate.continueRun}: the new instruction + the
 * existing worktree to run it in. `command` drives shell substrates
 * (tmux_worktree); `prompt`/`runtimeId` drive in-process substrates directly.
 */
export interface ContinueRunInput {
  workspaceId: string;
  /** The existing worktree to run in (the prior run's worktree). */
  worktreePath: string;
  /** Shell command to run (tmux_worktree). */
  command?: string;
  /** Rendered agent prompt (in_process substrates). */
  prompt?: string;
  /** Runtime the prompt targets (in_process substrates). */
  runtimeId?: string;
  /** Relaunch env (forwarded like launch()). */
  env?: Record<string, string>;
}
