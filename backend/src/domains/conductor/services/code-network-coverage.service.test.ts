import { describe, expect, it } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import { createCodeNetworkCoverageService, knownRepositoryCandidates } from './code-network-coverage.service.js';

function workspace(input: Partial<Workspace> & Pick<Workspace, 'workspaceId' | 'projectId' | 'updatedAt'>): Workspace {
  return {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    updatedAt: input.updatedAt,
    spaceId: 'space',
    taskId: 'task',
    runtimeId: 'codex',
    substrate: 'loom',
    branch: 'work',
    baseRef: 'main',
    state: 'archived',
    createdBy: 'user',
    createdAt: input.updatedAt,
    ...input,
  };
}

describe('code-network coverage', () => {
  it('deduplicates durable workspaces by canonical repo and prefers the saved source path', () => {
    expect(knownRepositoryCandidates([
      workspace({
        workspaceId: 'new', projectId: 'project-a', updatedAt: '2026-08-30T12:00:00Z',
        worktreePath: '/worktrees/new', metadata: { repoId: 'acme__a', repoPath: '/repos/a' },
      }),
      workspace({
        workspaceId: 'old', projectId: 'project-a', updatedAt: '2026-08-29T12:00:00Z',
        worktreePath: '/worktrees/old', metadata: { repoId: 'acme__a' },
      }),
      workspace({
        workspaceId: 'legacy', projectId: 'project-b', updatedAt: '2026-08-28T12:00:00Z',
        worktreePath: '/worktrees/b',
      }),
    ])).toEqual([
      { repoId: 'acme__a', repoPath: '/repos/a' },
      { repoId: 'project-b', repoPath: '/worktrees/b' },
    ]);
  });

  it('reports actual indexed and unavailable repository counts', async () => {
    const workspaces = [
      workspace({
        workspaceId: 'a', projectId: 'a', updatedAt: '2026-08-30T12:00:00Z',
        metadata: { repoId: 'acme__a', repoPath: '/repos/a' },
      }),
      workspace({
        workspaceId: 'b', projectId: 'b', updatedAt: '2026-08-30T12:00:00Z',
        metadata: { repoId: 'acme__b', repoPath: '/repos/b' },
      }),
    ];
    const service = createCodeNetworkCoverageService({
      repository: { listWorkspaces: async () => workspaces },
      codeIntel: {
        async indexRepo() {},
        async indexRepoWithResult(_path, repoId) {
          return repoId === 'acme__a' ? { indexed: true } : { indexed: false, reason: 'missing checkout' };
        },
        async reindexRepo() {},
        async trackWork() {},
        async completeWork() {},
        async deliverWork() {},
      },
      now: () => '2026-08-30T13:00:00Z',
    });

    await expect(service.refresh()).resolves.toEqual({
      status: 'partial',
      discoveredRepositories: 2,
      indexedRepositories: 1,
      unavailableRepositories: 1,
      repositories: [
        { repoId: 'acme__a', status: 'indexed' },
        { repoId: 'acme__b', status: 'unavailable', reason: 'missing checkout' },
      ],
      updatedAt: '2026-08-30T13:00:00Z',
    });
  });

  it('reports discovery failure instead of remaining stuck in indexing', async () => {
    const service = createCodeNetworkCoverageService({
      repository: { listWorkspaces: async () => { throw new Error('workspace store unavailable'); } },
      codeIntel: {
        async indexRepo() {},
        async reindexRepo() {},
        async trackWork() {},
        async completeWork() {},
        async deliverWork() {},
      },
      now: () => '2026-08-30T13:01:00Z',
    });

    await expect(service.refresh()).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'workspace store unavailable',
      updatedAt: '2026-08-30T13:01:00Z',
    });
  });
});
