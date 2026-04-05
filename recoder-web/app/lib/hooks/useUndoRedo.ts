/**
 * useUndoRedo Hook
 * React hook for undo/redo functionality in the workbench
 *
 * Features:
 * - Undo/redo AI changes
 * - Preview changes before undoing
 * - Keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
 * - Visual feedback for operations
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  canUndoAI,
  undoDescription,
  undoLastAIAction,
  undoFile,
  redoFile,
  canUndoFile,
  canRedoFile,
  previewUndo,
  clearUndoPreview,
  isPreviewingUndo,
  undoPreviewFiles,
  lastUndoResult,
  refreshUndoState,
  getFileHistory,
  revertFileToState,
} from '~/lib/stores/undo-stack';
import { workbenchStore } from '~/lib/stores/workbench';
import { DOCKER_URL, withDockerCredentials } from '~/lib/services/docker-api';
import type { FileState } from '~/lib/services/undo-manager';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('UndoRedo');

interface UseUndoRedoOptions {
  /**
   * Enable keyboard shortcuts (Cmd/Ctrl+Z for undo)
   */
  enableKeyboardShortcuts?: boolean;
  /**
   * Callback when undo completes
   */
  onUndo?: (filesAffected: number) => void;
  /**
   * Callback when redo completes
   */
  onRedo?: (filesAffected: number) => void;
}

interface UndoRedoState {
  /**
   * Whether undo is available for AI actions
   */
  canUndoAI: boolean;
  /**
   * Description of what will be undone
   */
  undoInfo: {
    description: string;
    filesCount: number;
    timeAgo: string;
    files: string[];
  } | null;
  /**
   * Whether we're currently previewing an undo
   */
  isPreviewing: boolean;
  /**
   * Files that would be affected by undo (with diffs)
   */
  previewFiles: Array<{
    path: string;
    currentContent: string;
    previousContent: string;
  }>;
  /**
   * Last operation result for feedback
   */
  lastResult: {
    type: 'undo' | 'redo' | null;
    filesAffected: number;
  } | null;
  /**
   * Whether an undo operation is in progress
   */
  isUndoing: boolean;
}

interface UndoRedoActions {
  /**
   * Undo the last AI action and apply changes to files
   */
  undoAI: () => Promise<void>;
  /**
   * Undo changes for a specific file
   */
  undoForFile: (filePath: string) => Promise<FileState | null>;
  /**
   * Redo changes for a specific file
   */
  redoForFile: (filePath: string) => Promise<FileState | null>;
  /**
   * Check if undo is available for a file
   */
  canUndoForFile: (filePath: string) => boolean;
  /**
   * Check if redo is available for a file
   */
  canRedoForFile: (filePath: string) => boolean;
  /**
   * Show preview of what will be undone
   */
  showPreview: () => Promise<void>;
  /**
   * Hide undo preview
   */
  hidePreview: () => void;
  /**
   * Get history for a specific file
   */
  getHistory: (filePath: string) => FileState[];
  /**
   * Revert a file to a specific version
   */
  revertToVersion: (filePath: string, versionIndex: number) => Promise<void>;
  /**
   * Refresh undo state
   */
  refresh: () => void;
}

export function useUndoRedo(options: UseUndoRedoOptions = {}): [UndoRedoState, UndoRedoActions] {
  const { enableKeyboardShortcuts = true, onUndo, onRedo } = options;

  // Subscribe to stores
  const canUndo = useStore(canUndoAI);
  const undoInfo = useStore(undoDescription);
  const isPreviewing = useStore(isPreviewingUndo);
  const previewFiles = useStore(undoPreviewFiles);
  const result = useStore(lastUndoResult);

  const [isUndoing, setIsUndoing] = useState(false);

  // Get project ID from workbench
  const projectId = useStore(workbenchStore.projectId);

  /**
   * Write file to Docker container
   */
  const writeFileToDocker = useCallback(async (filePath: string, content: string) => {
    if (!projectId) {
      logger.warn('[useUndoRedo] No project ID available');
      return false;
    }

    // Normalize path
    let relativePath = filePath;
    if (relativePath.startsWith('/workspace/')) {
      relativePath = relativePath.substring('/workspace/'.length);
    } else if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }

    try {
      const res = await fetch(`${DOCKER_URL}/api/file/${projectId}`, withDockerCredentials({
        method: 'POST',
        body: JSON.stringify({ path: relativePath, content }),
      }));

      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        logger.error('[useUndoRedo] Failed to write file:', errData.error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('[useUndoRedo] Error writing file:', error);
      return false;
    }
  }, [projectId]);

  /**
   * Update file in workbench store
   */
  const updateWorkbenchFile = useCallback((filePath: string, content: string) => {
    const WORK_DIR = '/home/project';
    const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    const fullPath = `${WORK_DIR}/${relativePath}`;

    workbenchStore.files.setKey(fullPath, {
      type: 'file',
      content,
      isBinary: false,
    });
  }, []);

  /**
   * Undo the last AI action
   */
  const undoAI = useCallback(async () => {
    if (!canUndo || isUndoing) return;

    setIsUndoing(true);

    try {
      const revertedFiles = await undoLastAIAction();

      if (revertedFiles && revertedFiles.length > 0) {
        // Write reverted files to Docker and update workbench
        for (const file of revertedFiles) {
          await writeFileToDocker(file.path, file.content);
          updateWorkbenchFile(file.path, file.content);
        }

        // Callback
        onUndo?.(revertedFiles.length);

        // Refresh file tree
        workbenchStore.refreshFiles?.();
      }
    } catch (error) {
      logger.error('[useUndoRedo] Undo failed:', error);
    } finally {
      setIsUndoing(false);
    }
  }, [canUndo, isUndoing, writeFileToDocker, updateWorkbenchFile, onUndo]);

  /**
   * Undo for a specific file
   */
  const undoForFile = useCallback(async (filePath: string): Promise<FileState | null> => {
    const state = undoFile(filePath);

    if (state) {
      await writeFileToDocker(filePath, state.content);
      updateWorkbenchFile(filePath, state.content);
      onUndo?.(1);
    }

    return state;
  }, [writeFileToDocker, updateWorkbenchFile, onUndo]);

  /**
   * Redo for a specific file
   */
  const redoForFile = useCallback(async (filePath: string): Promise<FileState | null> => {
    const state = redoFile(filePath);

    if (state) {
      await writeFileToDocker(filePath, state.content);
      updateWorkbenchFile(filePath, state.content);
      onRedo?.(1);
    }

    return state;
  }, [writeFileToDocker, updateWorkbenchFile, onRedo]);

  /**
   * Revert file to a specific version
   */
  const revertToVersion = useCallback(async (filePath: string, versionIndex: number) => {
    const state = revertFileToState(filePath, versionIndex);

    if (state) {
      await writeFileToDocker(filePath, state.content);
      updateWorkbenchFile(filePath, state.content);
      onUndo?.(1);
    }
  }, [writeFileToDocker, updateWorkbenchFile, onUndo]);

  // Setup keyboard shortcuts
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        // Don't intercept if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        e.preventDefault();
        undoAI();
      }

      // Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y for redo
      // Note: We don't have a global redo for AI actions, but could add later
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcuts, undoAI]);

  // Refresh state on mount
  useEffect(() => {
    refreshUndoState();
  }, []);

  const state: UndoRedoState = {
    canUndoAI: canUndo,
    undoInfo,
    isPreviewing,
    previewFiles,
    lastResult: result ? { type: result.type, filesAffected: result.filesAffected } : null,
    isUndoing,
  };

  const actions: UndoRedoActions = {
    undoAI,
    undoForFile,
    redoForFile,
    canUndoForFile: canUndoFile,
    canRedoForFile: canRedoFile,
    showPreview: previewUndo,
    hidePreview: clearUndoPreview,
    getHistory: getFileHistory,
    revertToVersion,
    refresh: refreshUndoState,
  };

  return [state, actions];
}

export default useUndoRedo;
