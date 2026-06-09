export type GitHubDeliveryLinkStatus =
  | 'branch_mapped'
  | 'pr_open'
  | 'checks_pending'
  | 'checks_failed'
  | 'review_required'
  | 'ready_for_approval'
  | 'merged'
  | 'closed'
  | 'blocked';

export type GitHubCheckState =
  | 'success'
  | 'failure'
  | 'pending'
  | 'skipped'
  | 'cancelled'
  | 'neutral'
  | 'action_required';

export type GitHubReviewState =
  | 'approved'
  | 'changes_requested'
  | 'commented'
  | 'pending'
  | 'dismissed';

export type GitHubCheckSummary = {
  name: string;
  state: GitHubCheckState;
  url?: string;
  completedAt?: string;
  details?: Record<string, unknown>;
};

export type GitHubReviewSummary = {
  reviewer: string;
  state: GitHubReviewState;
  url?: string;
  submittedAt?: string;
  body?: string;
};

export type GitHubDeliveryLink = {
  linkId: string;
  taskId: string;
  runId?: string;
  spaceId: string;
  repoId?: string;
  repository: string;
  branch: string;
  baseBranch?: string;
  issueNumber?: number | string;
  issueUrl?: string;
  pullRequestArtifactId?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number | string;
  previewArtifactIds: string[];
  checks: GitHubCheckSummary[];
  reviews: GitHubReviewSummary[];
  status: GitHubDeliveryLinkStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
};
