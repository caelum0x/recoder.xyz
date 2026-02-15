/**
 * Checkpoints Hook
 * Provides React integration for the checkpoints system
 */

import { useCallback, useMemo, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { createScopedLogger } from '~/utils/logger';
import {
  checkpointsStore,
  checkpointConfigStore,
  activeCheckpointId,
  isCheckpointOperationInProgress,
  checkpointInitialized,
  checkpointError,
  sortedCheckpoints,
  createCheckpoint,
  updateCheckpointStatus,
  finalizeCheckpoint,
  failCheckpoint,
  getCheckpoint,
  getActiveCheckpoint,
  getLatestCheckpoint,
  getCheckpointChain,
  setActiveCheckpoint,
  deleteCheckpoint,
  pruneCheckpoints,
  clearProjectCheckpoints,
  createCheckpointDiff,
  formatDiffSummary,
  startAutoCheckpoint,
  stopAutoCheckpoint,
  initializeCheckpoints,
  waitForCheckpointInit,
  getCheckpointStatusColor,
  getCheckpointStatusIcon,
  formatCheckpointDisplay,
  getRelativeTime,
  type Checkpoint,
  type CheckpointDiff,
  type CheckpointConfig,
  type CheckpointStatus,
} from '~/lib/services/checkpoints';

const logger = createScopedLogger('Checkpoints');

export interface UseCheckpointsOptions {
  projectId: string;
  autoInit?: boolean;
  autoCheckpoint?: boolean;
  onCreateCheckpoint?: () => Promise<{ commitHash: string; files?: Checkpoint['filesSnapshot'] }>;
}

export interface UseCheckpointsReturn {
  // State
  checkpoints: Checkpoint[];
  activeCheckpoint: Checkpoint | null;
  latestCheckpoint: Checkpoint | undefined;
  isOperationInProgress: boolean;
  isInitialized: boolean;
  error: string | null;
  config: CheckpointConfig;

  // Actions
  create: (name: string, options?: {
    taskId?: string;
    description?: string;
  }) => Promise<Checkpoint | null>;
  restore: (checkpointId: string) => void;
  remove: (checkpointId: string) => void;
  prune: () => number;
  clear: () => number;

  // Chain operations
  getChain: (checkpointId: string) => Checkpoint[];
  getDiff: (fromId: string, toId: string, changes: CheckpointDiff['changes']) => CheckpointDiff;

  // Auto-checkpoint
  startAuto: () => void;
  stopAuto: () => void;

  // Utilities
  formatDisplay: (checkpoint: Checkpoint) => string;
  getRelativeTime: (dateStr: string) => string;
  getStatusColor: (status: CheckpointStatus) => string;
  getStatusIcon: (status: CheckpointStatus) => string;
}

/**
 * Hook for managing checkpoints
 */
export function useCheckpoints(
  options: UseCheckpointsOptions
): UseCheckpointsReturn {
  const { projectId, autoInit = true, autoCheckpoint = false, onCreateCheckpoint } = options;

  // Subscribe to stores
  const checkpointsMap = useStore(checkpointsStore);
  const config = useStore(checkpointConfigStore);
  const activeId = useStore(activeCheckpointId);
  const isOperationInProgress = useStore(isCheckpointOperationInProgress);
  const isInitialized = useStore(checkpointInitialized);
  const error = useStore(checkpointError);
  const allCheckpoints = useStore(sortedCheckpoints);

  // Filter checkpoints for this project
  const checkpoints = useMemo(
    () => allCheckpoints.filter(c => c.projectId === projectId),
    [allCheckpoints, projectId]
  );

  const activeCheckpoint = useMemo(
    () => (activeId ? getCheckpoint(activeId) || null : null),
    [activeId, checkpointsMap]
  );

  const latestCheckpoint = useMemo(
    () => getLatestCheckpoint(projectId),
    [projectId, checkpointsMap]
  );

  // Initialize on mount if autoInit
  useEffect(() => {
    if (autoInit && !isInitialized) {
      initializeCheckpoints();
    }
  }, [autoInit, isInitialized]);

  // Create checkpoint
  const handleCreate = useCallback(
    async (
      name: string,
      opts?: { taskId?: string; description?: string }
    ): Promise<Checkpoint | null> => {
      if (!onCreateCheckpoint) {
        logger.warn('No onCreateCheckpoint handler provided');
        return null;
      }

      isCheckpointOperationInProgress.set(true);

      try {
        const checkpoint = createCheckpoint(projectId, name, {
          ...opts,
          parentCheckpointId: latestCheckpoint?.id,
        });

        updateCheckpointStatus(checkpoint.id, 'creating');

        const result = await onCreateCheckpoint();
        finalizeCheckpoint(checkpoint.id, result.commitHash, result.files);

        return getCheckpoint(checkpoint.id) || null;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        checkpointError.set(errorMsg);
        return null;
      } finally {
        isCheckpointOperationInProgress.set(false);
      }
    },
    [projectId, latestCheckpoint, onCreateCheckpoint]
  );

  // Restore checkpoint
  const handleRestore = useCallback(
    (checkpointId: string) => {
      setActiveCheckpoint(checkpointId);
    },
    []
  );

  // Remove checkpoint
  const handleRemove = useCallback(
    (checkpointId: string) => {
      deleteCheckpoint(checkpointId);
    },
    []
  );

  // Prune old checkpoints
  const handlePrune = useCallback(
    () => pruneCheckpoints(projectId),
    [projectId]
  );

  // Clear all checkpoints
  const handleClear = useCallback(
    () => clearProjectCheckpoints(projectId),
    [projectId]
  );

  // Get checkpoint chain
  const handleGetChain = useCallback(
    (checkpointId: string) => getCheckpointChain(checkpointId),
    []
  );

  // Get diff between checkpoints
  const handleGetDiff = useCallback(
    (fromId: string, toId: string, changes: CheckpointDiff['changes']) =>
      createCheckpointDiff(fromId, toId, changes),
    []
  );

  // Start auto-checkpoint
  const handleStartAuto = useCallback(() => {
    if (onCreateCheckpoint) {
      startAutoCheckpoint(projectId, async () => {
        await handleCreate('Auto-checkpoint');
      });
    }
  }, [projectId, onCreateCheckpoint, handleCreate]);

  // Stop auto-checkpoint
  const handleStopAuto = useCallback(() => {
    stopAutoCheckpoint();
  }, []);

  // Start auto-checkpoint on mount if enabled
  useEffect(() => {
    if (autoCheckpoint && onCreateCheckpoint && isInitialized) {
      handleStartAuto();
      return () => handleStopAuto();
    }
  }, [autoCheckpoint, isInitialized, onCreateCheckpoint, handleStartAuto, handleStopAuto]);

  return {
    // State
    checkpoints,
    activeCheckpoint,
    latestCheckpoint,
    isOperationInProgress,
    isInitialized,
    error,
    config,

    // Actions
    create: handleCreate,
    restore: handleRestore,
    remove: handleRemove,
    prune: handlePrune,
    clear: handleClear,

    // Chain operations
    getChain: handleGetChain,
    getDiff: handleGetDiff,

    // Auto-checkpoint
    startAuto: handleStartAuto,
    stopAuto: handleStopAuto,

    // Utilities
    formatDisplay: formatCheckpointDisplay,
    getRelativeTime,
    getStatusColor: getCheckpointStatusColor,
    getStatusIcon: getCheckpointStatusIcon,
  };
}

export default useCheckpoints;
