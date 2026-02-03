/**
 * useAdvancedCoding Hook
 * Provides access to advanced coding features for components
 *
 * Features:
 * - Code context awareness
 * - Smart file selection
 * - Error analysis
 * - Diff preview
 * - Undo/redo
 */

import { useState, useCallback, useEffect } from 'react';
import { workbenchStore } from '~/lib/stores/workbench';
import type { ProjectContext, RelatedFiles } from '~/lib/services/code-context';
import type { ParsedError } from '~/lib/services/error-analyzer';
import type { FileDiff, PendingChange } from '~/lib/services/diff-preview';
import type { FileState, UndoAction } from '~/lib/services/undo-manager';

export interface UseAdvancedCodingOptions {
  projectId?: string;
  autoLoadContext?: boolean;
}

export function useAdvancedCoding(options: UseAdvancedCodingOptions = {}) {
  const { autoLoadContext = false } = options;

  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [errors, setErrors] = useState<ParsedError[]>([]);

  // Load project context
  const loadContext = useCallback(async () => {
    setIsLoadingContext(true);
    try {
      const context = await workbenchStore.loadProjectContext();
      setProjectContext(context);
      return context;
    } catch (error) {
      console.error('Failed to load project context:', error);
      return null;
    } finally {
      setIsLoadingContext(false);
    }
  }, []);

  // Auto-load context if enabled
  useEffect(() => {
    if (autoLoadContext) {
      loadContext();
    }
  }, [autoLoadContext, loadContext]);

  // Get smart file selection based on user message
  const getSmartFileSelection = useCallback(async (userMessage: string): Promise<string[]> => {
    return workbenchStore.getSmartFileSelection(userMessage);
  }, []);

  // Find related files
  const findRelatedFiles = useCallback(async (filePath: string): Promise<RelatedFiles | null> => {
    return workbenchStore.findRelatedFiles(filePath);
  }, []);

  // Read file content
  const readFile = useCallback(async (filePath: string): Promise<string | null> => {
    return workbenchStore.readFileContent(filePath);
  }, []);

  // Read multiple files
  const readFiles = useCallback(async (filePaths: string[]): Promise<Map<string, string>> => {
    return workbenchStore.readMultipleFiles(filePaths);
  }, []);

  // Analyze errors
  const analyzeErrors = useCallback(async (terminalOutput: string) => {
    const result = await workbenchStore.analyzeErrors(terminalOutput);
    setErrors(result.errors);
    return result;
  }, []);

  // Generate fix prompt for an error
  const generateFixPrompt = useCallback(async (error: ParsedError): Promise<string> => {
    return workbenchStore.generateFixPrompt(error);
  }, []);

  // Create diagnostic report
  const createDiagnosticReport = useCallback(async (): Promise<string> => {
    return workbenchStore.createDiagnosticReport(errors);
  }, [errors]);

  // Diff preview functions
  const addPendingChange = useCallback((
    filePath: string,
    oldContent: string,
    newContent: string,
    description?: string
  ): PendingChange => {
    const change = workbenchStore.addPendingChange(filePath, oldContent, newContent, description);
    setPendingChanges(workbenchStore.getPendingChanges());
    return change;
  }, []);

  const acceptChange = useCallback((changeId: string) => {
    const result = workbenchStore.acceptChange(changeId);
    setPendingChanges(workbenchStore.getPendingChanges());
    return result;
  }, []);

  const rejectChange = useCallback((changeId: string) => {
    const result = workbenchStore.rejectChange(changeId);
    setPendingChanges(workbenchStore.getPendingChanges());
    return result;
  }, []);

  const acceptPartialChange = useCallback((changeId: string, hunkIds: string[]) => {
    const result = workbenchStore.acceptPartialChange(changeId, hunkIds);
    setPendingChanges(workbenchStore.getPendingChanges());
    return result;
  }, []);

  // Undo/redo functions
  const undoFile = useCallback((filePath: string): FileState | null => {
    return workbenchStore.undoFile(filePath);
  }, []);

  const redoFile = useCallback((filePath: string): FileState | null => {
    return workbenchStore.redoFile(filePath);
  }, []);

  const canUndo = useCallback((filePath: string): boolean => {
    return workbenchStore.canUndo(filePath);
  }, []);

  const canRedo = useCallback((filePath: string): boolean => {
    return workbenchStore.canRedo(filePath);
  }, []);

  const undoLastAIAction = useCallback((): Array<{ path: string; content: string }> | null => {
    return workbenchStore.undoLastAIAction();
  }, []);

  const getUndoHistory = useCallback((filePath: string): FileState[] => {
    return workbenchStore.getUndoHistory(filePath);
  }, []);

  const getAIActionHistory = useCallback((): UndoAction[] => {
    return workbenchStore.getAIActionHistory();
  }, []);

  // Generate context prompt for AI
  const generateContextPrompt = useCallback(async (userMessage: string, maxTokens: number = 4000): Promise<string> => {
    if (!projectContext) {
      await loadContext();
    }
    const { generateContextPrompt: genPrompt } = await import('~/lib/services/code-context');
    return genPrompt(projectContext, userMessage, maxTokens);
  }, [projectContext, loadContext]);

  // Clear all errors
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    // Context
    projectContext,
    isLoadingContext,
    loadContext,
    generateContextPrompt,

    // Smart selection
    getSmartFileSelection,
    findRelatedFiles,

    // File operations
    readFile,
    readFiles,

    // Error handling
    errors,
    analyzeErrors,
    generateFixPrompt,
    createDiagnosticReport,
    clearErrors,

    // Diff preview
    pendingChanges,
    addPendingChange,
    acceptChange,
    rejectChange,
    acceptPartialChange,

    // Undo/redo
    undoFile,
    redoFile,
    canUndo,
    canRedo,
    undoLastAIAction,
    getUndoHistory,
    getAIActionHistory,
  };
}

/**
 * Hook for file-specific undo/redo
 */
export function useFileUndo(filePath: string) {
  const [history, setHistory] = useState<FileState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const refreshHistory = useCallback(() => {
    const h = workbenchStore.getUndoHistory(filePath);
    setHistory(h);
    setCurrentIndex(h.length - 1);
  }, [filePath]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const undo = useCallback(() => {
    const state = workbenchStore.undoFile(filePath);
    if (state) {
      refreshHistory();
    }
    return state;
  }, [filePath, refreshHistory]);

  const redo = useCallback(() => {
    const state = workbenchStore.redoFile(filePath);
    if (state) {
      refreshHistory();
    }
    return state;
  }, [filePath, refreshHistory]);

  return {
    history,
    currentIndex,
    canUndo: workbenchStore.canUndo(filePath),
    canRedo: workbenchStore.canRedo(filePath),
    undo,
    redo,
    refreshHistory,
  };
}

/**
 * Hook for error analysis with auto-parse
 */
export function useErrorAnalysis() {
  const [errors, setErrors] = useState<ParsedError[]>([]);
  const [hasErrors, setHasErrors] = useState(false);
  const [autoFixAvailable, setAutoFixAvailable] = useState(false);
  const [summary, setSummary] = useState('');

  const analyze = useCallback(async (terminalOutput: string) => {
    const result = await workbenchStore.analyzeErrors(terminalOutput);
    setErrors(result.errors);
    setHasErrors(result.hasErrors);
    setAutoFixAvailable(result.autoFixAvailable);
    setSummary(result.summary);
    return result;
  }, []);

  const getFixPrompt = useCallback(async (error: ParsedError): Promise<string> => {
    return workbenchStore.generateFixPrompt(error);
  }, []);

  const clear = useCallback(() => {
    setErrors([]);
    setHasErrors(false);
    setAutoFixAvailable(false);
    setSummary('');
  }, []);

  return {
    errors,
    hasErrors,
    autoFixAvailable,
    summary,
    analyze,
    getFixPrompt,
    clear,
  };
}

export default useAdvancedCoding;
