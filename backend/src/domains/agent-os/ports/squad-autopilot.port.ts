/**
 * Squad-autopilot seams (docs/modules/squads.md `autopilot · board`).
 *
 * `SquadConductorPort` is the NARROW conductor-dispatch seam the autopilot
 * launches workspaces through — bootstrap adapts the real conductor module's
 * `createWorkspace` behind it (mirrors the social domain's
 * `ConductorDispatchPort`; agent-os never imports the conductor module). The
 * adapter owns the launch context (space/project/repoPath/runtime/principal);
 * the autopilot only supplies the issue-derived work request.
 *
 * DEGRADE LAW: an absent port ⇒ the autopilot tick reports a truthful
 * `degraded` result and dispatches nothing — never a faked launch.
 */

/** One unit of ready work (a bd issue) the autopilot asks the conductor to run. */
export interface SquadDispatchRequest {
  /** The bd issue id backing this work (becomes the workspace `taskId`). */
  readonly taskId: string;
  /** The issue title (human-readable board label). */
  readonly title: string;
  /** The launch prompt derived from the issue (title + description). */
  readonly prompt: string;
  /** The squad-routed agent, when a squad routed this dispatch. */
  readonly routedAgentId?: string;
}

/** The truthful outcome of one conductor dispatch. */
export interface SquadDispatchResult {
  readonly ok: boolean;
  /** Set ONLY when the conductor genuinely launched a workspace. */
  readonly workspaceId?: string;
  /** Set when the launch also produced a run. */
  readonly runId?: string;
  /** Why the dispatch was refused / failed (required when `ok` is false). */
  readonly reason?: string;
}

/** The narrow conductor seam the autopilot dispatches through. */
export interface SquadConductorPort {
  dispatch(req: SquadDispatchRequest): Promise<SquadDispatchResult>;
}
