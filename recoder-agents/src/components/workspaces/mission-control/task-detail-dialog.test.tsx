import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

import { dockerBackendApi } from '@/lib/docker-backend-api';

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
      <TaskDetailDialog taskId="task-123" open={true} onOpenChange={() => {}} />,
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
    expect(screen.getAllByText(/preview\.recoder\.xyz/).length).toBeGreaterThan(0);
    expect(screen.getByText('Pull request attached')).toBeTruthy();
  });
});
