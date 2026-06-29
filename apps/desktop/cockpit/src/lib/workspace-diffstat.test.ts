/**
 * Unit tests for workspaceDiffStat — proves the sidebar +N/-N badge is parsed
 * ONLY from the backend's real delivery summary and never fabricated.
 */
import { describe, expect, it } from 'vitest';
import { workspaceDiffStat } from './workspace-diffstat';
import type { Workspace } from '../types';

function ws(metadata?: Record<string, unknown>): Workspace {
  return {
    workspaceId: 'w1',
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude',
    substrate: 'tmux_worktree',
    branch: 'conductor/x',
    baseRef: 'main',
    state: 'awaiting_review',
    createdBy: 'cockpit',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    metadata,
  };
}

describe('workspaceDiffStat', () => {
  it('returns null when there is no delivery summary (no fabricated zero)', () => {
    expect(workspaceDiffStat(ws(undefined))).toBeNull();
    expect(workspaceDiffStat(ws({}))).toBeNull();
    expect(workspaceDiffStat(ws({ delivery: null }))).toBeNull();
  });

  it('parses insertions and deletions from the git --stat summary', () => {
    const stat = workspaceDiffStat(
      ws({ delivery: { changedFiles: 3, diffStat: ' 3 files changed, 12 insertions(+), 4 deletions(-)' } }),
    );
    expect(stat).toEqual({ changedFiles: 3, additions: 12, deletions: 4 });
  });

  it('handles a summary with only insertions (deletions omitted by git)', () => {
    const stat = workspaceDiffStat(
      ws({ delivery: { changedFiles: 1, diffStat: ' 1 file changed, 5 insertions(+)' } }),
    );
    expect(stat).toEqual({ changedFiles: 1, additions: 5, deletions: null });
  });

  it('handles singular "1 insertion(+)" / "1 deletion(-)" forms', () => {
    const stat = workspaceDiffStat(
      ws({ delivery: { changedFiles: 1, diffStat: ' 1 file changed, 1 insertion(+), 1 deletion(-)' } }),
    );
    expect(stat).toEqual({ changedFiles: 1, additions: 1, deletions: 1 });
  });

  it('returns the changedFiles count even when the stat string is empty', () => {
    const stat = workspaceDiffStat(ws({ delivery: { changedFiles: 2, diffStat: '' } }));
    expect(stat).toEqual({ changedFiles: 2, additions: null, deletions: null });
  });

  it('returns null when nothing changed and no counts parsed', () => {
    expect(workspaceDiffStat(ws({ delivery: { changedFiles: 0, diffStat: '' } }))).toBeNull();
  });
});
