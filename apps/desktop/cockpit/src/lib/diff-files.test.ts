/**
 * Unit tests for diff-files.ts — the per-file change-list parser that backs the
 * Conductor right-pane file list. Real `git diff --stat` shapes only.
 */
import { describe, expect, it } from 'vitest';
import { diffFileList } from './diff-files';
import type { WorkspaceDiff } from '../types';

function diff(partial: Partial<WorkspaceDiff>): WorkspaceDiff {
  return {
    workspaceId: 'ws-1',
    baseRef: 'main',
    branch: 'feature',
    stat: '',
    patch: '',
    untracked: [],
    changedFiles: 0,
    ...partial,
  };
}

describe('diffFileList', () => {
  it('returns an empty list for a null diff', () => {
    expect(diffFileList(null)).toEqual([]);
    expect(diffFileList(undefined)).toEqual([]);
  });

  it('parses per-file rows and skips the summary line', () => {
    const stat = [
      ' src/App.tsx              |  12 +++++++-----',
      ' src/components/Foo.tsx   |   4 ++--',
      ' 2 files changed, 16 insertions(+), 5 deletions(-)',
    ].join('\n');
    const files = diffFileList(diff({ stat }));
    expect(files).toEqual([
      { path: 'src/App.tsx', changes: 12, status: 'modified' },
      { path: 'src/components/Foo.tsx', changes: 4, status: 'modified' },
    ]);
  });

  it('marks untracked files as added with a null change count', () => {
    const files = diffFileList(diff({ untracked: ['src/new-file.ts', '  '] }));
    expect(files).toEqual([{ path: 'src/new-file.ts', changes: null, status: 'added' }]);
  });

  it('handles a binary "Bin" change column without inventing a count', () => {
    const stat = ' assets/logo.png | Bin 0 -> 1024 bytes';
    const files = diffFileList(diff({ stat }));
    expect(files).toEqual([{ path: 'assets/logo.png', changes: null, status: 'modified' }]);
  });
});
