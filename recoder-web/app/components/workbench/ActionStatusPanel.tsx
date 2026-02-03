/**
 * ActionStatusPanel Component
 *
 * Displays action queue status in the workbench.
 * Shows:
 * - Currently running action
 * - Progress bar
 * - List of pending/failed actions
 * - Retry/cancel controls
 */

import { memo, useState, useCallback } from 'react';
import { useActionQueue, useQueueProgress } from '~/lib/hooks/useActionQueue';
import type { QueuedAction } from '~/lib/runtime/action-queue';

// ============================================================================
// STATUS BADGE
// ============================================================================

interface StatusBadgeProps {
  status: QueuedAction['status'];
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-gray-500', text: 'text-gray-100', label: 'Pending' },
    running: { bg: 'bg-blue-500', text: 'text-blue-100', label: 'Running' },
    success: { bg: 'bg-green-500', text: 'text-green-100', label: 'Done' },
    failed: { bg: 'bg-red-500', text: 'text-red-100', label: 'Failed' },
    timeout: { bg: 'bg-orange-500', text: 'text-orange-100', label: 'Timeout' },
    cancelled: { bg: 'bg-gray-400', text: 'text-gray-100', label: 'Cancelled' },
    rollback: { bg: 'bg-yellow-500', text: 'text-yellow-100', label: 'Rolling back' },
    rolled_back: { bg: 'bg-yellow-600', text: 'text-yellow-100', label: 'Rolled back' },
  };

  const { bg, text, label } = config[status] || config.pending;

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full ${bg} ${text}`}>
      {label}
    </span>
  );
});

// ============================================================================
// ACTION ITEM
// ============================================================================

interface ActionItemProps {
  action: QueuedAction;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRollback: (id: string) => void;
  canRollback: boolean;
}

const ActionItem = memo(function ActionItem({
  action,
  onRetry,
  onCancel,
  onRollback,
  canRollback,
}: ActionItemProps) {
  const showRetry = action.status === 'failed' || action.status === 'timeout';
  const showCancel = action.status === 'pending';
  const showRollback = canRollback && (action.status === 'success' || action.status === 'failed');

  return (
    <div className="flex items-center gap-2 p-2 bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor">
      {/* Status icon */}
      <div className="flex-shrink-0">
        {action.status === 'running' && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
        {action.status === 'success' && (
          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        {(action.status === 'failed' || action.status === 'timeout') && (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        )}
        {action.status === 'pending' && (
          <svg className="w-4 h-4 text-bolt-elements-textSecondary" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-bolt-elements-textPrimary truncate">
            {action.type}
          </span>
          <StatusBadge status={action.status} />
        </div>

        {action.filePath && (
          <div className="text-xs text-bolt-elements-textSecondary truncate">
            {action.filePath}
          </div>
        )}

        {action.error && (
          <div className="text-xs text-red-400 truncate mt-1">
            {action.error}
          </div>
        )}

        {action.status === 'running' && (
          <div className="mt-1">
            <div className="w-full bg-bolt-elements-background-depth-3 rounded-full h-1">
              <div
                className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                style={{ width: `${action.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex gap-1">
        {showRetry && (
          <button
            onClick={() => onRetry(action.id)}
            className="p-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-bolt-elements-background-depth-3 rounded"
            title="Retry"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}

        {showRollback && (
          <button
            onClick={() => onRollback(action.id)}
            className="p-1 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-bolt-elements-background-depth-3 rounded"
            title="Undo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
        )}

        {showCancel && (
          <button
            onClick={() => onCancel(action.id)}
            className="p-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 rounded"
            title="Cancel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// PROGRESS BAR
// ============================================================================

interface ProgressBarProps {
  progress: number;
  current: number;
  total: number;
  currentFile?: string;
}

const ProgressBar = memo(function ProgressBar({
  progress,
  current,
  total,
  currentFile,
}: ProgressBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-bolt-elements-textSecondary">
        <span>{current} / {total} actions</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full bg-bolt-elements-background-depth-3 rounded-full h-2">
        <div
          className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {currentFile && (
        <div className="text-xs text-bolt-elements-textSecondary truncate">
          Processing: {currentFile}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// MAIN PANEL
// ============================================================================

interface ActionStatusPanelProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  maxVisibleActions?: number;
}

export const ActionStatusPanel = memo(function ActionStatusPanel({
  collapsed = false,
  onToggleCollapse,
  maxVisibleActions = 5,
}: ActionStatusPanelProps) {
  const {
    status,
    isRunning,
    actions,
    currentAction,
    failedActions,
    pendingActions,
    stats,
    retry,
    cancel,
    rollback,
    canRollbackAction,
    retryAll,
    cancelAll,
    clearDone,
  } = useActionQueue();

  const progress = useQueueProgress();

  const [showAll, setShowAll] = useState(false);

  // Handler for rollback (async)
  const handleRollback = useCallback(async (id: string) => {
    await rollback(id);
  }, [rollback]);

  // Don't show if no actions
  if (actions.length === 0) {
    return null;
  }

  // Get visible actions
  const visibleActions = showAll
    ? actions
    : actions.slice(0, maxVisibleActions);

  const hasMore = actions.length > maxVisibleActions;

  return (
    <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-bolt-elements-background-depth-2 cursor-pointer"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-bolt-elements-textPrimary">
            Actions
          </span>
          {isRunning && (
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
          <span className="text-xs text-bolt-elements-textSecondary">
            ({stats.pending} pending, {stats.success} done)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {failedActions.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                retryAll();
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Retry all failed
            </button>
          )}

          {pendingActions.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                cancelAll();
              }}
              className="text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textSecondary"
            >
              Cancel all
            </button>
          )}

          {stats.success > 0 && !isRunning && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearDone();
              }}
              className="text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textSecondary"
            >
              Clear done
            </button>
          )}

          <svg
            className={`w-4 h-4 text-bolt-elements-textSecondary transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Progress bar */}
          {isRunning && (
            <ProgressBar
              progress={progress.percent}
              current={progress.current}
              total={progress.total}
              currentFile={progress.currentFile}
            />
          )}

          {/* Action list */}
          <div className="space-y-2">
            {visibleActions.map((action) => (
              <ActionItem
                key={action.id}
                action={action}
                onRetry={retry}
                onCancel={cancel}
                onRollback={handleRollback}
                canRollback={canRollbackAction(action.id)}
              />
            ))}
          </div>

          {/* Show more/less */}
          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary py-1"
            >
              {showAll
                ? 'Show less'
                : `Show ${actions.length - maxVisibleActions} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// COMPACT STATUS INDICATOR
// ============================================================================

interface CompactActionStatusProps {
  onClick?: () => void;
}

export const CompactActionStatus = memo(function CompactActionStatus({
  onClick,
}: CompactActionStatusProps) {
  const { isRunning, stats, failedActions } = useActionQueue();
  const progress = useQueueProgress();

  // Don't show if idle with no actions
  if (!isRunning && stats.total === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-1 bg-bolt-elements-background-depth-2 rounded hover:bg-bolt-elements-background-depth-3 transition-colors"
    >
      {isRunning ? (
        <>
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-bolt-elements-textSecondary">
            {progress.current}/{progress.total}
          </span>
        </>
      ) : failedActions.length > 0 ? (
        <>
          <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-xs text-red-400">
            {failedActions.length} failed
          </span>
        </>
      ) : (
        <>
          <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-xs text-green-400">
            {stats.success} done
          </span>
        </>
      )}
    </button>
  );
});

// ============================================================================
// FILE STATUS INDICATOR
// ============================================================================

interface FileStatusIndicatorProps {
  filePath: string;
}

export const FileStatusIndicator = memo(function FileStatusIndicator({
  filePath,
}: FileStatusIndicatorProps) {
  const { getFileStatus } = useActionQueue();
  const status = getFileStatus(filePath);

  if (!status) return null;

  if (status.isModifying) {
    return (
      <div className="inline-flex items-center gap-1 text-xs text-blue-400">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <span>Modifying...</span>
      </div>
    );
  }

  if (status.hasError) {
    return (
      <div className="inline-flex items-center gap-1 text-xs text-red-400">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span>Error</span>
      </div>
    );
  }

  return null;
});

export default ActionStatusPanel;
