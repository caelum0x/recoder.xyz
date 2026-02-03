/**
 * useEditIntent Hook
 * React hook for analyzing user prompts to determine edit intent
 *
 * Features:
 * 1. Analyze user input in real-time (debounced)
 * 2. Show preview of affected files before sending
 * 3. Provide focused context to reduce token usage
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  analyzeEditIntent,
  generateFocusedContext,
  getAffectedFilesPreview,
  type EditIntent,
  EditType,
} from '~/lib/services/edit-intent';
import { loadProjectContext, type ProjectContext } from '~/lib/services/code-context';

export interface EditIntentState {
  intent: EditIntent | null;
  isAnalyzing: boolean;
  preview: {
    willModify: string[];
    mayReference: string[];
    confidence: 'high' | 'medium' | 'low';
  } | null;
  focusedContext: string;
  error: string | null;
}

interface UseEditIntentOptions {
  projectId: string;
  debounceMs?: number;
  minPromptLength?: number;
  maxContextTokens?: number;
  enabled?: boolean;
}

export function useEditIntent(options: UseEditIntentOptions) {
  const {
    projectId,
    debounceMs = 500,
    minPromptLength = 10,
    maxContextTokens = 4000,
    enabled = true,
  } = options;

  const [state, setState] = useState<EditIntentState>({
    intent: null,
    isAnalyzing: false,
    preview: null,
    focusedContext: '',
    error: null,
  });

  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPromptRef = useRef<string>('');

  // Load project context on mount and when projectId changes
  useEffect(() => {
    if (!enabled || !projectId) return;

    let cancelled = false;

    async function loadContext() {
      try {
        const context = await loadProjectContext(projectId);
        if (!cancelled) {
          setProjectContext(context);
        }
      } catch (error) {
        console.warn('[useEditIntent] Failed to load project context:', error);
      }
    }

    loadContext();

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled]);

  // Analyze a prompt and update state
  const analyzePrompt = useCallback(async (prompt: string) => {
    if (!enabled) return null;

    // Skip if prompt is too short
    if (prompt.trim().length < minPromptLength) {
      setState(prev => ({
        ...prev,
        intent: null,
        preview: null,
        focusedContext: '',
        error: null,
      }));
      return null;
    }

    setState(prev => ({ ...prev, isAnalyzing: true, error: null }));

    try {
      // Analyze the prompt
      const intent = analyzeEditIntent(prompt, projectContext);

      // Generate focused context
      const focusedContext = generateFocusedContext(intent, projectContext, maxContextTokens);

      // Get preview for UI
      const preview = getAffectedFilesPreview(intent);

      setState({
        intent,
        isAnalyzing: false,
        preview,
        focusedContext,
        error: null,
      });

      return intent;
    } catch (error: any) {
      console.error('[useEditIntent] Analysis failed:', error);
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        error: error.message || 'Analysis failed',
      }));
      return null;
    }
  }, [enabled, projectContext, minPromptLength, maxContextTokens]);

  // Debounced analysis for real-time updates
  const analyzePromptDebounced = useCallback((prompt: string) => {
    if (!enabled) return;

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    lastPromptRef.current = prompt;

    // Set analyzing state immediately for feedback
    if (prompt.trim().length >= minPromptLength) {
      setState(prev => ({ ...prev, isAnalyzing: true }));
    }

    // Debounce the actual analysis
    debounceTimerRef.current = setTimeout(() => {
      if (lastPromptRef.current === prompt) {
        analyzePrompt(prompt);
      }
    }, debounceMs);
  }, [enabled, minPromptLength, debounceMs, analyzePrompt]);

  // Clear the current analysis
  const clearAnalysis = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setState({
      intent: null,
      isAnalyzing: false,
      preview: null,
      focusedContext: '',
      error: null,
    });
  }, []);

  // Refresh project context manually
  const refreshContext = useCallback(async () => {
    if (!projectId) return;

    try {
      const context = await loadProjectContext(projectId);
      setProjectContext(context);
    } catch (error) {
      console.warn('[useEditIntent] Failed to refresh context:', error);
    }
  }, [projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    // State
    ...state,
    projectContext,

    // Actions
    analyzePrompt,
    analyzePromptDebounced,
    clearAnalysis,
    refreshContext,

    // Utilities
    isReady: !!projectContext,
    hasFiles: (projectContext?.files.size ?? 0) > 0,
  };
}

/**
 * Get a human-readable summary of the edit intent
 */
export function getIntentSummary(intent: EditIntent | null): string {
  if (!intent) return '';

  const parts: string[] = [];

  // Add intent type
  const typeLabels: Record<EditType, string> = {
    [EditType.UPDATE_COMPONENT]: 'Update Component',
    [EditType.ADD_FEATURE]: 'Add Feature',
    [EditType.FIX_ISSUE]: 'Fix Issue',
    [EditType.REFACTOR]: 'Refactor',
    [EditType.FULL_REBUILD]: 'Full Rebuild',
    [EditType.UPDATE_STYLE]: 'Update Style',
    [EditType.ADD_DEPENDENCY]: 'Add Dependency',
    [EditType.GENERAL_QUERY]: 'Question',
  };

  parts.push(typeLabels[intent.type] || intent.type);

  // Add file count
  if (intent.targetFiles.length > 0) {
    parts.push(`(${intent.targetFiles.length} file${intent.targetFiles.length > 1 ? 's' : ''})`);
  }

  // Add confidence indicator
  const confidenceIcons = {
    high: '',
    medium: '',
    low: '',
  };
  parts.push(confidenceIcons[intent.confidenceLevel]);

  return parts.join(' ');
}

/**
 * Check if intent suggests code changes (vs just a question)
 */
export function intentRequiresCodeChanges(intent: EditIntent | null): boolean {
  if (!intent) return true; // Default to assuming code changes

  return intent.type !== EditType.GENERAL_QUERY;
}
