import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubDeliveryService, type TaskSpec } from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';
import { agentOsContainer } from '../service-container';
import { RecoderGitService, type IndexState, type IndexStateStore } from '../recodergit-service';
import {
  ingestGitHubWebhook,
  reindexConnectedRepoOnPush,
  processAgentOsGitHubWebhook,
  extractPushChangedFiles,
} from './github-webhook.routes';

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

describe('Agent OS GitHub webhook -> code-graph push reindex (additive, non-blocking)', () => {
  // full_name 'recoder/recoder.xyz' -> repoIdFromFullName collapses '/' and '.' to '__'.
  const CONNECTED_REPO_ID = 'recoder__recoder__xyz';

  const PUSH_PAYLOAD: Record<string, unknown> = {
    ref: 'refs/heads/main',
    repository: { full_name: 'recoder/recoder.xyz' },
    commits: [
      { added: ['a.ts'], modified: ['b.ts'], removed: [] },
      { modified: ['b.ts', 'c.ts'], removed: ['d.ts'] },
    ],
  };

  function makeStore(seedConnected: boolean): IndexStateStore {
    const states = new Map<string, IndexState>();
    if (seedConnected) {
      states.set(CONNECTED_REPO_ID, {
        repoId: CONNECTED_REPO_ID,
        repoRoot: '/managed/' + CONNECTED_REPO_ID,
        branch: 'main',
        lastIndexedSha: 'sha',
        indexedAt: '2026-06-26T00:00:00.000Z',
        nodes: 1,
        edges: 1,
        status: 'indexed',
      });
    }
    return {
      get: (repoId) => states.get(repoId) ?? null,
      set: (repoId, state) => {
        states.set(repoId, state);
      },
    };
  }

  function makeService(opts: { enabled: boolean; connected: boolean }): RecoderGitService {
    return new RecoderGitService({
      isEnabled: () => opts.enabled,
      exec: async () => ({ stdout: '1 nodes | 1 edges', stderr: '', code: 0 }),
      git: { headSha: async () => 'sha', currentBranch: async () => 'main', clone: async () => {} },
      store: makeStore(opts.connected),
      workdirRoot: () => '/managed',
      logger: { error: vi.fn() },
    });
  }

  it('push for a connected repo triggers reindexOnPush with derived repoId + changedFiles', async () => {
    const service = makeService({ enabled: true, connected: true });
    const spy = vi.spyOn(service, 'reindexOnPush');

    const result = await reindexConnectedRepoOnPush(service, 'push', PUSH_PAYLOAD);

    expect(result).toMatchObject({ triggered: true, repoId: CONNECTED_REPO_ID });
    expect(spy).toHaveBeenCalledWith({
      repoId: CONNECTED_REPO_ID,
      changedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
    });
  });

  it('flag OFF -> no reindex, no engine work', async () => {
    const service = makeService({ enabled: false, connected: true });
    const spy = vi.spyOn(service, 'reindexOnPush');

    const result = await reindexConnectedRepoOnPush(service, 'push', PUSH_PAYLOAD);

    expect(result).toEqual({ triggered: false, reason: 'disabled' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('unconnected/unknown repo -> skipped (not_connected)', async () => {
    const service = makeService({ enabled: true, connected: false });
    const spy = vi.spyOn(service, 'reindexOnPush');

    const result = await reindexConnectedRepoOnPush(service, 'push', PUSH_PAYLOAD);

    expect(result).toMatchObject({ triggered: false, reason: 'not_connected' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('non-push event -> skipped', async () => {
    const service = makeService({ enabled: true, connected: true });
    const spy = vi.spyOn(service, 'reindexOnPush');

    const result = await reindexConnectedRepoOnPush(service, 'pull_request', PUSH_PAYLOAD);

    expect(result).toEqual({ triggered: false, reason: 'not_push' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reindex THROWS -> webhook still returns its normal success (non-blocking proven)', async () => {
    const service = makeService({ enabled: true, connected: true });
    vi.spyOn(service, 'reindexOnPush').mockRejectedValue(new Error('reindex boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await processAgentOsGitHubWebhook('push', PUSH_PAYLOAD, service);

    // Response is byte-identical to the no-reindex path despite the failure.
    expect(response).toEqual({
      status: 202,
      body: { success: true, data: { event: 'push', matched: false } },
    });

    // Let the fire-and-forget rejection settle: it is swallowed + logged, never thrown.
    await new Promise((resolve) => setImmediate(resolve));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('extractPushChangedFiles dedupes across commits; undefined when none', () => {
    expect(extractPushChangedFiles(PUSH_PAYLOAD)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    expect(extractPushChangedFiles({ commits: [] })).toBeUndefined();
    expect(extractPushChangedFiles({})).toBeUndefined();
  });
});
