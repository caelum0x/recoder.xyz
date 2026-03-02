/**
 * FileHistoryPanel Component
 * Shows version history for a specific file with ability to revert
 */

import { memo, useState, useCallback } from 'react';
import { useUndoRedo } from '~/lib/hooks/useUndoRedo';
import { DiffPreview } from './DiffPreview';
import { generateDiff } from '~/lib/services/diff-preview';
import type { FileState } from '~/lib/services/undo-manager';

interface FileHistoryPanelProps {
  filePath: string;
  currentContent: string;
  onRevert: (content: string) => void;
  onClose: () => void;
}

export const FileHistoryPanel = memo(function FileHistoryPanel({
  filePath,
  currentContent,
  onRevert,
  onClose,
}: FileHistoryPanelProps) {
  const [, actions] = useUndoRedo();
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const history = actions.getHistory(filePath);

  const handleVersionSelect = useCallback((index: number) => {
    setSelectedVersion(index);
    setShowDiff(true);
  }, []);

  const handleRevert = useCallback(async () => {
    if (selectedVersion === null) return;

    await actions.revertToVersion(filePath, selectedVersion);
    const state = history[selectedVersion];
    if (state) {
      onRevert(state.content);
    }
    onClose();
  }, [selectedVersion, filePath, actions, history, onRevert, onClose]);

  // Get the selected version's content
  const selectedState = selectedVersion !== null ? history[selectedVersion] : null;

  // Generate diff if showing
  const diff = selectedState
    ? generateDiff(filePath, currentContent, selectedState.content)
    : null;

  const formatTime = (date: Date) => {
    const timestamp = date instanceof Date ? date : new Date(date);
    const now = Date.now();
    const diff = now - timestamp.getTime();

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return timestamp.toLocaleDateString() + ' ' + timestamp.toLocaleTimeString();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-recoder-elements-background-depth-2 rounded-lg shadow-xl w-[90%] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 bg-recoder-elements-background-depth-3 border-b border-recoder-elements-borderColor flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-recoder-elements-textPrimary">
              File History
            </h2>
            <p className="text-sm text-recoder-elements-textSecondary font-mono">
              {filePath}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-recoder-elements-background-depth-4 rounded-lg transition-colors"
          >
            <span className="i-ph:x text-xl text-recoder-elements-textSecondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Version List */}
          <div className="w-64 border-r border-recoder-elements-borderColor overflow-auto">
            {history.length === 0 ? (
              <div className="p-4 text-center text-recoder-elements-textSecondary">
                No history available
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {history.map((state, index) => (
                  <button
                    key={index}
                    onClick={() => handleVersionSelect(index)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedVersion === index
                        ? 'bg-blue-500/20 border border-blue-500/50'
                        : 'hover:bg-recoder-elements-background-depth-3'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          state.aiGenerated ? 'bg-blue-500' : 'bg-green-500'
                        }`}
                        title={state.aiGenerated ? 'AI change' : 'Manual change'}
                      />
                      <span className="text-sm text-recoder-elements-textPrimary truncate">
                        {state.description || 'Change'}
                      </span>
                    </div>
                    <p className="text-xs text-recoder-elements-textTertiary mt-0.5 ml-4">
                      {formatTime(state.timestamp)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Diff Preview */}
          <div className="flex-1 overflow-auto">
            {!showDiff || !diff ? (
              <div className="h-full flex items-center justify-center text-recoder-elements-textSecondary">
                Select a version to see changes
              </div>
            ) : (
              <div className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-recoder-elements-textSecondary">
                      Showing changes: Current -&gt; Version {selectedVersion! + 1}
                    </p>
                    {selectedState && (
                      <p className="text-xs text-recoder-elements-textTertiary">
                        {selectedState.aiGenerated ? 'AI generated' : 'Manual edit'} - {formatTime(selectedState.timestamp)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleRevert}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    <span className="i-ph:arrow-counter-clockwise" />
                    Revert to this version
                  </button>
                </div>
                <DiffPreview
                  diff={diff}
                  onAccept={handleRevert}
                  onReject={() => {
                    setSelectedVersion(null);
                    setShowDiff(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default FileHistoryPanel;
