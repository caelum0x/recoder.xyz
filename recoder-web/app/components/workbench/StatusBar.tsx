/**
 * StatusBar - VS Code style status bar at bottom of workbench
 * Shows git branch, sync status, errors, cursor position, language, indent, EOL
 */

import { memo, useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { errorCountAtom, criticalErrorCountAtom } from '~/lib/stores/errors';
import {
  cursorPositionAtom,
  fileSyncStatusAtom,
  fileMetadataAtom,
  gitBranchAtom,
  isGitInitializedAtom,
  setFileMetadata,
  type FileSyncStatus,
} from '~/lib/stores/status-bar';
import { preferencesStore, updateEditorPreferences } from '~/lib/stores/settings';
import { classNames } from '~/utils/classNames';

interface StatusBarProps {
  /** Callback when errors/warnings clicked - opens Problems panel */
  onProblemsClick?: () => void;
  /** Callback when language clicked - could open language picker */
  onLanguageClick?: () => void;
  className?: string;
}

export const StatusBar = memo(({ onProblemsClick, onLanguageClick, className = '' }: StatusBarProps) => {
  const errorCount = useStore(errorCountAtom);
  const criticalErrorCount = useStore(criticalErrorCountAtom);
  const warningCount = errorCount - criticalErrorCount;

  const cursorPosition = useStore(cursorPositionAtom);
  const fileSyncStatus = useStore(fileSyncStatusAtom);
  const fileMetadata = useStore(fileMetadataAtom);
  const gitBranch = useStore(gitBranchAtom);
  const isGitInitialized = useStore(isGitInitializedAtom);
  const preferences = useStore(preferencesStore);

  // Indent size picker popup state
  const [showIndentPicker, setShowIndentPicker] = useState(false);
  const [showEolPicker, setShowEolPicker] = useState(false);

  // Handle indent type/size change
  const handleIndentChange = useCallback((type: 'Spaces' | 'Tabs', size: number) => {
    setFileMetadata({ indentType: type, indentSize: size });
    updateEditorPreferences({ tabSize: size });
    setShowIndentPicker(false);
  }, []);

  // Handle EOL change
  const handleEolChange = useCallback((eol: 'LF' | 'CRLF') => {
    setFileMetadata({ eol });
    setShowEolPicker(false);
  }, []);

  // Get sync status icon and color
  const getSyncStatusDisplay = (status: FileSyncStatus) => {
    switch (status) {
      case 'synced':
        return { icon: 'i-ph:cloud-check', color: 'text-green-400', text: 'Synced' };
      case 'syncing':
        return { icon: 'i-ph:cloud-arrow-up animate-pulse', color: 'text-blue-400', text: 'Syncing...' };
      case 'unsaved':
        return { icon: 'i-ph:floppy-disk', color: 'text-yellow-400', text: 'Unsaved' };
      case 'error':
        return { icon: 'i-ph:cloud-x', color: 'text-red-400', text: 'Sync Error' };
      default:
        return { icon: 'i-ph:cloud', color: 'text-bolt-elements-textTertiary', text: 'Unknown' };
    }
  };

  const syncDisplay = getSyncStatusDisplay(fileSyncStatus);

  return (
    <div
      className={classNames(
        'flex items-center justify-between px-2 py-0.5 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor text-xs text-bolt-elements-textSecondary select-none',
        className
      )}
    >
      {/* Left side */}
      <div className="flex items-center gap-3">
        {/* Git Branch */}
        {isGitInitialized && gitBranch && (
          <button
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-transparent hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary transition-colors"
            title={`Git branch: ${gitBranch}`}
          >
            <span className="i-ph:git-branch text-purple-400" />
            <span className="max-w-[120px] truncate">{gitBranch}</span>
          </button>
        )}

        {/* Sync Status */}
        <button
          className={classNames(
            'flex items-center gap-1 px-1.5 py-0.5 rounded bg-transparent hover:bg-bolt-elements-background-depth-3 transition-colors',
            syncDisplay.color
          )}
          title={syncDisplay.text}
        >
          <span className={syncDisplay.icon} />
          <span className="hidden sm:inline">{syncDisplay.text}</span>
        </button>

        {/* Error/Warning Count */}
        <button
          onClick={onProblemsClick}
          className={classNames(
            'flex items-center gap-2 px-1.5 py-0.5 rounded bg-transparent hover:bg-bolt-elements-background-depth-3 transition-colors',
            errorCount > 0 ? 'hover:text-bolt-elements-textPrimary' : ''
          )}
          title={`${criticalErrorCount} error(s), ${warningCount} warning(s)`}
        >
          {/* Errors */}
          <span className={classNames(
            'flex items-center gap-0.5',
            criticalErrorCount > 0 ? 'text-red-400' : 'text-bolt-elements-textTertiary'
          )}>
            <span className="i-ph:x-circle" />
            <span>{criticalErrorCount}</span>
          </span>

          {/* Warnings */}
          <span className={classNames(
            'flex items-center gap-0.5',
            warningCount > 0 ? 'text-yellow-400' : 'text-bolt-elements-textTertiary'
          )}>
            <span className="i-ph:warning" />
            <span>{warningCount}</span>
          </span>
        </button>
      </div>

      {/* Right side — simplified: Ln X, Col Y | Language (click for editor info dropdown) */}
      <div className="flex items-center gap-2">
        {/* Line:Column */}
        <button
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-transparent hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary transition-colors font-mono"
          title={cursorPosition.selection
            ? `${cursorPosition.selection.selectedLines} lines, ${cursorPosition.selection.selectedChars} characters selected`
            : 'Go to Line'
          }
        >
          <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
          {cursorPosition.selection && cursorPosition.selection.selectedChars > 0 && (
            <span className="text-blue-400 ml-1">
              ({cursorPosition.selection.selectedChars} selected)
            </span>
          )}
        </button>

        {/* Language — click to show Editor Info dropdown with indent/encoding/EOL */}
        <div className="relative">
          <button
            onClick={() => {
              setShowIndentPicker(!showIndentPicker);
              setShowEolPicker(false);
            }}
            className="px-1.5 py-0.5 rounded bg-transparent hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary transition-colors"
            title={`${fileMetadata.language} · Click for editor info`}
          >
            {fileMetadata.language}
          </button>

          {/* Editor Info Dropdown — indent, encoding, EOL grouped together */}
          {showIndentPicker && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowIndentPicker(false)}
              />
              <div className="absolute bottom-full right-0 mb-1 py-1 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-lg z-50 min-w-[180px]">
                {/* Indent section */}
                <div className="px-2 py-1 text-[10px] text-bolt-elements-textTertiary uppercase tracking-wider">
                  Indent Using
                </div>
                <button
                  onClick={() => handleIndentChange('Spaces', 2)}
                  className={classNames(
                    'w-full px-3 py-1.5 text-left hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                    fileMetadata.indentType === 'Spaces' && fileMetadata.indentSize === 2 ? 'text-blue-400' : ''
                  )}
                >
                  2 Spaces
                </button>
                <button
                  onClick={() => handleIndentChange('Spaces', 4)}
                  className={classNames(
                    'w-full px-3 py-1.5 text-left hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                    fileMetadata.indentType === 'Spaces' && fileMetadata.indentSize === 4 ? 'text-blue-400' : ''
                  )}
                >
                  4 Spaces
                </button>
                <button
                  onClick={() => handleIndentChange('Tabs', 1)}
                  className={classNames(
                    'w-full px-3 py-1.5 text-left hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                    fileMetadata.indentType === 'Tabs' ? 'text-blue-400' : ''
                  )}
                >
                  Tabs
                </button>

                {/* Encoding section */}
                <div className="border-t border-bolt-elements-borderColor mt-1 pt-1">
                  <div className="px-2 py-1 text-[10px] text-bolt-elements-textTertiary uppercase tracking-wider">
                    Encoding
                  </div>
                  <div className="px-3 py-1.5 text-bolt-elements-textSecondary text-sm">
                    {fileMetadata.encoding}
                  </div>
                </div>

                {/* EOL section */}
                <div className="border-t border-bolt-elements-borderColor mt-1 pt-1">
                  <div className="px-2 py-1 text-[10px] text-bolt-elements-textTertiary uppercase tracking-wider">
                    Line Ending
                  </div>
                  <button
                    onClick={() => handleEolChange('LF')}
                    className={classNames(
                      'w-full px-3 py-1.5 text-left hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      fileMetadata.eol === 'LF' ? 'text-blue-400' : ''
                    )}
                  >
                    LF (Unix)
                  </button>
                  <button
                    onClick={() => handleEolChange('CRLF')}
                    className={classNames(
                      'w-full px-3 py-1.5 text-left hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      fileMetadata.eol === 'CRLF' ? 'text-blue-400' : ''
                    )}
                  >
                    CRLF (Windows)
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

StatusBar.displayName = 'StatusBar';

export default StatusBar;
