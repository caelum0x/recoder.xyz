/**
 * UndoButton Component
 * Undo button with dropdown showing what will be undone
 * Includes visual diff preview before confirming undo
 */

import { useState, useRef, useEffect, memo } from 'react';
import { useUndoRedo } from '~/lib/hooks/useUndoRedo';
import { DiffPreview } from './DiffPreview';
import { generateDiff } from '~/lib/services/diff-preview';
import { toast } from 'react-toastify';

interface UndoButtonProps {
  className?: string;
}

export const UndoButton = memo(function UndoButton({ className = '' }: UndoButtonProps) {
  const [state, actions] = useUndoRedo({
    enableKeyboardShortcuts: true,
    onUndo: (filesAffected) => {
      toast.success(`Undid changes to ${filesAffected} file${filesAffected > 1 ? 's' : ''}`);
    },
  });

  const [showDropdown, setShowDropdown] = useState(false);
  const [showDiffPreview, setShowDiffPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    currentContent: string;
    previousContent: string;
  } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setShowDiffPreview(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load preview when dropdown opens
  // Note: Don't include 'actions' in deps - it's a new object each render
  useEffect(() => {
    if (showDropdown && state.canUndoAI) {
      actions.showPreview();
    } else {
      actions.hidePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown, state.canUndoAI]);

  const handleUndo = async () => {
    await actions.undoAI();
    setShowDropdown(false);
    setShowDiffPreview(false);
  };

  const handleShowDiff = (file: typeof selectedFile) => {
    setSelectedFile(file);
    setShowDiffPreview(true);
  };

  const handleCloseDiff = () => {
    setSelectedFile(null);
    setShowDiffPreview(false);
  };

  // Generate diff for the selected file
  const fileDiff = selectedFile
    ? generateDiff(selectedFile.path, selectedFile.currentContent, selectedFile.previousContent)
    : null;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Undo Button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={!state.canUndoAI || state.isUndoing}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all
          ${state.canUndoAI
            ? 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary'
            : 'text-recoder-elements-textTertiary cursor-not-allowed opacity-50'
          }
          ${state.isUndoing ? 'animate-pulse' : ''}
        `}
        style={{
          backgroundColor: state.canUndoAI ? 'var(--recoder-elements-bg-depth-3)' : 'var(--recoder-elements-bg-depth-2)',
          border: state.canUndoAI ? '1px solid var(--recoder-elements-borderColor)' : '1px solid transparent',
        }}
        title={state.canUndoAI ? `Undo AI changes (${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Z)` : 'No changes to undo'}
      >
        <span className="i-ph:arrow-counter-clockwise text-sm" />
        Undo
        {state.undoInfo && (
          <span className="text-recoder-elements-textTertiary">
            ({state.undoInfo.filesCount})
          </span>
        )}
        {state.isUndoing && (
          <span className="i-ph:spinner-gap animate-spin text-sm" />
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && state.canUndoAI && (
        <div
          className="absolute top-full right-0 mt-1 w-80 rounded-lg shadow-xl z-50 overflow-hidden"
          style={{ backgroundColor: 'var(--recoder-elements-bg-depth-2)', border: '1px solid var(--recoder-elements-borderColor)' }}
        >
          {/* Header */}
          <div className="px-4 py-3" style={{ backgroundColor: 'var(--recoder-elements-bg-depth-1)', borderBottom: '1px solid var(--recoder-elements-borderColor)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-recoder-elements-textPrimary">
                Undo AI Changes
              </h3>
              <span className="text-xs text-recoder-elements-textTertiary">
                {state.undoInfo?.timeAgo}
              </span>
            </div>
            {state.undoInfo && (
              <p className="text-xs text-recoder-elements-textSecondary mt-1">
                {state.undoInfo.description}
              </p>
            )}
          </div>

          {/* File List */}
          {!showDiffPreview && (
            <div className="max-h-64 overflow-auto">
              {state.previewFiles.length === 0 ? (
                <div className="p-4 text-center text-recoder-elements-textSecondary text-sm">
                  Loading preview...
                </div>
              ) : (
                state.previewFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between px-4 py-2 hover:bg-recoder-elements-background-depth-3 last:border-0"
                    style={{ borderBottom: '1px solid var(--recoder-elements-borderColor)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="i-ph:file-code text-blue-400" />
                      <span className="text-sm text-recoder-elements-textPrimary truncate">
                        {file.path.split('/').pop()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleShowDiff(file)}
                      className="text-xs px-2 py-1 text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary rounded transition-colors flex-shrink-0"
                      style={{ backgroundColor: 'var(--recoder-elements-bg-depth-3)' }}
                    >
                      View Diff
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Diff Preview */}
          {showDiffPreview && fileDiff && (
            <div className="max-h-80 overflow-auto">
              <div
                className="sticky top-0 px-4 py-2 flex items-center justify-between"
                style={{ backgroundColor: 'var(--recoder-elements-bg-depth-1)', borderBottom: '1px solid var(--recoder-elements-borderColor)' }}
              >
                <button
                  onClick={handleCloseDiff}
                  className="flex items-center gap-1 text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary"
                >
                  <span className="i-ph:arrow-left" />
                  Back to files
                </button>
                <span className="text-xs text-recoder-elements-textTertiary font-mono">
                  {selectedFile?.path}
                </span>
              </div>
              <DiffPreview
                diff={fileDiff}
                onAccept={handleUndo}
                onReject={handleCloseDiff}
              />
            </div>
          )}

          {/* Actions */}
          {!showDiffPreview && (
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: 'var(--recoder-elements-bg-depth-1)', borderTop: '1px solid var(--recoder-elements-borderColor)' }}
            >
              <span className="text-xs text-recoder-elements-textTertiary">
                {state.previewFiles.length} file{state.previewFiles.length !== 1 ? 's' : ''} will be reverted
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDropdown(false)}
                  className="px-3 py-1.5 text-xs font-medium text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary rounded transition-colors hover:bg-recoder-elements-background-depth-3"
                  style={{ backgroundColor: 'var(--recoder-elements-bg-depth-3)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUndo}
                  disabled={state.isUndoing}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded transition-colors flex items-center gap-1.5"
                >
                  {state.isUndoing ? (
                    <>
                      <span className="i-ph:spinner-gap animate-spin" />
                      Undoing...
                    </>
                  ) : (
                    <>
                      <span className="i-ph:arrow-counter-clockwise" />
                      Undo All
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success feedback */}
      {state.lastResult && (
        <div className="absolute top-full right-0 mt-1 px-3 py-2 bg-green-500/90 text-white text-xs rounded-lg shadow-lg animate-fadeIn">
          {state.lastResult.type === 'undo' ? 'Undone' : 'Redone'} {state.lastResult.filesAffected} file{state.lastResult.filesAffected !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
});

export default UndoButton;
