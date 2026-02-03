/**
 * useActionQueue Hook
 *
 * React hook for tracking action queue status in UI components.
 * Provides:
 * - Current queue status
 * - List of actions with their states
 * - Progress tracking per file
 * - Retry/cancel controls
 */

import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useState } from 'react';
import {
  queueStatus,
  queuedActions,
  currentActionId,
  actionGroups,
  getQueueStats,
  cancelAction,
  cancelAllPending,
  retryAction,
  retryAllFailed,
  rollbackAction,
  canRollback,
  clearCompleted,
  pauseQueue,
  resumeQueue,
  subscribeToQueue,
  type QueuedAction,
  type ActionGroup,
  type QueueStats,
  type QueueEvent,
  type ActionQueueStatus,
} from '~/lib/runtime/action-queue';

// ============================================================================
// MAIN HOOK
// ============================================================================

export interface UseActionQueueResult {
  // Status
  status: ActionQueueStatus;
  isRunning: boolean;
  isPaused: boolean;
  isIdle: boolean;

  // Actions
  actions: QueuedAction[];
  currentAction: QueuedAction | null;
  pendingActions: QueuedAction[];
  completedActions: QueuedAction[];
  failedActions: QueuedAction[];

  // Stats
  stats: QueueStats;
  progressPercent: number;

  // Groups
  groups: ActionGroup[];

  // Controls
  pause: () => void;
  resume: () => void;
  cancel: (actionId: string) => boolean;
  cancelAll: () => number;
  retry: (actionId: string) => boolean;
  retryAll: () => number;
  rollback: (actionId: string) => Promise<boolean>;
  canRollbackAction: (actionId: string) => boolean;
  clearDone: () => void;

  // File-specific
  getFileStatus: (filePath: string) => FileActionStatus | null;
  getFilesInProgress: () => string[];
}

export interface FileActionStatus {
  filePath: string;
  action: QueuedAction;
  isModifying: boolean;
  hasError: boolean;
  canUndo: boolean;
}

export function useActionQueue(): UseActionQueueResult {
  const status = useStore(queueStatus);
  const actionsMap = useStore(queuedActions);
  const currentId = useStore(currentActionId);
  const groupsMap = useStore(actionGroups);

  // Convert maps to arrays
  const actions = Object.values(actionsMap).filter(Boolean) as QueuedAction[];
  const groups = Object.values(groupsMap).filter(Boolean) as ActionGroup[];

  // Current action
  const currentAction = currentId ? actionsMap[currentId] : null;

  // Filtered lists
  const pendingActions = actions.filter(a => a.status === 'pending');
  const completedActions = actions.filter(a => a.status === 'success');
  const failedActions = actions.filter(a =>
    a.status === 'failed' || a.status === 'timeout'
  );

  // Stats
  const stats = getQueueStats();

  // Progress percent
  const progressPercent = stats.total > 0
    ? Math.round((stats.success / stats.total) * 100)
    : 0;

  // Get status for a specific file
  const getFileStatus = useCallback((filePath: string): FileActionStatus | null => {
    const action = actions.find(a => a.filePath === filePath);
    if (!action) return null;

    return {
      filePath,
      action,
      isModifying: action.status === 'running',
      hasError: action.status === 'failed' || action.status === 'timeout',
      canUndo: canRollback(action.id),
    };
  }, [actions]);

  // Get all files currently being modified
  const getFilesInProgress = useCallback((): string[] => {
    return actions
      .filter(a => a.status === 'running' && a.filePath)
      .map(a => a.filePath!);
  }, [actions]);

  // Controls
  const pause = useCallback(() => pauseQueue(), []);
  const resume = useCallback(() => resumeQueue(), []);
  const cancel = useCallback((id: string) => cancelAction(id), []);
  const cancelAll = useCallback(() => cancelAllPending(), []);
  const retry = useCallback((id: string) => retryAction(id), []);
  const retryAll = useCallback(() => retryAllFailed(), []);
  const rollback = useCallback((id: string) => rollbackAction(id), []);
  const canRollbackAction = useCallback((id: string) => canRollback(id), []);
  const clearDone = useCallback(() => clearCompleted(), []);

  return {
    status,
    isRunning: status === 'running',
    isPaused: status === 'paused',
    isIdle: status === 'idle',
    actions,
    currentAction,
    pendingActions,
    completedActions,
    failedActions,
    stats,
    progressPercent,
    groups,
    pause,
    resume,
    cancel,
    cancelAll,
    retry,
    retryAll,
    rollback,
    canRollbackAction,
    clearDone,
    getFileStatus,
    getFilesInProgress,
  };
}

// ============================================================================
// FILE STATUS HOOK
// ============================================================================

/**
 * Hook to track action status for a specific file
 */
export function useFileActionStatus(filePath: string): FileActionStatus | null {
  const actionsMap = useStore(queuedActions);
  const actions = Object.values(actionsMap).filter(Boolean) as QueuedAction[];

  const action = actions.find(a => a.filePath === filePath);
  if (!action) return null;

  return {
    filePath,
    action,
    isModifying: action.status === 'running',
    hasError: action.status === 'failed' || action.status === 'timeout',
    canUndo: canRollback(action.id),
  };
}

// ============================================================================
// EVENT SUBSCRIPTION HOOK
// ============================================================================

/**
 * Hook to subscribe to queue events
 */
export function useQueueEvents(callback: (event: QueueEvent) => void): void {
  useEffect(() => {
    return subscribeToQueue(callback);
  }, [callback]);
}

// ============================================================================
// PROGRESS HOOK
// ============================================================================

/**
 * Hook for overall queue progress
 */
export interface QueueProgress {
  percent: number;
  current: number;
  total: number;
  currentFile?: string;
  estimatedTimeRemaining?: number; // ms
}

export function useQueueProgress(): QueueProgress {
  const stats = getQueueStats();
  const currentId = useStore(currentActionId);
  const actionsMap = useStore(queuedActions);

  const [startTime] = useState(Date.now());

  const currentAction = currentId ? actionsMap[currentId] : null;
  const completed = stats.success + stats.failed + stats.cancelled;

  // Estimate time remaining based on completed rate
  let estimatedTimeRemaining: number | undefined;
  if (completed > 0 && stats.pending > 0) {
    const elapsed = Date.now() - startTime;
    const avgTimePerAction = elapsed / completed;
    estimatedTimeRemaining = avgTimePerAction * stats.pending;
  }

  return {
    percent: stats.total > 0 ? Math.round((completed / stats.total) * 100) : 0,
    current: completed,
    total: stats.total,
    currentFile: currentAction?.filePath,
    estimatedTimeRemaining,
  };
}

// ============================================================================
// TOAST NOTIFICATIONS HOOK
// ============================================================================

export interface ActionToast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  actionId?: string;
  dismissable: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Hook for action-related toast notifications
 */
export function useActionToasts(): {
  toasts: ActionToast[];
  dismiss: (id: string) => void;
  dismissAll: () => void;
} {
  const [toasts, setToasts] = useState<ActionToast[]>([]);

  useEffect(() => {
    return subscribeToQueue((event) => {
      let toast: ActionToast | null = null;

      switch (event.type) {
        case 'action-failed':
          toast = {
            id: `toast-${Date.now()}`,
            type: 'error',
            message: `Failed: ${event.action?.description || 'Action failed'}`,
            actionId: event.actionId,
            dismissable: true,
            action: event.actionId ? {
              label: 'Retry',
              onClick: () => retryAction(event.actionId!),
            } : undefined,
          };
          break;

        case 'action-rollback':
          toast = {
            id: `toast-${Date.now()}`,
            type: 'warning',
            message: `Rolled back: ${event.action?.filePath || 'Changes reverted'}`,
            dismissable: true,
          };
          break;
      }

      if (toast) {
        setToasts(prev => [...prev, toast!]);

        // Auto-dismiss after 5 seconds for non-errors
        if (toast.type !== 'error') {
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== toast!.id));
          }, 5000);
        }
      }
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return { toasts, dismiss, dismissAll };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default useActionQueue;
