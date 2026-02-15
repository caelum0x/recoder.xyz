/**
 * Terminal Error Detection Hook
 * Automatically detects errors from terminal output and triggers auto-fix
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
  parseTerminalErrors,
  watchTerminalForErrors,
  type AutoFixOptions,
} from '~/lib/services/auto-fix';
import { setErrors, errorsAtom, type BuildError } from '~/lib/stores/errors';
import { workbenchStore } from '~/lib/stores/workbench';

export interface UseTerminalErrorDetectionOptions {
  /** Enable automatic error detection */
  enabled?: boolean;
  /** Callback when errors are detected */
  onErrorsDetected?: (errors: BuildError[]) => void;
  /** Auto-fix options */
  autoFixOptions?: AutoFixOptions;
  /** Debounce delay in ms */
  debounceMs?: number;
}

/**
 * Hook to detect errors from terminal output
 */
export function useTerminalErrorDetection(
  options: UseTerminalErrorDetectionOptions = {}
) {
  const {
    enabled = true,
    onErrorsDetected,
    debounceMs = 1000,
  } = options;

  const terminalOutputRef = useRef<string>('');
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const projectId = useStore(workbenchStore.projectId);
  const existingErrors = useStore(errorsAtom);

  const detectErrors = useCallback(() => {
    if (!enabled || !terminalOutputRef.current) {
      return;
    }

    const output = terminalOutputRef.current;
    const detectedErrors = parseTerminalErrors(output);

    if (detectedErrors.length > 0) {
      // Merge with existing errors (avoid duplicates)
      const existingIds = new Set(existingErrors.map(e => e.id));
      const newErrors = detectedErrors.filter(e => !existingIds.has(e.id));

      if (newErrors.length > 0) {
        // Update error store
        setErrors({
          errors: [...existingErrors, ...newErrors],
          hasBlockingErrors: newErrors.some(e => e.severity === 'error'),
          devServerStatus: 'crashed',
          errorCount: existingErrors.length + newErrors.length,
          lastLogTimestamp: Date.now(),
        });

        // Call callback
        onErrorsDetected?.(newErrors);
      }
    }

    // Clear terminal output buffer
    terminalOutputRef.current = '';
  }, [enabled, existingErrors, onErrorsDetected]);

  const addTerminalOutput = useCallback((output: string) => {
    if (!enabled) return;

    terminalOutputRef.current += output;

    // Debounce error detection
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      detectErrors();
    }, debounceMs);
  }, [enabled, debounceMs, detectErrors]);

  const reset = useCallback(() => {
    terminalOutputRef.current = '';
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    addTerminalOutput,
    detectErrors,
    reset,
  };
}

/**
 * Hook to watch terminal and auto-trigger fix
 */
export function useAutoFixOnTerminalErrors(
  options: UseTerminalErrorDetectionOptions & {
    /** Callback to send fix request */
    onRequestFix?: (errors: BuildError[]) => void;
    /** Auto-trigger fix (vs just detect) */
    autoTriggerFix?: boolean;
  } = {}
) {
  const {
    onRequestFix,
    autoTriggerFix = false,
    ...detectionOptions
  } = options;

  const handleErrorsDetected = useCallback((errors: BuildError[]) => {
    if (autoTriggerFix && onRequestFix) {
      // Automatically trigger fix
      onRequestFix(errors);
    }

    // Call original callback
    detectionOptions.onErrorsDetected?.(errors);
  }, [autoTriggerFix, onRequestFix, detectionOptions]);

  return useTerminalErrorDetection({
    ...detectionOptions,
    onErrorsDetected: handleErrorsDetected,
  });
}
