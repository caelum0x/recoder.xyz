/**
 * DiffViewer - Visual diff component for comparing file versions
 * Shows side-by-side or unified diff view
 * Uses 'diff' npm package for robust diff computation
 */

import { memo, useState, useMemo } from 'react';
import * as Diff from 'diff';
import { classNames } from '~/utils/classNames';

interface DiffViewerProps {
  filePath: string;
  original: string;
  modified: string;
  onClose: () => void;
}

type DiffViewMode = 'split' | 'unified';

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export const DiffViewer = memo(({ filePath, original, modified, onClose }: DiffViewerProps) => {
  const [viewMode, setViewMode] = useState<DiffViewMode>('split');

  const diff = useMemo(() => computeDiff(original, modified), [original, modified]);
  const fileName = filePath.split('/').pop() || filePath;

  const stats = useMemo(() => {
    const added = diff.filter((l) => l.type === 'added').length;
    const removed = diff.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [diff]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-2xl w-[90vw] h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor">
          <div className="flex items-center gap-3">
            <span className="i-ph:git-diff text-purple-400 text-xl" />
            <div>
              <h2 className="text-sm font-medium text-white">{fileName}</h2>
              <p className="text-xs text-bolt-elements-textTertiary">{filePath}</p>
            </div>
            <div className="flex items-center gap-2 ml-4 text-xs">
              <span className="text-green-400">+{stats.added}</span>
              <span className="text-red-400">-{stats.removed}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex bg-bolt-elements-background-depth-3 rounded overflow-hidden">
              <button
                onClick={() => setViewMode('split')}
                className={classNames(
                  'px-3 py-1 text-xs transition-colors',
                  viewMode === 'split'
                    ? 'bg-purple-600 text-white'
                    : 'text-bolt-elements-textTertiary hover:text-white'
                )}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={classNames(
                  'px-3 py-1 text-xs transition-colors',
                  viewMode === 'unified'
                    ? 'bg-purple-600 text-white'
                    : 'text-bolt-elements-textTertiary hover:text-white'
                )}
              >
                Unified
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-bolt-elements-background-depth-3 rounded"
            >
              <span className="i-ph:x text-lg" />
            </button>
          </div>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto">
          {viewMode === 'split' ? (
            <SplitView diff={diff} original={original} modified={modified} />
          ) : (
            <UnifiedView diff={diff} />
          )}
        </div>
      </div>
    </div>
  );
});

DiffViewer.displayName = 'DiffViewer';

// Split view component
const SplitView = memo(
  ({
    diff,
    original,
    modified,
  }: {
    diff: DiffLine[];
    original: string;
    modified: string;
  }) => {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    // Build aligned view
    const alignedRows: Array<{
      left: { num?: number; content: string; type: 'unchanged' | 'removed' | 'empty' };
      right: { num?: number; content: string; type: 'unchanged' | 'added' | 'empty' };
    }> = [];

    let oldIdx = 0;
    let newIdx = 0;

    for (const line of diff) {
      if (line.type === 'unchanged') {
        alignedRows.push({
          left: { num: oldIdx + 1, content: originalLines[oldIdx] || '', type: 'unchanged' },
          right: { num: newIdx + 1, content: modifiedLines[newIdx] || '', type: 'unchanged' },
        });
        oldIdx++;
        newIdx++;
      } else if (line.type === 'removed') {
        alignedRows.push({
          left: { num: oldIdx + 1, content: originalLines[oldIdx] || '', type: 'removed' },
          right: { content: '', type: 'empty' },
        });
        oldIdx++;
      } else if (line.type === 'added') {
        alignedRows.push({
          left: { content: '', type: 'empty' },
          right: { num: newIdx + 1, content: modifiedLines[newIdx] || '', type: 'added' },
        });
        newIdx++;
      }
    }

    return (
      <div className="flex h-full">
        {/* Left (original) */}
        <div className="flex-1 border-r border-bolt-elements-borderColor overflow-auto">
          <div className="sticky top-0 bg-bolt-elements-background-depth-2 px-3 py-1 text-xs text-bolt-elements-textTertiary border-b border-bolt-elements-borderColor">
            Original
          </div>
          <div className="font-mono text-xs">
            {alignedRows.map((row, i) => (
              <div
                key={`left-${i}`}
                className={classNames('flex', {
                  'bg-red-500/10': row.left.type === 'removed',
                  'bg-bolt-elements-background-depth-2/30': row.left.type === 'empty',
                })}
              >
                <span className="w-10 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor">
                  {row.left.num || ''}
                </span>
                <pre className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
                  {row.left.type === 'removed' && (
                    <span className="text-red-400 mr-1">-</span>
                  )}
                  <span className={row.left.type === 'removed' ? 'text-red-300' : ''}>
                    {row.left.content}
                  </span>
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Right (modified) */}
        <div className="flex-1 overflow-auto">
          <div className="sticky top-0 bg-bolt-elements-background-depth-2 px-3 py-1 text-xs text-bolt-elements-textTertiary border-b border-bolt-elements-borderColor">
            Modified
          </div>
          <div className="font-mono text-xs">
            {alignedRows.map((row, i) => (
              <div
                key={`right-${i}`}
                className={classNames('flex', {
                  'bg-green-500/10': row.right.type === 'added',
                  'bg-bolt-elements-background-depth-2/30': row.right.type === 'empty',
                })}
              >
                <span className="w-10 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor">
                  {row.right.num || ''}
                </span>
                <pre className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
                  {row.right.type === 'added' && (
                    <span className="text-green-400 mr-1">+</span>
                  )}
                  <span className={row.right.type === 'added' ? 'text-green-300' : ''}>
                    {row.right.content}
                  </span>
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

SplitView.displayName = 'SplitView';

// Unified view component
const UnifiedView = memo(({ diff }: { diff: DiffLine[] }) => {
  return (
    <div className="font-mono text-xs">
      {diff.map((line, i) => (
        <div
          key={i}
          className={classNames('flex', {
            'bg-green-500/10': line.type === 'added',
            'bg-red-500/10': line.type === 'removed',
          })}
        >
          <span className="w-10 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor">
            {line.oldLineNumber || ''}
          </span>
          <span className="w-10 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor">
            {line.newLineNumber || ''}
          </span>
          <span className="w-6 px-1 py-0.5 text-center select-none">
            {line.type === 'added' && <span className="text-green-400">+</span>}
            {line.type === 'removed' && <span className="text-red-400">-</span>}
          </span>
          <pre
            className={classNames('flex-1 px-2 py-0.5 whitespace-pre-wrap break-all', {
              'text-green-300': line.type === 'added',
              'text-red-300': line.type === 'removed',
            })}
          >
            {line.content}
          </pre>
        </div>
      ))}
    </div>
  );
});

UnifiedView.displayName = 'UnifiedView';

/**
 * Compute diff using 'diff' npm package
 */
function computeDiff(original: string, modified: string): DiffLine[] {
  const changes = Diff.diffLines(original, modified);
  const result: DiffLine[] = [];
  
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of changes) {
    const lines = change.value.split('\n');
    // Remove last empty line from split (trailing newline)
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }

    for (const line of lines) {
      if (change.added) {
        result.push({
          type: 'added',
          content: line,
          newLineNumber: newLineNum++,
        });
      } else if (change.removed) {
        result.push({
          type: 'removed',
          content: line,
          oldLineNumber: oldLineNum++,
        });
      } else {
        result.push({
          type: 'unchanged',
          content: line,
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  }

  return result;
}

export default DiffViewer;
