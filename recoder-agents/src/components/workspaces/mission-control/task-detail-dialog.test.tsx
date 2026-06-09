import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskDetailDialog } from './task-detail-dialog';

vi.mock('@/lib/docker-backend-api', () => ({
  dockerBackendApi: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/hooks/workspaces/use-workspaces', () => ({
  useWorkspace: vi.fn(),
}));

import { dockerBackendApi } from '@/lib/docker-backend-api';
import { useWorkspace } from '@/hooks/workspaces/use-workspaces';

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TaskDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWorkspace).mockReturnValue({
      data: {
        workspaceId: 'ws-123',
        projectId: 'project-123',
      },
    } as any);
  });

  it('renders pull request, approval, and preview deployment details from task context', async () => {
    vi.mocked(dockerBackendApi.get).mockResolvedValue({
      success: true,
      data: {
        task: {
          id: 'task-123',
          state: 'working',
          result: {
            preview: [{ url: 'https://preview.recoder.xyz/access/deploy-123' }],
          },
        },
        links: {
          approval: {
            approvalId: 'approval-123',
            status: 'pending',
            action: 'deploy',
            resolvedBy: null,
            grantedBy: null,
          },
        },
        delivery: {
          githubIssue: {
            repo: 'recoder/recoder.xyz',
            issueUrl: 'https://github.com/recoder/recoder.xyz/issues/7',
            issueNumber: 7,
            title: 'Link task delivery state to issue',
            state: 'open',
            labels: ['launch-gate'],
          },
          githubPullRequest: {
            repo: 'recoder/recoder.xyz',
            prUrl: 'https://github.com/recoder/recoder.xyz/pull/42',
            prNumber: 42,
            state: 'open',
            title: 'Add task delivery visibility',
            head: 'feature/task-delivery',
            base: 'main',
            draft: false,
          },
          previewDeployment: {
            projectId: 'project-123',
            protectionMode: 'signed',
            protectedPreviewUrl: 'https://preview.recoder.xyz/access/deploy-123',
            basePreviewUrl: 'https://preview.recoder.xyz/deploy-123',
            branchName: 'feature/task-delivery',
          },
        },
        review: null,
        instructions: {
          sharedGoal: 'Compile agent instructions from repo policy',
          compilerVersion: '0.1.0',
          compiledAt: '2026-06-06T00:00:00.000Z',
          promptLength: 1280,
          artifactPath: '.recoder/artifacts/instruction-bundle-task-123.json',
          verificationCommands: ['pnpm test', 'pnpm check-types'],
          sourceFiles: [
            { path: 'AGENTS.md', sha: 'abc123' },
            { path: '.codex/AGENTS.md', sha: 'def456' },
          ],
          approvalGates: [
            {
              approvalId: 'approval-123',
              title: 'Push approval',
              status: 'pending',
              requiredAt: 'before_push',
              reason: 'Push approval required',
            },
          ],
          memoryRefs: [
            { memoryId: 'memory-1', scope: 'repo', title: 'Use pnpm test' },
          ],
          forbiddenActions: ['Do not modify .env*'],
        },
        memoryCandidates: [
          {
            candidateId: 'memory_candidate_1',
            scope: 'repo',
            title: 'recoder-web build command',
            body: 'Use `pnpm -F recoder-web build` for production route validation.',
            status: 'approved',
            proposedBy: 'codex',
            reviewedBy: 'pm-agent',
            reviewReason: 'Verified against task evidence',
            approvedMemoryId: 'mem_approved_1',
            createdAt: '2026-06-06T00:00:00.000Z',
            updatedAt: '2026-06-06T00:05:00.000Z',
          },
        ],
        runtime: {
          filesChanged: [],
          artifacts: [],
        },
        timeline: [
          {
            at: new Date().toISOString(),
            type: 'github.pull_request',
            title: 'Pull request attached',
            detail: 'Add task delivery visibility · #42',
            href: 'https://github.com/recoder/recoder.xyz/pull/42',
          },
        ],
      },
    } as any);

    renderWithQuery(
      <TaskDetailDialog taskId="task-123" workspaceId="ws-123" open={true} onOpenChange={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Delivery')).toBeTruthy();
    });

    expect(screen.getByText('Add task delivery visibility')).toBeTruthy();
    expect(screen.getAllByText('recoder/recoder.xyz').length).toBeGreaterThan(0);
    expect(screen.getByText('#42')).toBeTruthy();
    expect(screen.getByText('#7')).toBeTruthy();
    expect(screen.getByText('approval-123')).toBeTruthy();
    expect(screen.getByText('signed')).toBeTruthy();
    expect(screen.getByText('Instruction Bundle')).toBeTruthy();
    expect(screen.getByText('Compile agent instructions from repo policy')).toBeTruthy();
    expect(screen.getByText('.recoder/artifacts/instruction-bundle-task-123.json')).toBeTruthy();
    expect(screen.getByText('AGENTS.md')).toBeTruthy();
    expect(screen.getByText('repo:Use pnpm test')).toBeTruthy();
    expect(screen.getByText('Do not modify .env*')).toBeTruthy();
    expect(screen.getByText('Memory Candidates')).toBeTruthy();
    expect(screen.getByText('recoder-web build command')).toBeTruthy();
    expect(screen.getByText('Use `pnpm -F recoder-web build` for production route validation.')).toBeTruthy();
    expect(screen.getByText(/Approved memory: mem_approved_1/)).toBeTruthy();
    expect(screen.getAllByText(/preview\.recoder\.xyz/).length).toBeGreaterThan(0);
    expect(screen.getByText('Pull request attached')).toBeTruthy();
    expect(screen.getByText('Refresh protected preview')).toBeTruthy();
  });

  it('creates a protected preview from mission control', async () => {
    vi.mocked(dockerBackendApi.get).mockResolvedValue({
      success: true,
      data: {
        task: {
          id: 'task-456',
          state: 'working',
          result: {
            preview: [],
          },
        },
        links: {},
        delivery: {
          githubPullRequest: {
            repo: 'recoder/recoder.xyz',
            prUrl: 'https://github.com/recoder/recoder.xyz/pull/42',
            prNumber: 42,
            state: 'open',
            title: 'Add task delivery visibility',
            head: 'feature/task-delivery',
            base: 'main',
            draft: false,
          },
        },
        review: {
          worktree: {
            branchName: 'feature/task-delivery',
          },
        },
        runtime: {
          filesChanged: [],
          artifacts: [],
        },
        timeline: [],
      },
    } as any);
    vi.mocked(dockerBackendApi.post).mockResolvedValue({
      success: true,
      data: {
        previewDeployment: {
          deploymentId: 'deploy-456',
        },
      },
    } as any);

    renderWithQuery(
      <TaskDetailDialog taskId="task-456" workspaceId="ws-123" open={true} onOpenChange={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Create protected preview')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Create protected preview'));

    await waitFor(() => {
      expect(dockerBackendApi.post).toHaveBeenCalledWith(
        '/api/a2a/tasks/task-456/preview-deploy',
        expect.objectContaining({
          projectId: 'project-123',
          branchName: 'feature/task-delivery',
          prUrl: 'https://github.com/recoder/recoder.xyz/pull/42',
          prNumber: 42,
          protectionMode: 'signed',
        }),
      );
    });
  });
});
