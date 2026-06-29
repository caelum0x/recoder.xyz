/**
 * Conductor substrate — the swappable execution layer under a workspace.
 *
 * ADOPTION (docs/subsystems/substrate.md §2/§4.1/§12 step 1): the contract is now
 * OWNED by `@recoder/substrate` (`src/contract/*`) and the typed error hierarchy
 * by `@recoder/substrate` (`src/errors/*`). This backend module imports those as
 * the source of truth and keeps the in-process registry behavior so the proven
 * path (workspace-service / run-tailer / review / conductor.routes) is unchanged.
 *
 * The tmux_worktree / daytona / in_process impls stay in docker-backend for now
 * (substrate.md §12 steps 3-4 move their bodies later) but they now implement the
 * PACKAGE's `ConductorSubstrate` contract type. Two backward-compatible local
 * extensions are preserved so the proven impls keep compiling and running:
 *   - `exitCode?` — the run-tailer's richer "exit 0 vs non-zero" completion check
 *     (an upgrade over "session gone = done"); optional method on the package
 *     contract surface here until it lands in the package contract itself.
 *   - `SubstrateLaunchInput.prompt?` / `.runtimeId?` — the in_process driver runs
 *     an agent loop against a rendered prompt rather than a shell `command`.
 *
 * A substrate provisions isolation + launches the agent, and lets the
 * orchestration layer capture output, check liveness, diff, and tear down. The
 * control-plane Workspace lifecycle is identical regardless of substrate
 * (`Workspace.substrate` selects it):
 *
 *   - `tmux_worktree` — local git worktree + tmux session (substrate-tmux.ts).
 *   - `daytona`       — remote sandbox (substrate-daytona.ts).
 *   - `in_process`    — in-process agent loop (substrate-in-process.ts).
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import {
  SubstrateNotRegisteredError,
  type ConductorSubstrate as PackageConductorSubstrate,
  type SubstrateLaunchInput as PackageSubstrateLaunchInput,
  type SubstrateHandle,
  type SubstrateDiff,
  type SubstrateAvailability,
  type SubstrateCapabilities,
} from '@recoder/substrate';

// Re-export the package contract's data types so existing backend callers that
// import them from `./substrate.js` (run-tailer, conductor.routes, the impls)
// keep working unchanged — now sourced from the owned package.
export type {
  SubstrateHandle,
  SubstrateDiff,
  SubstrateAvailability,
  SubstrateCapabilities,
};

/**
 * Backend launch input = the package's substrate-agnostic input + the two
 * in_process-only fields. Superset of the package type, so anything that
 * satisfies the package input satisfies this.
 */
export interface SubstrateLaunchInput extends PackageSubstrateLaunchInput {
  /**
   * Rendered agent prompt (in_process substrate). The in-process driver runs an
   * agent loop against this prompt rather than executing `command` as a shell.
   * Ignored by tmux_worktree / daytona, which use `command`.
   */
  prompt?: string;
  /** Runtime surface to drive (in_process substrate). Defaults to `recoder_code`. */
  runtimeId?: string;
}

/**
 * Backend ConductorSubstrate = the package contract, with `capabilities()` kept
 * optional (the proven impls predate it; §12 backfills it) and the `exitCode?`
 * completion-detail method preserved. `launch` accepts the backend launch input
 * superset. Everything else is the package contract verbatim.
 */
export interface ConductorSubstrate
  extends Omit<PackageConductorSubstrate, 'capabilities' | 'launch'> {
  /** Static description of what this substrate can structurally do (optional). */
  capabilities?(): SubstrateCapabilities;
  /** Provision isolation and launch the agent command. */
  launch(input: SubstrateLaunchInput): Promise<SubstrateHandle>;
  /**
   * Exit code of the completed agent (0 = success, >0 = failure).
   * Returns `undefined` when the agent is still alive, `null` when the handle is
   * entirely gone (already cleaned up). Used by the run-tailer to distinguish
   * `completed` (exit 0) from `failed` (non-zero) per substrate.md §4.3.
   */
  exitCode?(handle: SubstrateHandle): Promise<number | null | undefined>;

  /**
   * CONTINUE/CHAT: start ANOTHER agent run in the SAME existing isolation (the
   * worktree the prior run already produced changes in), driven by a new
   * instruction. This is how a local chat keeps directing the agent — each user
   * message is a new run in the same worktree, with the prior changes intact.
   *
   * OPTIONAL: a substrate that cannot relaunch in place omits this; the continue
   * path then degrades truthfully (no new run) instead of re-provisioning. Returns
   * a fresh handle for the new run (the prior handle's worktree is reused).
   */
  continueRun?(handle: SubstrateHandle, input: ContinueRunInput): Promise<SubstrateHandle>;
}

/**
 * Input for {@link ConductorSubstrate.continueRun}: the new instruction + the
 * existing worktree to run it in. `command` (tmux) and `prompt`/`runtimeId`
 * (in_process) mirror the launch input so each substrate drives its native path.
 */
export interface ContinueRunInput {
  workspaceId: string;
  /** The existing worktree to run in (the prior run's worktree). */
  worktreePath: string;
  /** Shell command to run (tmux_worktree). */
  command?: string;
  /** Rendered agent prompt (in_process). */
  prompt?: string;
  /** Runtime surface to drive (in_process). */
  runtimeId?: string;
  /** Environment for the relaunched run. */
  env?: Record<string, string>;
}

const registry = new Map<WorkspaceSubstrate, ConductorSubstrate>();

export function registerSubstrate(substrate: ConductorSubstrate): void {
  registry.set(substrate.id, substrate);
}

/** Resolve a registered substrate, or throw truthfully if it isn't wired yet. */
export function getSubstrate(id: WorkspaceSubstrate): ConductorSubstrate {
  const substrate = registry.get(id);
  if (!substrate) {
    throw new SubstrateNotRegisteredError(id, [...registry.keys()]);
  }
  return substrate;
}

export function listSubstrates(): WorkspaceSubstrate[] {
  return [...registry.keys()];
}
