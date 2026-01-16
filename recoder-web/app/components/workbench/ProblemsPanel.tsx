/**
 * ProblemsPanel - VS Code style problems/errors panel
 * Shows build errors grouped by file, click to navigate
 * Includes filtering and quick fixes
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  errorsAtom,
  errorsByFileAtom,
  isAutoFixingAtom,
  setAutoFixing,
  setErrors,
  canAutoFix,
  type BuildError,
} from '~/lib/stores/errors';
import { formatErrorsForAI } from '~/lib/services/auto-fix';
import { workbenchStore } from '~/lib/stores/workbench';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';

interface ProblemsPanelProps {
  /** Callback when clicking an error to navigate to file:line */
  onErrorClick?: (error: BuildError) => void;
  /** Callback for "Fix with AI" */
  onFixWithAI?: (errors: BuildError[]) => void;
  className?: string;
}

type FilterSeverity = 'all' | 'error' | 'warning';

export const ProblemsPanel = memo(({ onErrorClick, onFixWithAI, className = '' }: ProblemsPanelProps) => {
  const errors = useStore(errorsAtom);
  const errorsByFile = useStore(errorsByFileAtom);
  const isAutoFixing = useStore(isAutoFixingAtom);
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  
  // Filtering state
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFixableOnly, setShowFixableOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch errors when panel mounts or projectId changes
  useEffect(() => {
    if (!projectId || !containerReady) return;
    
    const fetchErrors = async () => {
      setIsLoading(true);
      try {
        const resp = await fetch(`${DOCKER_URL}/api/errors/${projectId}?tail=200`);
        if (resp.ok) {
          const data = await resp.json() as import('~/lib/stores/errors').ErrorsResponse;
          setErrors(data);
        }
      } catch (e) {
        console.warn('[ProblemsPanel] Failed to fetch errors:', e);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Fetch immediately
    fetchErrors();
    
    // Poll every 10 seconds for new errors
    const interval = setInterval(fetchErrors, 10000);
    return () => clearInterval(interval);
  }, [projectId, containerReady]);

  // Filtered errors
  const filteredErrors = useMemo(() => {
    let filtered = errors;
    
    // Filter by severity
    if (filterSeverity !== 'all') {
      filtered = filtered.filter(e => e.severity === filterSeverity);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e => 
        e.message.toLowerCase().includes(query) ||
        e.filePath?.toLowerCase().includes(query)
      );
    }
    
    // Filter by fixable (currently all errors are fixable by AI)
    if (showFixableOnly) {
      // For now, all errors with file/line info are considered fixable by AI
      filtered = filtered.filter(e => e.filePath && e.line);
    }
    
    return filtered;
  }, [errors, filterSeverity, searchQuery, showFixableOnly]);

  const errorCount = useMemo(() => errors.filter((e) => e.severity === 'error').length, [errors]);
  const warningCount = useMemo(() => errors.filter((e) => e.severity === 'warning').length, [errors]);

  const handleErrorClick = useCallback(
    (error: BuildError) => {
      onErrorClick?.(error);
    },
    [onErrorClick]
  );

  const handleFixAll = useCallback(() => {
    if (!canAutoFix() || filteredErrors.length === 0) return;

    // Format errors for AI
    const prompt = formatErrorsForAI(filteredErrors);

    if (prompt) {
      // Set fixing state
      setAutoFixing(true);

      // Dispatch event to chat
      window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
        detail: { prompt, errors: filteredErrors }
      }));

      // Reset fixing state after a short delay (chat will handle the actual fix)
      setTimeout(() => setAutoFixing(false), 2000);
    }

    // Also call callback if provided
    onFixWithAI?.(filteredErrors);
  }, [filteredErrors, onFixWithAI]);

  // Sort files by error count (most errors first)
  const sortedFiles = useMemo(() => {
    return Object.entries(errorsByFile).sort((a, b) => b[1].length - a[1].length);
  }, [errorsByFile]);

  if (errors.length === 0) {
    return (
      <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
        <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
          <div className="text-center">
            <div className="i-ph:check-circle text-3xl text-green-500 mb-2 mx-auto" />
            <p className="text-sm">No problems detected</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
      {/* Header with Filters */}
      <div className="flex flex-col border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        {/* Top row: Title and actions */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Problems</span>
            <div className="flex items-center gap-2 text-xs">
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <span className="i-ph:x-circle-fill" />
                  {errorCount}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-yellow-400">
                  <span className="i-ph:warning-fill" />
                  {warningCount}
                </span>
              )}
            </div>
          </div>

          {/* Fix All button */}
          {onFixWithAI && filteredErrors.length > 0 && (
            <button
              onClick={handleFixAll}
              disabled={isAutoFixing || !canAutoFix()}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors ${
                isAutoFixing
                  ? 'bg-blue-500/20 text-blue-300 cursor-wait'
                  : canAutoFix()
                  ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                  : 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isAutoFixing ? (
                <>
                  <span className="i-ph:spinner animate-spin" />
                  Fixing...
                </>
              ) : (
                <>
                  <span className="i-ph:magic-wand" />
                  Fix All with AI
                </>
              )}
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-bolt-elements-borderColor">
          {/* Search */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Filter problems..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2 py-1 text-xs text-white bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
              >
                <span className="i-ph:x text-xs" />
              </button>
            )}
          </div>

          {/* Severity filter */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setFilterSeverity('all')}
              className={`px-2 py-1 rounded transition-colors ${
                filterSeverity === 'all'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterSeverity('error')}
              className={`px-2 py-1 rounded transition-colors ${
                filterSeverity === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
              }`}
            >
              Errors
            </button>
            <button
              onClick={() => setFilterSeverity('warning')}
              className={`px-2 py-1 rounded transition-colors ${
                filterSeverity === 'warning'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
              }`}
            >
              Warnings
            </button>
          </div>

          {/* Fixable only toggle */}
          <button
            onClick={() => setShowFixableOnly(!showFixableOnly)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              showFixableOnly
                ? 'bg-green-500/20 text-green-400'
                : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'
            }`}
            title="Show only fixable problems"
          >
            <span className="i-ph:wrench" />
            Fixable
          </button>
        </div>
      </div>

      {/* Problems list */}
      <div className="flex-1 overflow-auto">
        {sortedFiles.map(([filePath, fileErrors]) => (
          <div key={filePath} className="border-b border-bolt-elements-borderColor/50">
            {/* File header */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-bolt-elements-background-depth-2/50 text-xs">
              <span className="i-ph:file-code text-gray-400" />
              <span className="text-gray-200 font-medium truncate">
                {filePath === '__no_file__' ? 'General' : filePath.replace('/workspace/', '')}
              </span>
              <span className="text-gray-400">
                ({fileErrors.length})
              </span>
            </div>

            {/* Errors in file */}
            {fileErrors.map((error) => (
              <div
                key={error.id}
                onClick={() => handleErrorClick(error)}
                className="flex items-start gap-2 px-3 py-1.5 pl-6 text-xs cursor-pointer hover:bg-bolt-elements-item-backgroundActive transition-colors"
              >
                {/* Severity icon */}
                <span
                  className={`mt-0.5 shrink-0 ${
                    error.severity === 'error'
                      ? 'i-ph:x-circle-fill text-red-500'
                      : 'i-ph:warning-fill text-yellow-500'
                  }`}
                />

                {/* Error details */}
                <div className="flex-1 min-w-0">
                  <div className="text-gray-100 truncate">
                    {error.shortMessage || error.message}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                    {error.line && (
                      <span className="font-mono">
                        Ln {error.line}{error.column ? `, Col ${error.column}` : ''}
                      </span>
                    )}
                    <span className="px-1 py-0.5 rounded bg-bolt-elements-background-depth-3 text-[10px]">
                      {error.source}
                    </span>
                  </div>
                </div>

                {/* Fix with AI button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const prompt = `Fix this ${error.severity} in ${error.filePath || 'the code'}:\n\n${error.message}${error.line ? `\n\nLine ${error.line}${error.column ? `, Column ${error.column}` : ''}` : ''}`;
                    window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
                      detail: { prompt, errors: [error] }
                    }));
                  }}
                  className="shrink-0 px-2 py-1 text-[10px] bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
                  title="Fix this error with AI"
                >
                  <span className="i-ph:magic-wand mr-1" />
                  Fix
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

ProblemsPanel.displayName = 'ProblemsPanel';
