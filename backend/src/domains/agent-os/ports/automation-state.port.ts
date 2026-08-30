import type { SquadAutopilotLaunchProfile } from './squad-autopilot.port.js';

export interface BackgroundAgentControlState {
  readonly version: 1;
  readonly running: boolean;
  readonly launchProfile: SquadAutopilotLaunchProfile | null;
}

export interface PullRequestReviewControlState {
  readonly version: 1;
  readonly running: boolean;
  readonly launchProfile: SquadAutopilotLaunchProfile | null;
  readonly reviewerRuntimeIds: readonly string[];
  readonly includeDrafts: boolean;
  readonly operatorId: string | null;
}

/** Restart-survivable operator posture for the two installed background loops. */
export interface AgentAutomationStatePort {
  loadBackgroundAgents(): Promise<BackgroundAgentControlState | null>;
  saveBackgroundAgents(state: BackgroundAgentControlState): Promise<void>;
  loadPullRequestReviews(): Promise<PullRequestReviewControlState | null>;
  savePullRequestReviews(state: PullRequestReviewControlState): Promise<void>;
  isDurable(): boolean;
}
