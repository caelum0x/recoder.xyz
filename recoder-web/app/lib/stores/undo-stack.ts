/**
 * Undo Stack Store
 * Nanostores-based reactive state for undo/redo functionality
 *
 * This provides a reactive layer on top of the undo-manager service,
 * enabling React components to subscribe to undo/redo state changes.
 */

import { atom, computed } from 'nanostores';
import * as undoManager from '~/lib/services/undo-manager';
import type { FileState, UndoAction } from '~/lib/services/undo-manager';

// ==================== STATE ATOMS ====================

/**
 * Current undo stack state - refreshed after each undo/redo operation
 */
export const undoStackState = atom<{
  aiActionHistory: UndoAction[];
  lastAIAction: UndoAction | null;
  stats: {
    totalFiles: number;
    totalStates: number;
    aiActions: number;
  };
}>({
  aiActionHistory: [],
  lastAIAction: null,
  stats: { totalFiles: 0, totalStates: 0, aiActions: 0 },
});

/**
 * Whether we're currently in an undo/redo preview mode
 */
export const isPreviewingUndo = atom<boolean>(false);

/**
 * The files that would be affected by undoing the last AI action
 */
export const undoPreviewFiles = atom<Array<{
  path: string;
  currentContent: string;
  previousContent: string;
}>>([]);

/**
 * Last undo/redo operation result for UI feedback
 */
export const lastUndoResult = atom<{
  type: 'undo' | 'redo' | null;
  filesAffected: number;
  timestamp: number;
} | null>(null);

// ==================== COMPUTED VALUES ====================

/**
 * Whether undo is available (has AI actions to undo)
 */
export const canUndoAI = computed(undoStackState, (state) => {
  return state.aiActionHistory.length > 0;
});

/**
 * Get description of what will be undone
 */
export const undoDescription = computed(undoStackState, (state) => {
  if (!state.lastAIAction) return null;

  const action = state.lastAIAction;
  const filesCount = action.files.length;
  const timeAgo = getTimeAgo(action.timestamp);

  return {
    description: action.description || 'AI changes',
    filesCount,
    timeAgo,
    files: action.files,
  };
});

// ==================== ACTIONS ====================

/**
 * Refresh undo stack state from the service
 * Call this after any undo/redo operation
 */
export function refreshUndoState(): void {
  undoStackState.set({
    aiActionHistory: undoManager.getActionHistory(),
    lastAIAction: undoManager.getLastAIAction(),
    stats: undoManager.getStats(),
  });
}

/**
 * Record a batch of AI file changes (call after AI completes)
 */
export function recordAIChanges(
  files: Array<{ path: string; content: string }>,
  description: string = 'AI changes'
): void {
  undoManager.saveBatchState(files, description);
  refreshUndoState();
}

/**
 * Undo the last AI action
 * Returns the files that need to be restored, or null if nothing to undo
 */
export async function undoLastAIAction(): Promise<Array<{ path: string; content: string }> | null> {
  const result = undoManager.undoLastAIAction();

  if (result && result.length > 0) {
    // Update feedback state
    lastUndoResult.set({
      type: 'undo',
      filesAffected: result.length,
      timestamp: Date.now(),
    });

    // Clear feedback after 3 seconds
    setTimeout(() => {
      lastUndoResult.set(null);
    }, 3000);
  }

  refreshUndoState();
  return result;
}

/**
 * Undo changes for a specific file
 */
export function undoFile(filePath: string): FileState | null {
  const result = undoManager.undo(filePath);

  if (result) {
    lastUndoResult.set({
      type: 'undo',
      filesAffected: 1,
      timestamp: Date.now(),
    });

    setTimeout(() => {
      lastUndoResult.set(null);
    }, 3000);
  }

  refreshUndoState();
  return result;
}

/**
 * Redo changes for a specific file
 */
export function redoFile(filePath: string): FileState | null {
  const result = undoManager.redo(filePath);

  if (result) {
    lastUndoResult.set({
      type: 'redo',
      filesAffected: 1,
      timestamp: Date.now(),
    });

    setTimeout(() => {
      lastUndoResult.set(null);
    }, 3000);
  }

  refreshUndoState();
  return result;
}

/**
 * Check if undo is available for a specific file
 */
export function canUndoFile(filePath: string): boolean {
  return undoManager.canUndo(filePath);
}

/**
 * Check if redo is available for a specific file
 */
export function canRedoFile(filePath: string): boolean {
  return undoManager.canRedo(filePath);
}

/**
 * Get file history for a specific file
 */
export function getFileHistory(filePath: string): FileState[] {
  return undoManager.getStateHistory(filePath);
}

/**
 * Revert a file to a specific state in history
 */
export function revertFileToState(filePath: string, stateIndex: number): FileState | null {
  const result = undoManager.revertToState(filePath, stateIndex);
  refreshUndoState();
  return result;
}

/**
 * Preview what undoing the last AI action would change
 */
export async function previewUndo(): Promise<void> {
  const lastAction = undoManager.getLastAIAction();
  if (!lastAction) {
    undoPreviewFiles.set([]);
    return;
  }

  const previews: Array<{
    path: string;
    currentContent: string;
    previousContent: string;
  }> = [];

  for (const filePath of lastAction.files) {
    const history = undoManager.getStateHistory(filePath);
    if (history.length >= 2) {
      const currentState = history[history.length - 1];
      const previousState = history[history.length - 2];
      previews.push({
        path: filePath,
        currentContent: currentState.content,
        previousContent: previousState.content,
      });
    }
  }

  undoPreviewFiles.set(previews);
  isPreviewingUndo.set(true);
}

/**
 * Clear the undo preview
 */
export function clearUndoPreview(): void {
  undoPreviewFiles.set([]);
  isPreviewingUndo.set(false);
}

/**
 * Clear all undo history
 */
export function clearAllUndoHistory(): void {
  undoManager.clearAllHistory();
  refreshUndoState();
}

// ==================== UTILITIES ====================

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const diff = now - timestamp;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Initialize state on module load
refreshUndoState();
