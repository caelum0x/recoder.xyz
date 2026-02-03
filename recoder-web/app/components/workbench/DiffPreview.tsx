/**
 * DiffPreview Component
 * Shows a preview of file changes before they are applied
 * Allows accept/reject of individual changes or hunks
 */

import { useState } from 'react';
import type { FileDiff, DiffHunk, PendingChange } from '~/lib/services/diff-preview';

interface DiffPreviewProps {
  diff: FileDiff;
  onAccept: () => void;
  onReject: () => void;
  onPartialAccept?: (hunkIds: string[]) => void;
}

export function DiffPreview({ diff, onAccept, onReject, onPartialAccept }: DiffPreviewProps) {
  const [selectedHunks, setSelectedHunks] = useState<Set<string>>(
    new Set(diff.hunks.map(h => h.id))
  );

  const toggleHunk = (hunkId: string) => {
    const newSelected = new Set(selectedHunks);
    if (newSelected.has(hunkId)) {
      newSelected.delete(hunkId);
    } else {
      newSelected.add(hunkId);
    }
    setSelectedHunks(newSelected);
  };

  const handlePartialAccept = () => {
    if (onPartialAccept) {
      onPartialAccept(Array.from(selectedHunks));
    }
  };

  const stats = {
    additions: diff.hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'add').length, 0),
    deletions: diff.hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'remove').length, 0),
  };

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-bolt-elements-background-depth-3 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-bolt-elements-textPrimary">{diff.filePath}</span>
          <span className="text-xs text-green-500">+{stats.additions}</span>
          <span className="text-xs text-red-500">-{stats.deletions}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReject}
            className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors"
          >
            Reject All
          </button>
          {onPartialAccept && selectedHunks.size > 0 && selectedHunks.size < diff.hunks.length && (
            <button
              onClick={handlePartialAccept}
              className="px-3 py-1.5 text-xs font-medium text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 rounded-md transition-colors"
            >
              Accept Selected ({selectedHunks.size}/{diff.hunks.length})
            </button>
          )}
          <button
            onClick={onAccept}
            className="px-3 py-1.5 text-xs font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded-md transition-colors"
          >
            Accept All
          </button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="overflow-x-auto">
        {diff.hunks.map((hunk) => (
          <DiffHunkView
            key={hunk.id}
            hunk={hunk}
            selected={selectedHunks.has(hunk.id)}
            onToggle={() => toggleHunk(hunk.id)}
            showCheckbox={!!onPartialAccept}
          />
        ))}
      </div>
    </div>
  );
}

interface DiffHunkViewProps {
  hunk: DiffHunk;
  selected: boolean;
  onToggle: () => void;
  showCheckbox: boolean;
}

function DiffHunkView({ hunk, selected, onToggle, showCheckbox }: DiffHunkViewProps) {
  return (
    <div className={`border-b border-bolt-elements-borderColor last:border-b-0 ${!selected ? 'opacity-50' : ''}`}>
      {/* Hunk Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-bolt-elements-background-depth-1 text-xs font-mono text-bolt-elements-textSecondary">
        {showCheckbox && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="w-4 h-4 rounded border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-blue-500 focus:ring-blue-500"
          />
        )}
        <span>@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</span>
      </div>

      {/* Lines */}
      <div className="font-mono text-sm">
        {hunk.lines.map((line, index) => (
          <div
            key={index}
            className={`flex ${
              line.type === 'add'
                ? 'bg-green-500/10 text-green-400'
                : line.type === 'remove'
                ? 'bg-red-500/10 text-red-400'
                : 'text-bolt-elements-textSecondary'
            }`}
          >
            <span className="w-12 flex-shrink-0 px-2 text-right text-bolt-elements-textTertiary select-none border-r border-bolt-elements-borderColor">
              {line.oldLineNumber || ''}
            </span>
            <span className="w-12 flex-shrink-0 px-2 text-right text-bolt-elements-textTertiary select-none border-r border-bolt-elements-borderColor">
              {line.newLineNumber || ''}
            </span>
            <span className="w-6 flex-shrink-0 text-center select-none">
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            </span>
            <span className="flex-1 px-2 whitespace-pre">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PendingChangesListProps {
  changes: PendingChange[];
  onAccept: (changeId: string) => void;
  onReject: (changeId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

export function PendingChangesList({
  changes,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: PendingChangesListProps) {
  if (changes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary">
          Pending Changes ({changes.length})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onRejectAll}
            className="px-3 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors"
          >
            Reject All
          </button>
          <button
            onClick={onAcceptAll}
            className="px-3 py-1.5 text-sm font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded-md transition-colors"
          >
            Accept All
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {changes.map((change) => (
          <DiffPreview
            key={change.id}
            diff={change.diff}
            onAccept={() => onAccept(change.id)}
            onReject={() => onReject(change.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface UndoHistoryProps {
  history: Array<{ content: string; timestamp: Date; description: string; aiGenerated: boolean }>;
  onRevert: (index: number) => void;
}

export function UndoHistory({ history, onRevert }: UndoHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="p-4 text-center text-bolt-elements-textSecondary">
        No history available
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">Version History</h3>
      {history.map((state, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-3 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${state.aiGenerated ? 'bg-blue-500' : 'bg-green-500'}`} />
            <div>
              <div className="text-sm text-bolt-elements-textPrimary">{state.description}</div>
              <div className="text-xs text-bolt-elements-textSecondary">
                {state.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
          <button
            onClick={() => onRevert(index)}
            className="px-3 py-1 text-xs font-medium text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 rounded transition-colors"
          >
            Revert
          </button>
        </div>
      ))}
    </div>
  );
}

export default DiffPreview;
