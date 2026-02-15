/**
 * AgentDiffReview - Multi-file diff review with per-file checkboxes
 * Reuses the existing DiffViewer component for individual file diffs.
 */

import { memo, useState, useCallback } from 'react';
import type { AgentFileChange } from '~/lib/stores/agent-session';
import { toggleFileSelection, selectAllFiles } from '~/lib/stores/agent-session';
import { DiffViewer } from '~/components/workbench/DiffViewer';
import { classNames } from '~/utils/classNames';

interface AgentDiffReviewProps {
  fileChanges: AgentFileChange[];
}

function getFileIcon(type: AgentFileChange['type']): string {
  switch (type) {
    case 'create': return 'i-ph:plus-circle text-green-400';
    case 'update': return 'i-ph:pencil-circle text-blue-400';
    case 'delete': return 'i-ph:minus-circle text-red-400';
  }
}

function getFileLabel(type: AgentFileChange['type']): string {
  switch (type) {
    case 'create': return 'New';
    case 'update': return 'Modified';
    case 'delete': return 'Deleted';
  }
}

function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

function getFileDir(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '.';
}

export const AgentDiffReview = memo(({ fileChanges }: AgentDiffReviewProps) => {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const selectedCount = fileChanges.filter((f) => f.selected).length;
  const totalCount = fileChanges.length;

  const handleToggleAll = useCallback(() => {
    selectAllFiles(selectedCount < totalCount);
  }, [selectedCount, totalCount]);

  const handleToggleFile = useCallback((path: string) => {
    toggleFileSelection(path);
  }, []);

  const handleExpandFile = useCallback((path: string) => {
    setExpandedFile((prev) => (prev === path ? null : path));
  }, []);

  if (fileChanges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <div className="i-ph:files text-3xl text-bolt-elements-textTertiary mb-2" />
        <p className="text-xs text-bolt-elements-textTertiary">No file changes</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header with select all */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedCount === totalCount}
            onChange={handleToggleAll}
            className="rounded border-bolt-elements-borderColor"
          />
          <span className="text-xs text-bolt-elements-textSecondary">
            {selectedCount}/{totalCount} files selected
          </span>
        </label>
      </div>

      {/* File list */}
      <div className="flex flex-col divide-y divide-bolt-elements-borderColor">
        {fileChanges.map((file) => (
          <div key={file.path}>
            {/* File row */}
            <div
              className={classNames(
                'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-bolt-elements-background-depth-2 transition-colors',
                expandedFile === file.path && 'bg-bolt-elements-background-depth-2',
              )}
            >
              <input
                type="checkbox"
                checked={file.selected}
                onChange={() => handleToggleFile(file.path)}
                className="rounded border-bolt-elements-borderColor flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              />

              <div
                className="flex items-center gap-2 flex-1 min-w-0"
                onClick={() => handleExpandFile(file.path)}
              >
                <div className={classNames('text-sm flex-shrink-0', getFileIcon(file.type))} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-bolt-elements-textPrimary truncate">
                      {getFileName(file.path)}
                    </span>
                    <span
                      className={classNames(
                        'text-[10px] px-1 py-0.5 rounded',
                        file.type === 'create' && 'bg-green-400/10 text-green-400',
                        file.type === 'update' && 'bg-blue-400/10 text-blue-400',
                        file.type === 'delete' && 'bg-red-400/10 text-red-400',
                      )}
                    >
                      {getFileLabel(file.type)}
                    </span>
                  </div>
                  <p className="text-[10px] text-bolt-elements-textTertiary truncate">
                    {getFileDir(file.path)}
                  </p>
                </div>

                <div
                  className={classNames(
                    'i-ph:caret-down text-bolt-elements-textTertiary transition-transform text-sm flex-shrink-0',
                    expandedFile === file.path && 'rotate-180',
                  )}
                />
              </div>
            </div>

            {/* Expanded diff view */}
            {expandedFile === file.path && file.type !== 'delete' && (
              <div className="border-t border-bolt-elements-borderColor max-h-[400px] overflow-auto">
                <DiffViewer
                  filePath={file.path}
                  original={file.oldContent || ''}
                  modified={file.newContent || ''}
                  onClose={() => setExpandedFile(null)}
                  initialViewMode="unified"
                />
              </div>
            )}

            {/* Summary */}
            {file.summary && expandedFile !== file.path && (
              <div className="px-10 pb-1.5">
                <p className="text-[10px] text-bolt-elements-textTertiary italic">
                  {file.summary}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

AgentDiffReview.displayName = 'AgentDiffReview';
