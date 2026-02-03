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
  selectError,
  selectedErrorAtom,
  type BuildError,
} from '~/lib/stores/errors';
import {
  formatErrorsForAI,
  requestEnhancedAIFix,
  createFixPlan,
  type AutoFixOptions,
} from '~/lib/services/auto-fix';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerGet } from '~/lib/services/docker-api';

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
  const selectedError = useStore(selectedErrorAtom);
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  
  // Filtering state
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFixableOnly, setShowFixableOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-fix state
  const [showFixPlan, setShowFixPlan] = useState(false);
  const [fixPlan, setFixPlan] = useState<ReturnType<typeof createFixPlan> | null>(null);
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  
  // Fetch errors when panel mounts or projectId changes
  useEffect(() => {
    if (!projectId) return;
    // Note: Removed containerReady check - errors can exist before dev server starts
    
    const fetchErrors = async () => {
      setIsLoading(true);
      try {
        const data = await dockerGet<import('~/lib/stores/errors').ErrorsResponse>(`/api/errors/${projectId}?tail=200`);
        setErrors(data);
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

  // PERFORMANCE: Compute error/warning counts efficiently in a single pass
  const { errorCount, warningCount } = useMemo(() => {
    let errCount = 0;
    let warnCount = 0;
    for (const e of errors) {
      if (e.severity === 'error') errCount++;
      else if (e.severity === 'warning') warnCount++;
    }
    return { errorCount: errCount, warningCount: warnCount };
  }, [errors]);

  const handleErrorClick = useCallback(
    (error: BuildError) => {
      // Select the error to highlight it in the editor
      selectError(error);
      // Also call the callback if provided
      onErrorClick?.(error);
    },
    [onErrorClick]
  );

  const handleShowFixPlan = useCallback(() => {
    if (filteredErrors.length === 0) return;

    const plan = createFixPlan(filteredErrors, {
      requireConfirmation,
      autoReadFiles: autoFixEnabled,
      checkDependencies: autoFixEnabled,
    });

    setFixPlan(plan);
    setShowFixPlan(true);
  }, [filteredErrors, requireConfirmation, autoFixEnabled]);

  const handleFixAll = useCallback(async () => {
    if (!canAutoFix() || filteredErrors.length === 0 || !projectId) return;

    // Set fixing state
    setAutoFixing(true);

    try {
      const options: AutoFixOptions = {
        requireConfirmation,
        autoReadFiles: autoFixEnabled,
        checkDependencies: autoFixEnabled,
        maxFilesToRead: 10,
      };

      // Use enhanced AI fix if auto-fix is enabled
      if (autoFixEnabled) {
        await requestEnhancedAIFix(
          filteredErrors,
          projectId,
          (prompt) => {
            // Dispatch event to chat
            window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
              detail: { prompt, errors: filteredErrors }
            }));
          },
          options
        );
      } else {
        // Use basic format
        const prompt = formatErrorsForAI(filteredErrors, options);
        if (prompt) {
          window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
            detail: { prompt, errors: filteredErrors }
          }));
        }
      }

      // Also call callback if provided
      onFixWithAI?.(filteredErrors);
    } catch (error) {
      console.error('[ProblemsPanel] Fix failed:', error);
    } finally {
      // Reset fixing state after a short delay
      setTimeout(() => setAutoFixing(false), 2000);
    }
  }, [filteredErrors, projectId, onFixWithAI, requireConfirmation, autoFixEnabled]);

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
      {/* Fix Plan Modal */}
      {showFixPlan && fixPlan && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="p-4 border-b border-bolt-elements-borderColor">
              <h3 className="text-lg font-medium">Auto-Fix Plan</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Errors to Fix ({fixPlan.errors.length})</h4>
                <div className="space-y-1 text-xs">
                  {fixPlan.errors.slice(0, 5).map((error) => (
                    <div key={error.id} className="text-bolt-elements-textSecondary">
                      - {error.filePath ? error.filePath.replace('/workspace/', '') : 'General'}: {error.shortMessage}
                    </div>
                  ))}
                  {fixPlan.errors.length > 5 && (
                    <div className="text-bolt-elements-textSecondary">... and {fixPlan.errors.length - 5} more</div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Files to Read ({fixPlan.filesToRead.length})</h4>
                <div className="space-y-1 text-xs text-bolt-elements-textSecondary">
                  {fixPlan.filesToRead.map((file) => (
                    <div key={file}>- {file}</div>
                  ))}
                </div>
              </div>

              {fixPlan.missingDependencies.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-yellow-400">
                    Missing Dependencies ({fixPlan.missingDependencies.length})
                  </h4>
                  <div className="space-y-1 text-xs text-bolt-elements-textSecondary">
                    {fixPlan.missingDependencies.map((dep) => (
                      <div key={dep}>- {dep}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-bolt-elements-borderColor">
                <div className="text-xs text-bolt-elements-textSecondary">
                  Estimated steps: {fixPlan.estimatedSteps}
                </div>
                {fixPlan.requiresUserConfirmation && (
                  <div className="text-xs text-yellow-400 mt-1">
                    You will be asked to confirm before fixes are applied
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-bolt-elements-borderColor flex justify-end gap-2">
              <button
                onClick={() => setShowFixPlan(false)}
                className="px-3 py-1.5 text-sm bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowFixPlan(false);
                  handleFixAll();
                }}
                className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Proceed with Fix
              </button>
            </div>
          </div>
        </div>
      )}

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

          {/* Fix All buttons */}
          {onFixWithAI && filteredErrors.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Settings toggle */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRequireConfirmation(!requireConfirmation)}
                  className="text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textSecondary"
                  title={requireConfirmation ? "Confirmation required" : "Auto-fix without confirmation"}
                >
                  <span className={requireConfirmation ? "i-ph:shield-check" : "i-ph:shield"} />
                </button>
                <button
                  onClick={() => setAutoFixEnabled(!autoFixEnabled)}
                  className="text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textSecondary"
                  title={autoFixEnabled ? "Enhanced auto-fix enabled" : "Basic mode"}
                >
                  <span className={autoFixEnabled ? "i-ph:lightning-fill" : "i-ph:lightning"} />
                </button>
              </div>

              {/* Show Plan button */}
              <button
                onClick={handleShowFixPlan}
                disabled={isAutoFixing}
                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4"
              >
                <span className="i-ph:list-checks" />
                Plan
              </button>

              {/* Fix All button */}
              <button
                onClick={handleFixAll}
                disabled={isAutoFixing || !canAutoFix()}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  isAutoFixing
                    ? 'bg-blue-500/20 text-blue-300 cursor-wait'
                    : canAutoFix()
                    ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary cursor-not-allowed'
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
                    Fix All
                  </>
                )}
              </button>
            </div>
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
              className="w-full px-2 py-1 text-xs text-bolt-elements-textPrimary bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-blue-500 placeholder:text-bolt-elements-textSecondary"
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
              <span className="i-ph:file-code text-bolt-elements-textSecondary" />
              <span className="text-bolt-elements-textPrimary font-medium truncate">
                {filePath === '__no_file__' ? 'General' : filePath.replace('/workspace/', '')}
              </span>
              <span className="text-bolt-elements-textSecondary">
                ({fileErrors.length})
              </span>
            </div>

            {/* Errors in file */}
            {fileErrors.map((error) => {
              const isSelected = selectedError?.id === error.id;
              return (
              <div
                key={error.id}
                onClick={() => handleErrorClick(error)}
                className={`flex items-start gap-2 px-3 py-1.5 pl-6 text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-500/20 border-l-2 border-blue-500'
                    : 'hover:bg-bolt-elements-item-backgroundActive'
                }`}
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
                  <div className="text-bolt-elements-textPrimary truncate">
                    {error.shortMessage || error.message}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-bolt-elements-textSecondary">
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
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

ProblemsPanel.displayName = 'ProblemsPanel';
