/**
 * Pull-request review-agent seams. Agent-os owns the watcher and its lifecycle;
 * bootstrap adapts the GitHub engine and Conductor behind these narrow ports.
 * No GitHub write is exposed here: review delivery stays human-owned.
 */
import type { SquadAutopilotLaunchProfile } from './squad-autopilot.port.js';
import type {
  CodeImpactDirection,
  CodeImpactFile,
  CodeImpactLedger,
  CodeImpactRisk,
} from '../../../shared/code-impact-ledger.js';
import type { JiraRequirement } from './jira-requirement.port.js';

export interface PullRequestReviewRuleDefinition {
  readonly id: string;
  readonly level: 'required' | 'advisory';
  readonly text: string;
  readonly source: string;
  /** Exact `.recoder/checks.json` name whose result is authoritative for this rule. */
  readonly check?: string;
}

export interface PullRequestReviewCheckEvidence {
  readonly name: string;
  readonly status: 'pass' | 'fail' | 'error' | 'missing' | 'ambiguous' | 'unavailable' | 'running';
  readonly detail?: string;
  readonly autofix?: boolean;
}

export type PullRequestImpactDirection = CodeImpactDirection;
export type PullRequestImpactRisk = CodeImpactRisk;
export type PullRequestImpactFile = CodeImpactFile;

export interface PullRequestImpactContext extends CodeImpactLedger {
  readonly changedSymbols: readonly string[];
}

export interface PullRequestCandidate {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly headSha: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly isDraft: boolean;
  readonly updatedAt: string;
  readonly author?: string;
}

export interface PullRequestReviewContext extends PullRequestCandidate {
  readonly body?: string;
  readonly diff: string | null;
  readonly diffTruncated: boolean;
  readonly diffUnavailable?: string;
  readonly renames?: readonly { readonly from: string; readonly to: string }[];
  readonly linkedRequirements?: readonly {
    readonly number: number;
    readonly title: string;
    readonly body: string;
    readonly state: 'OPEN' | 'CLOSED';
    readonly url: string;
    readonly labels: readonly string[];
  }[];
  readonly unavailableRequirements?: readonly { readonly number: number; readonly reason: string }[];
  readonly linkedBeadsRequirements?: readonly {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    readonly status?: string;
    readonly labels?: readonly string[];
    readonly comments?: readonly unknown[];
    readonly dependencies?: readonly unknown[];
  }[];
  readonly unavailableBeadsRequirements?: readonly { readonly id: string; readonly reason: string }[];
  readonly linkedJiraRequirements?: readonly JiraRequirement[];
  readonly unavailableJiraRequirements?: readonly { readonly key: string; readonly reason: string }[];
  readonly reviewRules?: readonly PullRequestReviewRuleDefinition[];
  readonly reviewRuleChecks?: readonly PullRequestReviewCheckEvidence[];
  readonly reviewRulesUnavailable?: { readonly source?: string; readonly reason: string };
  readonly impact?: PullRequestImpactContext;
}

export interface PullRequestSourcePort {
  listOpen(input: {
    readonly repoPath: string;
    readonly limit: number;
  }): Promise<
    | { readonly ok: true; readonly pullRequests: readonly PullRequestCandidate[] }
    | { readonly ok: false; readonly reason: string }
  >;
  reviewContext(input: {
    readonly repoPath: string;
    readonly number: number;
  }): Promise<
    | { readonly ok: true; readonly context: PullRequestReviewContext }
    | { readonly ok: false; readonly reason: string }
  >;
}

export interface PullRequestReviewDispatchRequest {
  readonly profile: SquadAutopilotLaunchProfile;
  readonly ownerId: string;
  readonly pullRequest: PullRequestReviewContext;
  readonly prompt: string;
  readonly role?: 'reviewer' | 'validator';
}

export interface PullRequestFindingFixTarget {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly defectKey: string;
  readonly symbol?: string;
  readonly severity: string;
  readonly message: string;
  readonly evidence: readonly string[];
  readonly validation?: {
    readonly verdict: 'confirmed' | 'rejected' | 'uncertain';
    readonly rationale: string;
    readonly evidence: string;
  };
}

export interface PullRequestFindingFixWorkspaceRef extends PullRequestReviewWorkspaceRef {
  readonly findingKey: string;
  readonly headSha: string;
  readonly createdAt?: string;
}

export interface PullRequestReviewWorkspaceRef {
  readonly workspaceId: string;
  readonly state?: string;
  readonly runtimeId?: string;
}

export interface PullRequestReviewTarget extends PullRequestReviewWorkspaceRef {
  readonly spaceId?: string;
  readonly projectId?: string;
  readonly repoPath: string;
  readonly number: number;
  readonly url: string;
  readonly headSha: string;
  readonly title: string;
  readonly baseRefName?: string;
  readonly headRefName?: string;
  readonly updatedAt?: string;
  readonly ownerId?: string;
  readonly linkedRequirements?: readonly {
    readonly number: number;
    readonly title: string;
    readonly state: 'OPEN' | 'CLOSED';
    readonly url: string;
  }[];
  readonly unavailableRequirements?: readonly { readonly number: number; readonly reason: string }[];
  readonly linkedBeadsRequirements?: readonly {
    readonly id: string;
    readonly title: string;
    readonly status?: string;
  }[];
  readonly unavailableBeadsRequirements?: readonly { readonly id: string; readonly reason: string }[];
  readonly linkedJiraRequirements?: readonly JiraRequirement[];
  readonly unavailableJiraRequirements?: readonly { readonly key: string; readonly reason: string }[];
  readonly reviewRules?: readonly PullRequestReviewRuleDefinition[];
  readonly reviewRuleChecks?: readonly PullRequestReviewCheckEvidence[];
  readonly reviewRulesUnavailable?: { readonly source?: string; readonly reason: string };
  readonly impact?: PullRequestImpactContext;
}

export interface PullRequestReviewConductorPort {
  findExisting(input: {
    readonly repoPath: string;
    readonly number: number;
    readonly headSha: string;
    readonly runtimeId: string;
    readonly role?: 'reviewer' | 'validator';
  }): Promise<PullRequestReviewWorkspaceRef | null>;
  getReviewTarget(workspaceId: string): Promise<PullRequestReviewTarget | null>;
  reviewHistory(workspaceId: string): Promise<readonly {
    readonly workspaceId: string;
    readonly runtimeId: string;
    readonly headSha: string;
    readonly updatedAt: string;
    readonly state?: string;
    readonly output: string;
    readonly renames?: readonly { readonly from: string; readonly to: string }[];
  }[]>;
  validation?(workspaceId: string): Promise<{
    readonly workspaceId: string;
    readonly runtimeId: string;
    readonly state?: string;
    readonly output: string;
    readonly reviewRuleChecks?: readonly PullRequestReviewCheckEvidence[];
  } | null>;
  captureReviewRuleChecks?(
    workspaceId: string,
    checkNames: readonly string[],
  ): Promise<readonly PullRequestReviewCheckEvidence[]>;
  listFindingFixes?(workspaceId: string): Promise<readonly PullRequestFindingFixWorkspaceRef[]>;
  dispatchFindingFix?(input: {
    readonly target: PullRequestReviewTarget;
    readonly finding: PullRequestFindingFixTarget;
    readonly runtimeId: string;
    readonly ownerId: string;
    readonly prompt: string;
  }): Promise<
    | { readonly ok: true; readonly workspaceId: string; readonly runId?: string; readonly existing: boolean }
    | { readonly ok: false; readonly reason: string }
  >;
  dispatch(input: PullRequestReviewDispatchRequest): Promise<
    | { readonly ok: true; readonly workspaceId: string; readonly runId?: string }
    | { readonly ok: false; readonly reason: string }
  >;
}

export type PullRequestReviewEvent = 'comment' | 'approve' | 'request_changes';

export interface PullRequestInlineReviewComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
}

export interface PullRequestReviewPublisherPort {
  publish(input: {
    readonly repoPath: string;
    readonly number: number;
    readonly commitId: string;
    readonly event: PullRequestReviewEvent;
    readonly body: string;
    readonly comments?: readonly PullRequestInlineReviewComment[];
  }): Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string }
  >;
  listThreads?(input: {
    readonly repoPath: string;
    readonly number: number;
  }): Promise<
    | {
        readonly ok: true;
        readonly threads: readonly {
          readonly id: string;
          readonly path: string;
          readonly line: number;
          readonly isResolved: boolean;
          readonly isOutdated: boolean;
          readonly rootBody: string;
          readonly url?: string;
          readonly resolvedBy?: string;
        }[];
      }
    | { readonly ok: false; readonly reason: string }
  >;
}

export interface PullRequestReviewApprovalPort {
  findPending(input: {
    readonly taskId: string;
    readonly action: string;
    readonly requestedBy: string;
  }): Promise<{ readonly id: string } | null>;
  request(input: {
    readonly taskId: string;
    readonly action: string;
    readonly requestedBy: string;
    readonly target: string;
    readonly riskTier: 'low' | 'medium' | 'high' | 'critical';
    readonly reason: string;
  }): Promise<{ readonly id: string }>;
}

export type PullRequestFindingFeedbackDisposition = 'accepted' | 'dismissed';

export interface PullRequestFindingFeedbackRecord {
  readonly repoPath: string;
  readonly signature: string;
  readonly file: string;
  readonly defectKey: string;
  readonly symbol?: string;
  readonly disposition: PullRequestFindingFeedbackDisposition;
  readonly actorId: string;
  readonly updatedAt: string;
}

export interface PullRequestReviewFeedbackPort {
  list(repoPath: string): Promise<readonly PullRequestFindingFeedbackRecord[]>;
  stats?(repoPath: string): Promise<{
    readonly acceptedDecisions: number;
    readonly dismissedDecisions: number;
    readonly totalDecisions: number;
    readonly dismissalRate: number;
    readonly startedAt?: string;
    readonly updatedAt?: string;
    readonly coverage: 'since_metrics_enabled' | 'migrated_active_rules';
  }>;
  upsert(record: PullRequestFindingFeedbackRecord): Promise<void>;
  delete(repoPath: string, signature: string): Promise<void>;
  readonly durable: boolean;
}
