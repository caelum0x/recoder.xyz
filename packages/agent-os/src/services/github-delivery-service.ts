import type {
  Artifact,
  GitHubCheckSummary,
  GitHubDeliveryLink,
  GitHubDeliveryLinkStatus,
  GitHubReviewSummary,
  Space,
  SpaceRepositoryRef,
  TaskRun,
  TaskSpec,
} from '../domain';

export type ConnectGitHubRepositoryInput = {
  owner: string;
  name: string;
  repoId?: string;
  defaultBranch?: string;
  url?: string;
  now?: string;
};

export type CreateGitHubDeliveryLinkInput = {
  task: TaskSpec;
  run?: TaskRun;
  space?: Space;
  repoId?: string;
  repository?: string;
  branch?: string;
  baseBranch?: string;
  issueNumber?: number | string;
  issueUrl?: string;
  createdBy: string;
  now?: string;
  metadata?: Record<string, unknown>;
};

export class GitHubDeliveryService {
  connectRepository(space: Space, input: ConnectGitHubRepositoryInput): Space {
    const repo: SpaceRepositoryRef = {
      repoId: input.repoId ?? `github:${input.owner}/${input.name}`,
      provider: 'github',
      owner: input.owner,
      name: input.name,
      defaultBranch: input.defaultBranch,
      url: input.url ?? `https://github.com/${input.owner}/${input.name}`,
    };
    const repositories = [
      ...space.repositories.filter((candidate) => candidate.repoId !== repo.repoId),
      repo,
    ];
    return {
      ...space,
      repositories,
      updatedAt: input.now ?? new Date().toISOString(),
    };
  }

  createLink(input: CreateGitHubDeliveryLinkInput): GitHubDeliveryLink {
    const now = input.now ?? new Date().toISOString();
    const repository = input.repository ?? resolveRepository(input.space, input.repoId) ?? input.task.repo;
    if (!repository) {
      throw new Error('repository is required');
    }

    const branch = input.branch ?? branchForTask(input.task);
    return {
      linkId: `github_delivery_${input.task.taskId}_${slug(branch)}`,
      taskId: input.task.taskId,
      runId: input.run?.runId,
      spaceId: input.task.spaceId,
      repoId: input.repoId,
      repository,
      branch,
      baseBranch: input.baseBranch ?? resolveBaseBranch(input.space, input.repoId),
      issueNumber: input.issueNumber,
      issueUrl: input.issueUrl,
      previewArtifactIds: [],
      checks: [],
      reviews: [],
      status: 'branch_mapped',
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
      metadata: input.metadata,
    };
  }

  attachPullRequest(link: GitHubDeliveryLink, artifact: Artifact, now = new Date().toISOString()): GitHubDeliveryLink {
    if (artifact.kind !== 'pull_request') {
      throw new Error(`artifact is not a pull_request: ${artifact.artifactId}`);
    }

    const pullRequestUrl = stringMetadata(artifact, 'url') ?? artifact.provenance?.sourceUrl;
    return this.withStatus({
      ...link,
      pullRequestArtifactId: artifact.artifactId,
      pullRequestUrl,
      pullRequestNumber: stringOrNumberMetadata(artifact, 'number'),
      repository: stringMetadata(artifact, 'repository') ?? link.repository,
      branch: stringMetadata(artifact, 'branch') ?? link.branch,
      updatedAt: now,
    });
  }

  attachPreview(link: GitHubDeliveryLink, artifact: Artifact, now = new Date().toISOString()): GitHubDeliveryLink {
    if (artifact.kind !== 'preview') {
      throw new Error(`artifact is not a preview: ${artifact.artifactId}`);
    }

    return this.withStatus({
      ...link,
      previewArtifactIds: [...new Set([...link.previewArtifactIds, artifact.artifactId])],
      updatedAt: now,
    });
  }

  syncChecks(link: GitHubDeliveryLink, checks: GitHubCheckSummary[], now = new Date().toISOString()): GitHubDeliveryLink {
    return this.withStatus({
      ...link,
      checks,
      updatedAt: now,
    });
  }

  syncReviews(link: GitHubDeliveryLink, reviews: GitHubReviewSummary[], now = new Date().toISOString()): GitHubDeliveryLink {
    return this.withStatus({
      ...link,
      reviews,
      updatedAt: now,
    });
  }

  linkIssue(
    link: GitHubDeliveryLink,
    input: { issueNumber?: number | string; issueUrl?: string; now?: string },
  ): GitHubDeliveryLink {
    return this.withStatus({
      ...link,
      issueNumber: input.issueNumber ?? link.issueNumber,
      issueUrl: input.issueUrl ?? link.issueUrl,
      updatedAt: input.now ?? new Date().toISOString(),
    });
  }

  private withStatus(link: GitHubDeliveryLink): GitHubDeliveryLink {
    return {
      ...link,
      status: deriveStatus(link),
    };
  }
}

function resolveRepository(space?: Space, repoId?: string): string | undefined {
  const repo = repoId
    ? space?.repositories.find((candidate) => candidate.repoId === repoId)
    : space?.repositories.find((candidate) => candidate.provider === 'github');
  return repo ? `${repo.owner}/${repo.name}` : undefined;
}

function resolveBaseBranch(space?: Space, repoId?: string): string | undefined {
  const repo = repoId
    ? space?.repositories.find((candidate) => candidate.repoId === repoId)
    : space?.repositories.find((candidate) => candidate.provider === 'github');
  return repo?.defaultBranch;
}

function branchForTask(task: TaskSpec): string {
  return `recoder/${task.taskId}`;
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function stringMetadata(artifact: Artifact, key: string): string | undefined {
  const value = artifact.metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringOrNumberMetadata(artifact: Artifact, key: string): string | number | undefined {
  const value = artifact.metadata?.[key];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function deriveStatus(link: GitHubDeliveryLink): GitHubDeliveryLinkStatus {
  if (link.checks.some((check) => check.state === 'failure' || check.state === 'cancelled' || check.state === 'action_required')) {
    return 'checks_failed';
  }
  if (link.checks.some((check) => check.state === 'pending')) {
    return 'checks_pending';
  }
  if (link.reviews.some((review) => review.state === 'changes_requested')) {
    return 'review_required';
  }
  if (
    link.pullRequestArtifactId &&
    link.previewArtifactIds.length > 0 &&
    link.checks.length > 0 &&
    link.checks.every((check) => check.state === 'success' || check.state === 'skipped' || check.state === 'neutral')
  ) {
    return 'ready_for_approval';
  }
  if (link.pullRequestArtifactId && link.previewArtifactIds.length > 0 && link.checks.length === 0) {
    // PR + preview exist but no CI checks have reported yet. Do not imply
    // readiness without check evidence — surface that checks are still pending.
    return 'checks_pending';
  }
  if (link.pullRequestArtifactId) {
    return 'pr_open';
  }
  return 'branch_mapped';
}
