import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkspaceRepoPanel } from './workspace-repo-panel';

vi.mock('@/hooks/workspaces/use-workspace-repo', () => ({
  useWorkspaceRepoSnapshot: vi.fn(),
  useCloneWorkspaceRepo: vi.fn(),
  useWorkspacePullRequests: vi.fn(),
  useWorkspacePullRequestDetail: vi.fn(),
  useCreateWorkspacePullRequest: vi.fn(),
}));

vi.mock('@/hooks/workspaces/use-mission-control', () => ({
  useTaskPipeline: vi.fn(),
}));

import {
  useWorkspaceRepoSnapshot,
  useCloneWorkspaceRepo,
  useWorkspacePullRequests,
  useWorkspacePullRequestDetail,
  useCreateWorkspacePullRequest,
} from '@/hooks/workspaces/use-workspace-repo';
import { useTaskPipeline } from '@/hooks/workspaces/use-mission-control';

describe('WorkspaceRepoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useWorkspaceRepoSnapshot).mockReturnValue({
      data: {
        status: { branch: 'feature/repo-panel' },
        remotes: [{ name: 'origin', url: 'https://github.com/recoder/recoder.xyz.git' }],
        origin: { name: 'origin', url: 'https://github.com/recoder/recoder.xyz.git' },
        isConnected: true,
      },
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(useCloneWorkspaceRepo).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    vi.mocked(useWorkspacePullRequests).mockReturnValue({
      data: [
        {
          number: 42,
          url: 'https://github.com/recoder/recoder.xyz/pull/42',
          state: 'open',
          title: 'Add workspace repo panel',
          draft: false,
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useWorkspacePullRequestDetail).mockReturnValue({
      data: {
        pullRequest: {
          number: 42,
          url: 'https://github.com/recoder/recoder.xyz/pull/42',
          state: 'open',
          title: 'Add workspace repo panel',
          mergeableState: 'clean',
        },
        reviews: [{ user: 'alice', state: 'APPROVED' }],
        checks: [{ name: 'ci', status: 'completed', conclusion: 'success' }],
      },
      refetch: vi.fn(),
    } as any);

    vi.mocked(useCreateWorkspacePullRequest).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    vi.mocked(useTaskPipeline).mockReturnValue({
      data: [
        {
          id: 'task-123',
          prompt: 'Prepare pricing page PR',
          state: 'working',
          review: {
            worktree: {
              branchName: 'feature/pricing-page',
            },
          },
        },
      ],
    } as any);
  });

  it('renders connected repo state and token-gated pull request section', () => {
    render(<WorkspaceRepoPanel projectId="project-123" workspaceId="ws-123" />);

    expect(screen.getByText('Repository & Pull Requests')).toBeTruthy();
    expect(screen.getByText('project-123')).toBeTruthy();
    expect(screen.getByText('https://github.com/recoder/recoder.xyz.git')).toBeTruthy();
    expect(screen.getByText('Create PR')).toBeTruthy();
    expect(screen.getByText('Attach to workspace task')).toBeTruthy();
    expect(screen.getByText('Enter a GitHub token to load PR review and check state.')).toBeTruthy();
  });
});
