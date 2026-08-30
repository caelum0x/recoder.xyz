import type { KvStore } from '../../persistence/ports/kv-store.port.js';
import type { SquadAutopilotLaunchProfile } from '../ports/squad-autopilot.port.js';
import type {
  AgentAutomationStatePort,
  BackgroundAgentControlState,
  PullRequestReviewControlState,
} from '../ports/automation-state.port.js';

const NAMESPACE = 'agent-os.automation';
const BACKGROUND_KEY = 'background-agents';
const PR_REVIEW_KEY = 'pull-request-reviews';

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function profile(value: unknown): SquadAutopilotLaunchProfile | null {
  if (value == null) return null;
  const row = record(value);
  if (!row) return null;
  const repoPath = typeof row.repoPath === 'string' ? row.repoPath.trim() : '';
  const spaceId = typeof row.spaceId === 'string' ? row.spaceId.trim() : '';
  const projectId = typeof row.projectId === 'string' ? row.projectId.trim() : '';
  const runtimeId = typeof row.runtimeId === 'string' ? row.runtimeId.trim() : '';
  if (!repoPath || !spaceId || !projectId || !runtimeId) return null;
  return { repoPath, spaceId, projectId, runtimeId };
}

function backgroundState(value: unknown): BackgroundAgentControlState | null {
  const row = record(value);
  if (!row || row.version !== 1 || typeof row.running !== 'boolean') return null;
  const launchProfile = profile(row.launchProfile);
  if (row.launchProfile != null && !launchProfile) return null;
  return { version: 1, running: row.running, launchProfile };
}

function pullRequestState(value: unknown): PullRequestReviewControlState | null {
  const row = record(value);
  if (
    !row || row.version !== 1 || typeof row.running !== 'boolean' ||
    typeof row.includeDrafts !== 'boolean'
  ) return null;
  const launchProfile = profile(row.launchProfile);
  if (row.launchProfile != null && !launchProfile) return null;
  const reviewerRuntimeIds = Array.isArray(row.reviewerRuntimeIds)
    ? [...new Set(row.reviewerRuntimeIds
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean))]
    : [];
  const operatorId = typeof row.operatorId === 'string' && row.operatorId.trim()
    ? row.operatorId.trim()
    : null;
  return {
    version: 1,
    running: row.running,
    launchProfile,
    reviewerRuntimeIds,
    includeDrafts: row.includeDrafts,
    operatorId,
  };
}

export function createAgentAutomationStateStore(kv: KvStore): AgentAutomationStatePort {
  return {
    async loadBackgroundAgents() {
      return backgroundState(await kv.getJson<unknown>(NAMESPACE, BACKGROUND_KEY));
    },
    async saveBackgroundAgents(state) {
      await kv.setJson(NAMESPACE, BACKGROUND_KEY, state);
    },
    async loadPullRequestReviews() {
      return pullRequestState(await kv.getJson<unknown>(NAMESPACE, PR_REVIEW_KEY));
    },
    async savePullRequestReviews(state) {
      await kv.setJson(NAMESPACE, PR_REVIEW_KEY, state);
    },
    isDurable: () => kv.isDurable(),
  };
}
