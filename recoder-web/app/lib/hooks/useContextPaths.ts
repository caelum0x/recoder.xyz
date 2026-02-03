/**
 * Hook for managing context file paths for AI chat context.
 * Allows users to explicitly include specific files in the AI context.
 *
 * This hook integrates with the AI Context Manager for advanced features:
 * - Auto-context detection based on active file
 * - Smart context selection (imports, related files)
 * - Token budget management
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import {
  selectedFilesStore,
  autoDetectedFilesStore,
  aiContextSettingsStore,
  type AIContextFile,
  addSelectedFile,
  removeSelectedFile as removeFromStore,
  clearSelectedFiles,
  clearAutoDetectedFiles,
  getAllContextFiles,
  getTotalTokens,
  getBudgetUsagePercent,
  isBudgetExceeded,
} from '~/lib/stores/ai-context';
import { formatContextForPrompt } from '~/lib/services/ai-context-manager';

// Legacy atom for backward compatibility
const contextPathsAtom = atom<string[]>([]);

// Simple token estimation - ~4 chars per token for English text
function estimateTokens(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

export interface ContextFile {
  path: string;
  name: string;
  extension: string;
  tokenEstimate: number;
  content?: string;
}

export interface UseContextPathsResult {
  /** Array of selected file paths */
  contextPaths: string[];
  /** Array of context files with metadata */
  contextFiles: ContextFile[];
  /** Total estimated tokens for all context files */
  totalTokens: number;
  /** Add a file path to context */
  addContextPath: (path: string) => void;
  /** Add multiple file paths to context */
  addContextPaths: (paths: string[]) => void;
  /** Remove a file path from context */
  removeContextPath: (path: string) => void;
  /** Clear all context paths */
  clearContextPaths: () => void;
  /** Check if a file is in context */
  isInContext: (path: string) => boolean;
  /** Toggle a file in/out of context */
  toggleContextPath: (path: string) => void;
  /** Set file content for token estimation */
  setFileContent: (path: string, content: string) => void;
  /** Get formatted context for AI prompt */
  getContextForPrompt: () => string;
  /** Budget usage percentage (0-100+) */
  budgetUsagePercent: number;
  /** Whether token budget is exceeded */
  budgetExceeded: boolean;
  /** Get formatted context using AI Context Manager (includes auto-detected files) */
  getEnhancedContextForPrompt: () => string;
}

export function useContextPaths(): UseContextPathsResult {
  const contextPaths = useStore(contextPathsAtom);
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());

  // Helper to update the atom
  const setContextPaths = useCallback((updater: string[] | ((prev: string[]) => string[])) => {
    if (typeof updater === 'function') {
      contextPathsAtom.set(updater(contextPathsAtom.get()));
    } else {
      contextPathsAtom.set(updater);
    }
  }, []);

  // Add a single file path to context
  const addContextPath = useCallback((path: string) => {
    setContextPaths(prev => {
      if (prev.includes(path)) return prev;
      return [...prev, path];
    });
  }, [setContextPaths]);

  // Add multiple file paths to context
  const addContextPaths = useCallback((paths: string[]) => {
    setContextPaths(prev => {
      const newPaths = paths.filter(p => !prev.includes(p));
      if (newPaths.length === 0) return prev;
      return [...prev, ...newPaths];
    });
  }, [setContextPaths]);

  // Remove a file path from context
  const removeContextPath = useCallback((path: string) => {
    setContextPaths(prev => prev.filter(p => p !== path));
    setFileContents(prev => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }, [setContextPaths]);

  // Clear all context paths
  const clearContextPaths = useCallback(() => {
    setContextPaths([]);
    setFileContents(new Map());
  }, [setContextPaths]);

  // Check if a file is in context
  const isInContext = useCallback((path: string) => {
    return contextPaths.includes(path);
  }, [contextPaths]);

  // Toggle a file in/out of context
  const toggleContextPath = useCallback((path: string) => {
    if (contextPaths.includes(path)) {
      removeContextPath(path);
    } else {
      addContextPath(path);
    }
  }, [contextPaths, addContextPath, removeContextPath]);

  // Set file content for token estimation
  const setFileContent = useCallback((path: string, content: string) => {
    setFileContents(prev => {
      const next = new Map(prev);
      next.set(path, content);
      return next;
    });
  }, []);

  // Build context files array with metadata
  const contextFiles = useMemo((): ContextFile[] => {
    return contextPaths.map(path => {
      const name = path.split('/').pop() || path;
      const extension = name.includes('.') ? name.split('.').pop() || '' : '';
      const content = fileContents.get(path);
      const tokenEstimate = content ? estimateTokens(content) : 0;

      return {
        path,
        name,
        extension,
        tokenEstimate,
        content,
      };
    });
  }, [contextPaths, fileContents]);

  // Calculate total tokens
  const totalTokens = useMemo(() => {
    return contextFiles.reduce((sum, file) => sum + file.tokenEstimate, 0);
  }, [contextFiles]);

  // Format context for AI prompt (legacy format, only manual selections)
  const getContextForPrompt = useCallback(() => {
    if (contextFiles.length === 0) return '';

    const filesWithContent = contextFiles.filter(f => f.content);
    if (filesWithContent.length === 0) return '';

    const lines = [
      '\n\n--- USER SELECTED CONTEXT FILES ---',
      'The user has explicitly included the following files for context:',
      '',
    ];

    for (const file of filesWithContent) {
      lines.push(`### ${file.path}`);
      lines.push('```' + file.extension);
      lines.push(file.content || '');
      lines.push('```');
      lines.push('');
    }

    lines.push('--- END CONTEXT FILES ---\n');

    return lines.join('\n');
  }, [contextFiles]);

  // Get enhanced context including auto-detected files
  const getEnhancedContextForPrompt = useCallback(() => {
    // Use the AI Context Manager's formatted output
    return formatContextForPrompt();
  }, []);

  // Budget calculations
  const budgetUsagePercent = getBudgetUsagePercent();
  const budgetExceeded = isBudgetExceeded();

  return {
    contextPaths,
    contextFiles,
    totalTokens,
    addContextPath,
    addContextPaths,
    removeContextPath,
    clearContextPaths,
    isInContext,
    toggleContextPath,
    setFileContent,
    getContextForPrompt,
    budgetUsagePercent,
    budgetExceeded,
    getEnhancedContextForPrompt,
  };
}

// Export the atom for use in other components
export { contextPathsAtom };
