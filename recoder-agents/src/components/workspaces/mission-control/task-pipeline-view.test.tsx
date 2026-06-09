import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskPipelineView } from './task-pipeline-view';

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TaskPipelineView', () => {
  it('shows issue, PR, and preview badges from shared delivery state', () => {
    render(
      <TaskPipelineView
        tasks={[
          {
            id: 'task-1',
            prompt: 'Ship pricing page',
            state: 'working',
            delivery: {
              githubIssue: {
                issueNumber: 7,
                state: 'open',
              },
              githubPullRequest: {
                prNumber: 42,
                state: 'open',
                draft: false,
              },
              previewDeployment: {
                protectionMode: 'signed',
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText('issue:#7')).toBeTruthy();
    expect(screen.getByText('pr:#42')).toBeTruthy();
    expect(screen.getByText('preview:signed')).toBeTruthy();
  });
});
