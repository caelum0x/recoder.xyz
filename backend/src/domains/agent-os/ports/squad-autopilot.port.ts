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

/**
 * The explicit unattended-launch contract selected in Wave. It is pinned on the
 * scheduler and repeated on every dispatch; background work never guesses a repo
 * from the backend process cwd or silently chooses an agent.
 */
export interface SquadAutopilotLaunchProfile {
  readonly repoPath: string;
  readonly spaceId: string;
  readonly projectId: string;
  readonly runtimeId: string;
}

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
  /** The operator-pinned repo/agent contract for this unattended dispatch. */
  readonly profile: SquadAutopilotLaunchProfile;
}

/** The truthful outcome of one conductor dispatch. */
export interface SquadDispatchResult {
  readonly ok: boolean;
  /** New launch vs a canonical workspace reused after restart. */
  readonly status?: 'launched' | 'existing';
  /** The launched or canonically reused workspace. */
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
