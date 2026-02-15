/**
 * DiffViewer - Enhanced visual diff component for comparing file versions
 *
 * Features:
 * - Side-by-side or unified diff view toggle
 * - Line-by-line highlighting (green for additions, red for deletions)
 * - Line numbers on both sides
 * - Expandable context (show more surrounding lines)
 * - Copy diff button
 * - Navigation between changes (next/prev diff)
 *
 * Uses 'diff' npm package for robust diff computation
 */

import { memo, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import * as Diff from 'diff';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('DiffViewer');

export interface DiffViewerProps {
  /** File path for display */
  filePath: string;
  /** Original content (before changes) */
  original: string;
  /** Modified content (after changes) */
  modified: string;
  /** Close handler */
  onClose: () => void;
  /** Optional: Accept changes handler */
  onAccept?: () => void;
  /** Optional: Reject changes handler */
  onReject?: () => void;
  /** Optional: Initial view mode */
  initialViewMode?: DiffViewMode;
  /** Optional: Show action buttons (Accept/Reject) */
  showActions?: boolean;
  /** Optional: Title override */
  title?: string;
}

export type DiffViewMode = 'split' | 'unified';

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffHunk {
  id: number;
  startLine: number;
  endLine: number;
  lines: DiffLine[];
}

/** Default number of context lines to show around changes */
const DEFAULT_CONTEXT_LINES = 3;
/** Number of additional lines to show when expanding context */
const EXPAND_CONTEXT_LINES = 10;

export const DiffViewer = memo(({
  filePath,
  original,
  modified,
  onClose,
  onAccept,
  onReject,
  initialViewMode = 'split',
  showActions = false,
  title,
}: DiffViewerProps) => {
  const [viewMode, setViewMode] = useState<DiffViewMode>(initialViewMode);
  const [contextLines, setContextLines] = useState(DEFAULT_CONTEXT_LINES);
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const diffContainerRef = useRef<HTMLDivElement>(null);
  const hunkRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Compute diff
  const { lines: diffLines, hunks } = useMemo(
    () => computeDiffWithHunks(original, modified, contextLines),
    [original, modified, contextLines]
  );

  const fileName = filePath.split('/').pop() || filePath;

  // Calculate stats
  const stats = useMemo(() => {
    const added = diffLines.filter((l) => l.type === 'added').length;
    const removed = diffLines.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  // Generate unified diff string for copying
  const unifiedDiffString = useMemo(() => {
    return Diff.createTwoFilesPatch(
      `a/${filePath}`,
      `b/${filePath}`,
      original,
      modified,
      'original',
      'modified'
    );
  }, [filePath, original, modified]);

  // Copy diff to clipboard
  const handleCopyDiff = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(unifiedDiffString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy diff:', err);
    }
  }, [unifiedDiffString]);

  // Navigate to previous hunk
  const goToPrevHunk = useCallback(() => {
    if (hunks.length === 0) return;
    const newIndex = currentHunkIndex > 0 ? currentHunkIndex - 1 : hunks.length - 1;
    setCurrentHunkIndex(newIndex);
  }, [currentHunkIndex, hunks.length]);

  // Navigate to next hunk
  const goToNextHunk = useCallback(() => {
    if (hunks.length === 0) return;
    const newIndex = currentHunkIndex < hunks.length - 1 ? currentHunkIndex + 1 : 0;
    setCurrentHunkIndex(newIndex);
  }, [currentHunkIndex, hunks.length]);

  // Scroll to current hunk when it changes
  useEffect(() => {
    if (hunks.length > 0) {
      const hunkElement = hunkRefs.current.get(hunks[currentHunkIndex]?.id);
      if (hunkElement) {
        hunkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentHunkIndex, hunks]);

  // Expand context
  const expandContext = useCallback(() => {
    setContextLines((prev) => prev + EXPAND_CONTEXT_LINES);
  }, []);

  // Reset context
  const resetContext = useCallback(() => {
    setContextLines(DEFAULT_CONTEXT_LINES);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        goToNextHunk();
      } else if (e.key === 'p' && !e.metaKey && !e.ctrlKey) {
        goToPrevHunk();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToNextHunk, goToPrevHunk]);

  // Store hunk ref
  const setHunkRef = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) {
      hunkRefs.current.set(id, el);
    } else {
      hunkRefs.current.delete(id);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl shadow-2xl w-[95vw] max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <div className="flex items-center gap-3">
            <span className="i-ph:git-diff text-purple-400 text-xl" />
            <div>
              <h2 className="text-sm font-medium text-bolt-elements-textPrimary">
                {title || fileName}
              </h2>
              <p className="text-xs text-bolt-elements-textTertiary font-mono">
                {filePath}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4 text-xs">
              <span className="text-green-400 flex items-center gap-1">
                <span className="i-ph:plus" />
                {stats.added}
              </span>
              <span className="text-red-400 flex items-center gap-1">
                <span className="i-ph:minus" />
                {stats.removed}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Hunk Navigation */}
            {hunks.length > 1 && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={goToPrevHunk}
                  className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                  title="Previous change (p)"
                >
                  <span className="i-ph:caret-up text-lg" />
                </button>
                <span className="text-xs text-bolt-elements-textTertiary min-w-[3rem] text-center">
                  {currentHunkIndex + 1} / {hunks.length}
                </span>
                <button
                  onClick={goToNextHunk}
                  className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                  title="Next change (n)"
                >
                  <span className="i-ph:caret-down text-lg" />
                </button>
              </div>
            )}

            {/* Context Control */}
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={expandContext}
                className="px-2 py-1 text-xs hover:bg-bolt-elements-background-depth-2 rounded transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary flex items-center gap-1"
                title="Show more context"
              >
                <span className="i-ph:arrows-out-simple" />
                More
              </button>
              {contextLines > DEFAULT_CONTEXT_LINES && (
                <button
                  onClick={resetContext}
                  className="px-2 py-1 text-xs hover:bg-bolt-elements-background-depth-2 rounded transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary flex items-center gap-1"
                  title="Reset context"
                >
                  <span className="i-ph:arrows-in-simple" />
                  Less
                </button>
              )}
            </div>

            {/* Copy Diff */}
            <button
              onClick={handleCopyDiff}
              className={classNames(
                'px-2.5 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5',
                copied
                  ? 'bg-green-500/20 text-green-400'
                  : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
              )}
              title="Copy diff to clipboard"
            >
              <span className={copied ? 'i-ph:check' : 'i-ph:copy'} />
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {/* View mode toggle */}
            <div className="flex bg-bolt-elements-background-depth-2 rounded-lg overflow-hidden border border-bolt-elements-borderColor">
              <button
                onClick={() => setViewMode('split')}
                className={classNames(
                  'px-3 py-1.5 text-xs transition-colors flex items-center gap-1',
                  viewMode === 'split'
                    ? 'bg-purple-600 text-white'
                    : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
                )}
              >
                <span className="i-ph:columns" />
                Split
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={classNames(
                  'px-3 py-1.5 text-xs transition-colors flex items-center gap-1',
                  viewMode === 'unified'
                    ? 'bg-purple-600 text-white'
                    : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
                )}
              >
                <span className="i-ph:list" />
                Unified
              </button>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-bolt-elements-background-depth-2 rounded transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-2"
              title="Close (Esc)"
            >
              <span className="i-ph:x text-lg" />
            </button>
          </div>
        </div>

        {/* Diff content */}
        <div ref={diffContainerRef} className="flex-1 overflow-auto">
          {viewMode === 'split' ? (
            <SplitView
              diffLines={diffLines}
              hunks={hunks}
              original={original}
              modified={modified}
              currentHunkIndex={currentHunkIndex}
              setHunkRef={setHunkRef}
            />
          ) : (
            <UnifiedView
              diffLines={diffLines}
              hunks={hunks}
              currentHunkIndex={currentHunkIndex}
              setHunkRef={setHunkRef}
            />
          )}
        </div>

        {/* Footer with actions */}
        {showActions && (onAccept || onReject) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <div className="text-xs text-bolt-elements-textTertiary">
              <span className="i-ph:keyboard mr-1" />
              Press <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded text-bolt-elements-textSecondary">n</kbd> / <kbd className="px-1.5 py-0.5 bg-bolt-elements-background-depth-2 rounded text-bolt-elements-textSecondary">p</kbd> to navigate changes
            </div>
            <div className="flex items-center gap-2">
              {onReject && (
                <button
                  onClick={onReject}
                  className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors flex items-center gap-2"
                >
                  <span className="i-ph:x-circle" />
                  Reject Changes
                </button>
              )}
              {onAccept && (
                <button
                  onClick={onAccept}
                  className="px-4 py-2 text-sm font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded-lg transition-colors flex items-center gap-2"
                >
                  <span className="i-ph:check-circle" />
                  Accept Changes
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

DiffViewer.displayName = 'DiffViewer';

// Split view component
interface SplitViewProps {
  diffLines: DiffLine[];
  hunks: DiffHunk[];
  original: string;
  modified: string;
  currentHunkIndex: number;
  setHunkRef: (id: number, el: HTMLDivElement | null) => void;
}

const SplitView = memo(({
  diffLines,
  hunks,
  original,
  modified,
  currentHunkIndex,
  setHunkRef,
}: SplitViewProps) => {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  // Build aligned view
  const alignedRows: Array<{
    left: { num?: number; content: string; type: 'unchanged' | 'removed' | 'empty' };
    right: { num?: number; content: string; type: 'unchanged' | 'added' | 'empty' };
    isInHunk: boolean;
    hunkId?: number;
    isHunkStart?: boolean;
  }> = [];

  let oldIdx = 0;
  let newIdx = 0;

  // Track which hunk each line belongs to
  const lineToHunk = new Map<number, number>();
  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    for (let j = hunk.startLine; j <= hunk.endLine; j++) {
      lineToHunk.set(j, hunk.id);
    }
  }

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    const hunkId = lineToHunk.get(i);
    const isInHunk = hunkId !== undefined;
    const isHunkStart = isInHunk && (i === 0 || lineToHunk.get(i - 1) !== hunkId);

    if (line.type === 'unchanged') {
      alignedRows.push({
        left: { num: oldIdx + 1, content: originalLines[oldIdx] || '', type: 'unchanged' },
        right: { num: newIdx + 1, content: modifiedLines[newIdx] || '', type: 'unchanged' },
        isInHunk,
        hunkId,
        isHunkStart,
      });
      oldIdx++;
      newIdx++;
    } else if (line.type === 'removed') {
      alignedRows.push({
        left: { num: oldIdx + 1, content: originalLines[oldIdx] || '', type: 'removed' },
        right: { content: '', type: 'empty' },
        isInHunk,
        hunkId,
        isHunkStart,
      });
      oldIdx++;
    } else if (line.type === 'added') {
      alignedRows.push({
        left: { content: '', type: 'empty' },
        right: { num: newIdx + 1, content: modifiedLines[newIdx] || '', type: 'added' },
        isInHunk,
        hunkId,
        isHunkStart,
      });
      newIdx++;
    }
  }

  const currentHunk = hunks[currentHunkIndex];

  return (
    <div className="flex h-full">
      {/* Left (original) */}
      <div className="flex-1 border-r border-bolt-elements-borderColor overflow-auto">
        <div className="sticky top-0 z-10 bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textTertiary border-b border-bolt-elements-borderColor flex items-center gap-2">
          <span className="i-ph:file-minus text-red-400" />
          Original
        </div>
        <div className="font-mono text-xs">
          {alignedRows.map((row, i) => (
            <div
              key={`left-${i}`}
              ref={row.isHunkStart && row.hunkId !== undefined ? (el) => setHunkRef(row.hunkId!, el) : undefined}
              className={classNames('flex', {
                'bg-red-500/10': row.left.type === 'removed',
                'bg-bolt-elements-background-depth-2/30': row.left.type === 'empty',
                'ring-1 ring-inset ring-purple-500/50': currentHunk && row.hunkId === currentHunk.id,
              })}
            >
              <span className="w-12 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor flex-shrink-0">
                {row.left.num || ''}
              </span>
              <span className="w-6 flex-shrink-0 text-center select-none py-0.5">
                {row.left.type === 'removed' && <span className="text-red-400">-</span>}
              </span>
              <pre className={classNames(
                'flex-1 px-2 py-0.5 whitespace-pre overflow-x-auto',
                row.left.type === 'removed' ? 'text-red-300' : 'text-bolt-elements-textSecondary'
              )}>
                {row.left.content}
              </pre>
            </div>
          ))}
        </div>
      </div>

      {/* Right (modified) */}
      <div className="flex-1 overflow-auto">
        <div className="sticky top-0 z-10 bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textTertiary border-b border-bolt-elements-borderColor flex items-center gap-2">
          <span className="i-ph:file-plus text-green-400" />
          Modified
        </div>
        <div className="font-mono text-xs">
          {alignedRows.map((row, i) => (
            <div
              key={`right-${i}`}
              className={classNames('flex', {
                'bg-green-500/10': row.right.type === 'added',
                'bg-bolt-elements-background-depth-2/30': row.right.type === 'empty',
                'ring-1 ring-inset ring-purple-500/50': currentHunk && row.hunkId === currentHunk.id,
              })}
            >
              <span className="w-12 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor flex-shrink-0">
                {row.right.num || ''}
              </span>
              <span className="w-6 flex-shrink-0 text-center select-none py-0.5">
                {row.right.type === 'added' && <span className="text-green-400">+</span>}
              </span>
              <pre className={classNames(
                'flex-1 px-2 py-0.5 whitespace-pre overflow-x-auto',
                row.right.type === 'added' ? 'text-green-300' : 'text-bolt-elements-textSecondary'
              )}>
                {row.right.content}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

SplitView.displayName = 'SplitView';

// Unified view component
interface UnifiedViewProps {
  diffLines: DiffLine[];
  hunks: DiffHunk[];
  currentHunkIndex: number;
  setHunkRef: (id: number, el: HTMLDivElement | null) => void;
}

const UnifiedView = memo(({
  diffLines,
  hunks,
  currentHunkIndex,
  setHunkRef,
}: UnifiedViewProps) => {
  // Track which hunk each line belongs to
  const lineToHunk = new Map<number, number>();
  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    for (let j = hunk.startLine; j <= hunk.endLine; j++) {
      lineToHunk.set(j, hunk.id);
    }
  }

  const currentHunk = hunks[currentHunkIndex];

  return (
    <div className="font-mono text-xs">
      {/* Header labels */}
      <div className="sticky top-0 z-10 flex bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
        <span className="w-12 px-2 py-2 text-center text-bolt-elements-textTertiary text-xs border-r border-bolt-elements-borderColor">
          Old
        </span>
        <span className="w-12 px-2 py-2 text-center text-bolt-elements-textTertiary text-xs border-r border-bolt-elements-borderColor">
          New
        </span>
        <span className="w-6" />
        <span className="flex-1 px-3 py-2 text-bolt-elements-textTertiary text-xs">
          Content
        </span>
      </div>

      {diffLines.map((line, i) => {
        const hunkId = lineToHunk.get(i);
        const isInHunk = hunkId !== undefined;
        const isHunkStart = isInHunk && (i === 0 || lineToHunk.get(i - 1) !== hunkId);

        return (
          <div
            key={i}
            ref={isHunkStart && hunkId !== undefined ? (el) => setHunkRef(hunkId!, el) : undefined}
            className={classNames('flex', {
              'bg-green-500/10': line.type === 'added',
              'bg-red-500/10': line.type === 'removed',
              'ring-1 ring-inset ring-purple-500/50': currentHunk && hunkId === currentHunk.id,
            })}
          >
            <span className="w-12 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor flex-shrink-0">
              {line.oldLineNumber || ''}
            </span>
            <span className="w-12 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor flex-shrink-0">
              {line.newLineNumber || ''}
            </span>
            <span className="w-6 px-1 py-0.5 text-center select-none flex-shrink-0">
              {line.type === 'added' && <span className="text-green-400">+</span>}
              {line.type === 'removed' && <span className="text-red-400">-</span>}
            </span>
            <pre
              className={classNames('flex-1 px-2 py-0.5 whitespace-pre overflow-x-auto', {
                'text-green-300': line.type === 'added',
                'text-red-300': line.type === 'removed',
                'text-bolt-elements-textSecondary': line.type === 'unchanged',
              })}
            >
              {line.content}
            </pre>
          </div>
        );
      })}
    </div>
  );
});

UnifiedView.displayName = 'UnifiedView';

/**
 * Compute diff using 'diff' npm package and organize into hunks
 */
function computeDiffWithHunks(
  original: string,
  modified: string,
  contextLines: number
): { lines: DiffLine[]; hunks: DiffHunk[] } {
  const changes = Diff.diffLines(original, modified);
  const allLines: DiffLine[] = [];
  const hunks: DiffHunk[] = [];

  let oldLineNum = 1;
  let newLineNum = 1;

  // First pass: create all diff lines
  for (const change of changes) {
    const lines = change.value.split('\n');
    // Remove last empty line from split (trailing newline)
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }

    for (const line of lines) {
      if (change.added) {
        allLines.push({
          type: 'added',
          content: line,
          newLineNumber: newLineNum++,
        });
      } else if (change.removed) {
        allLines.push({
          type: 'removed',
          content: line,
          oldLineNumber: oldLineNum++,
        });
      } else {
        allLines.push({
          type: 'unchanged',
          content: line,
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  }

  // Second pass: identify hunks (groups of changes with context)
  let hunkId = 0;
  let inChange = false;
  let changeStart = -1;
  let changeEnd = -1;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const isChange = line.type !== 'unchanged';

    if (isChange && !inChange) {
      // Start of a new change region
      inChange = true;
      changeStart = Math.max(0, i - contextLines);
      changeEnd = i;
    } else if (isChange && inChange) {
      // Continue change region
      changeEnd = i;
    } else if (!isChange && inChange) {
      // Check if we're past the context window
      if (i - changeEnd > contextLines) {
        // End of hunk
        hunks.push({
          id: hunkId++,
          startLine: changeStart,
          endLine: Math.min(changeEnd + contextLines, allLines.length - 1),
          lines: allLines.slice(changeStart, Math.min(changeEnd + contextLines + 1, allLines.length)),
        });
        inChange = false;
      }
    }
  }

  // Handle last hunk if still in change
  if (inChange) {
    hunks.push({
      id: hunkId++,
      startLine: changeStart,
      endLine: Math.min(changeEnd + contextLines, allLines.length - 1),
      lines: allLines.slice(changeStart, Math.min(changeEnd + contextLines + 1, allLines.length)),
    });
  }

  // If no changes, return empty hunks
  if (hunks.length === 0 && allLines.some((l) => l.type !== 'unchanged')) {
    // Edge case: all lines are changes
    hunks.push({
      id: 0,
      startLine: 0,
      endLine: allLines.length - 1,
      lines: allLines,
    });
  }

  return { lines: allLines, hunks };
}

/**
 * Simplified DiffViewer for inline use (no modal)
 */
export interface InlineDiffViewerProps {
  original: string;
  modified: string;
  viewMode?: DiffViewMode;
  className?: string;
  maxHeight?: string;
}

export const InlineDiffViewer = memo(({
  original,
  modified,
  viewMode = 'unified',
  className,
  maxHeight = '400px',
}: InlineDiffViewerProps) => {
  const { lines: diffLines } = useMemo(
    () => computeDiffWithHunks(original, modified, 3),
    [original, modified]
  );

  const stats = useMemo(() => {
    const added = diffLines.filter((l) => l.type === 'added').length;
    const removed = diffLines.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  return (
    <div className={classNames('border border-bolt-elements-borderColor rounded-lg overflow-hidden', className)}>
      {/* Stats header */}
      <div className="px-3 py-2 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor flex items-center gap-3 text-xs">
        <span className="i-ph:git-diff text-purple-400" />
        <span className="text-bolt-elements-textSecondary">Changes:</span>
        <span className="text-green-400">+{stats.added}</span>
        <span className="text-red-400">-{stats.removed}</span>
      </div>

      {/* Diff content */}
      <div className="overflow-auto font-mono text-xs" style={{ maxHeight }}>
        {diffLines.map((line, i) => (
          <div
            key={i}
            className={classNames('flex', {
              'bg-green-500/10': line.type === 'added',
              'bg-red-500/10': line.type === 'removed',
            })}
          >
            <span className="w-10 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor flex-shrink-0">
              {line.oldLineNumber || ''}
            </span>
            <span className="w-10 px-2 py-0.5 text-right text-bolt-elements-textTertiary bg-bolt-elements-background-depth-2 select-none border-r border-bolt-elements-borderColor flex-shrink-0">
              {line.newLineNumber || ''}
            </span>
            <span className="w-5 px-1 py-0.5 text-center select-none flex-shrink-0">
              {line.type === 'added' && <span className="text-green-400">+</span>}
              {line.type === 'removed' && <span className="text-red-400">-</span>}
            </span>
            <pre
              className={classNames('flex-1 px-2 py-0.5 whitespace-pre overflow-x-auto', {
                'text-green-300': line.type === 'added',
                'text-red-300': line.type === 'removed',
                'text-bolt-elements-textSecondary': line.type === 'unchanged',
              })}
            >
              {line.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
});

InlineDiffViewer.displayName = 'InlineDiffViewer';

export default DiffViewer;
