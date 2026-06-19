import { beforeEach, describe, expect, it } from 'vitest';
import { GitHubDeliveryService, type TaskSpec } from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';
import { agentOsContainer } from '../service-container';
import { ingestGitHubWebhook } from './github-webhook.routes';

const now = '2026-06-13T10:00:00.000Z';

describe('Agent OS GitHub webhook ingestion', () => {
  beforeEach(() => {
    agentOsContainer.repository = new InMemoryAgentOsRepository();
    agentOsContainer.repositoryDriver = 'memory';
  });

  it('attaches pull request artifacts to matching delivery links', async () => {
    const task: TaskSpec = {
      taskId: 'task-github-delivery',
      title: 'Ship GitHub delivery flow',
      intent: 'feature_delivery',
      goal: 'Create a pull request for the paid-user delivery path.',
      spaceId: 'space-1',
      repo: 'recoder/recoder.xyz',
      targetPaths: ['docker-backend/src/agent-os'],
      forbiddenPaths: [],
      acceptanceCriteria: ['PR is linked to the Agent OS task'],
      verification: { commands: ['pnpm --dir docker-backend run build'] },
      approvalRequired: [],
      artifactRequired: ['pull_request'],
    };
    await agentOsContainer.repository.upsertTask(task);

    const delivery = new GitHubDeliveryService().createLink({
      task,
      repository: 'recoder/recoder.xyz',
      branch: 'recoder/task-github-delivery',
      createdBy: 'test',
      now,
    });
    await agentOsContainer.repository.upsertGitHubDeliveryLink(delivery);

    const result = await ingestGitHubWebhook('pull_request', {
      action: 'opened',
      repository: {
        full_name: 'recoder/recoder.xyz',
      },
      pull_request: {
        number: 42,
        html_url: 'https://github.com/recoder/recoder.xyz/pull/42',
        title: 'Ship GitHub delivery flow',
        body: 'Implements the production path.\n\nFixes #123',
        state: 'open',
        merged: false,
        updated_at: '2026-06-13T10:05:00.000Z',
        head: {
          ref: 'recoder/task-github-delivery',
        },
      },
    });

    expect(result).toEqual({
      event: 'pull_request',
      matched: true,
      linkId: delivery.linkId,
      status: 'pr_open',
    });

    const [storedLink] = await agentOsContainer.repository.listGitHubDeliveryLinks();
    expect(storedLink.pullRequestNumber).toBe(42);
    expect(storedLink.pullRequestUrl).toBe('https://github.com/recoder/recoder.xyz/pull/42');
    expect(storedLink.issueNumber).toBe(123);
    expect(storedLink.issueUrl).toBe('https://github.com/recoder/recoder.xyz/issues/123');
    expect(storedLink.status).toBe('pr_open');

    const [artifact] = await agentOsContainer.repository.listArtifacts();
    expect(artifact).toMatchObject({
      taskId: task.taskId,
      kind: 'pull_request',
      createdBy: 'github-webhook',
      public: true,
      metadata: {
        repository: 'recoder/recoder.xyz',
        branch: 'recoder/task-github-delivery',
        number: 42,
      },
    });
    expect(storedLink.pullRequestArtifactId).toBe(artifact.artifactId);

    const outbox = await agentOsContainer.repository.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.status).toBe('pending');
    expect(outbox[0]?.event.type).toBe('recoder.artifact.created');
  });

  it('leaves unmatched pull request webhook payloads as accepted-but-unmatched', async () => {
    const result = await ingestGitHubWebhook('pull_request', {
      repository: { full_name: 'recoder/recoder.xyz' },
      pull_request: {
        number: 99,
        html_url: 'https://github.com/recoder/recoder.xyz/pull/99',
        head: { ref: 'recoder/unknown-task' },
      },
    });

    expect(result).toEqual({ event: 'pull_request', matched: false });
    expect(await agentOsContainer.repository.listArtifacts()).toHaveLength(0);
    expect(await agentOsContainer.repository.listOutbox()).toHaveLength(0);
  });
});
