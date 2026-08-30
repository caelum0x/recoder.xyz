import { describe, expect, it } from 'vitest';
import type {
  Artifact,
  GitHubDeliveryLink,
  Space,
  TaskRun,
  TaskSpec,
} from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import { loadRunHistory } from '../routes/agent-os.routes.js';

const now = '2026-08-30T10:00:00.000Z';

function space(): Space {
  return {
    spaceId: 'space-1',
    displayName: 'Recoder',
    ownerId: 'user-1',
    repositories: [],
    policy: {
      policyId: 'policy-1',
      approvalRequiredFor: [],
      forbiddenPaths: [],
      defaultVerificationCommands: [],
      allowNetworkByDefault: false,
      allowShellByDefault: false,
    },
    createdAt: now,
    updatedAt: now,
  };
}

describe('loadRunHistory', () => {
  it('builds the canonical PR/preview/approval timeline from durable repository records', async () => {
    const repository = new InMemoryAgentOsRepository();
    const task = {
      taskId: 'task-1',
      spaceId: 'space-1',
      title: 'Ship review history',
      description: 'Attach evidence',
      state: 'active',
      createdAt: now,
      updatedAt: now,
    } as TaskSpec;
    const run = {
      runId: 'run-1',
      taskId: task.taskId,
      spaceId: task.spaceId,
      state: 'running',
      createdAt: now,
      updatedAt: now,
    } as TaskRun;
    const pullRequest = {
      artifactId: 'artifact-pr',
      taskId: task.taskId,
      runId: run.runId,
      kind: 'pull_request',
      mimeType: 'application/json',
      public: false,
      createdAt: '2026-08-30T10:01:00.000Z',
      metadata: {
        url: 'https://github.com/recoder/recoder/pull/42',
        number: 42,
      },
    } as Artifact;
    const delivery = {
      linkId: 'delivery-1',
      taskId: task.taskId,
      runId: run.runId,
      repoId: 'repo-1',
      repository: 'recoder/recoder',
      branch: 'feat/history',
      baseBranch: 'main',
      pullRequestArtifactId: pullRequest.artifactId,
      pullRequestUrl: 'https://github.com/recoder/recoder/pull/42',
      pullRequestNumber: 42,
      previewArtifactIds: [],
      checks: [],
      reviews: [],
      status: 'pr_open',
      createdAt: now,
      updatedAt: '2026-08-30T10:02:00.000Z',
    } as GitHubDeliveryLink;

    repository.upsertSpace(space());
    repository.upsertTask(task);
    repository.upsertRun(run);
    repository.upsertArtifact(pullRequest);
    repository.upsertGitHubDeliveryLink(delivery);
    repository.upsertApproval({
      approvalId: 'approval-1',
      taskId: task.taskId,
      runId: run.runId,
      status: 'pending',
      reason: 'Review PR',
      requiredAt: 'before_merge',
      requestedBy: 'agent-1',
      requestedAt: '2026-08-30T10:03:00.000Z',
    });

    const history = await loadRunHistory(repository, run.runId);

    expect(history?.latest.pullRequestArtifactIds).toEqual(['artifact-pr']);
    expect(history?.latest.waitingApprovalIds).toEqual(['approval-1']);
    expect(history?.items.map(item => item.kind)).toEqual([
      'run_state',
      'artifact',
      'github_delivery_link',
      'approval',
    ]);
    expect(
      history?.items.find(item => item.kind === 'github_delivery_link')?.refs
        ?.pullRequestUrl
    ).toBe('https://github.com/recoder/recoder/pull/42');
  });

  it('returns null for an unknown run instead of fabricating an empty timeline', async () => {
    expect(
      await loadRunHistory(new InMemoryAgentOsRepository(), 'missing')
    ).toBeNull();
  });
});
