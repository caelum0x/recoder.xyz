/**
 * useGenerationPolling Hook
 * Polls for generation status updates with exponential backoff
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type {
  Generation,
  GenerationId,
  CompletedGeneration,
  FailedGeneration,
  CancelledGeneration,
  RunningGeneration,
} from './types';
import {
  isCompletedGeneration,
  isFailedGeneration,
  isCancelledGeneration,
  isRunningGeneration,
} from './types';
import {
  $generationsById,
  updateGeneration,
  getGeneration,
} from './generation-store';
import {
  waitAndGetGenerationCompleted,
  waitAndGetGenerationRunning,
  withRetry,
} from './helpers';

// ============================================================
// Types
// ============================================================

export interface GenerationPollingCallbacks {
  /** Called when generation starts running */
  onStart?: (generation: RunningGeneration) => void;
  /** Called when generation completes */
  onComplete?: (generation: CompletedGeneration) => void;
  /** Called when generation fails */
  onFail?: (generation: FailedGeneration) => void;
  /** Called when generation is cancelled */
  onCancel?: (generation: CancelledGeneration) => void;
  /** Called for progress updates */
  onProgress?: (generation: Generation) => void;
}

export interface UseGenerationPollingOptions {
  /** Initial polling interval (ms) */
  initialInterval?: number;
  /** Maximum polling interval (ms) */
  maxInterval?: number;
  /** Maximum polling attempts before timing out */
  maxAttempts?: number;
  /** Whether to use exponential backoff */
  exponentialBackoff?: boolean;
  /** Auto-start polling when generationId changes */
  autoStart?: boolean;
  /** API endpoint for fetching generation */
  endpoint?: string;
}

export interface UseGenerationPollingResult {
  /** Whether polling is active */
  isPolling: boolean;
  /** Current generation state */
  generation: Generation | null;
  /** Current error if any */
  error: Error | null;
  /** Progress (0-1 based on attempts) */
  progress: number;
  /** Start polling for a generation */
  startPolling: (generationId: GenerationId) => Promise<Generation | null>;
  /** Stop polling */
  stopPolling: () => void;
  /** Wait for generation to complete */
  waitForCompletion: (
    generationId: GenerationId
  ) => Promise<CompletedGeneration | null>;
  /** Wait for generation to start running */
  waitForRunning: (
    generationId: GenerationId
  ) => Promise<RunningGeneration | null>;
}

// ============================================================
// Hook Implementation
// ============================================================

export function useGenerationPolling(
  options: UseGenerationPollingOptions = {},
  callbacks: GenerationPollingCallbacks = {}
): UseGenerationPollingResult {
  const {
    initialInterval = 1000,
    maxInterval = 30000,
    maxAttempts = 60,
    exponentialBackoff = true,
    autoStart = false,
    endpoint = '/api/generation',
  } = options;

  const { onStart, onComplete, onFail, onCancel, onProgress } = callbacks;

  const generationsById = useStore($generationsById);

  const [isPolling, setIsPolling] = useState(false);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  // Refs for cleanup and state tracking
  const pollingRef = useRef(false);
  const abortRef = useRef(false);
  const currentIdRef = useRef<GenerationId | null>(null);
  const attemptRef = useRef(0);
  const intervalRef = useRef(initialInterval);
  const previousStatusRef = useRef<Generation['status'] | null>(null);

  /**
   * Fetch generation from server
   */
  const fetchGeneration = useCallback(
    async (generationId: GenerationId): Promise<Generation | undefined> => {
      // First check local store
      const local = generationsById[generationId];
      if (
        local &&
        (isCompletedGeneration(local) ||
          isFailedGeneration(local) ||
          isCancelledGeneration(local))
      ) {
        return local;
      }

      // Fetch from server
      try {
        const response = await fetch(`${endpoint}/${generationId}`);
        if (!response.ok) {
          if (response.status === 404) {
            return undefined;
          }
          throw new Error(`Failed to fetch generation: ${response.status}`);
        }
        const data = (await response.json()) as Record<string, any>;
        return data.generation;
      } catch (err) {
        console.error('Error fetching generation:', err);
        // Return local copy if available
        return local;
      }
    },
    [generationsById, endpoint]
  );

  /**
   * Handle status transitions and callbacks
   */
  const handleStatusChange = useCallback(
    (gen: Generation): void => {
      const prevStatus = previousStatusRef.current;
      const newStatus = gen.status;

      if (prevStatus === newStatus) {
        onProgress?.(gen);
        return;
      }

      previousStatusRef.current = newStatus;

      switch (newStatus) {
        case 'running':
          if (isRunningGeneration(gen)) {
            onStart?.(gen);
          }
          break;
        case 'completed':
          if (isCompletedGeneration(gen)) {
            onComplete?.(gen);
          }
          break;
        case 'failed':
          if (isFailedGeneration(gen)) {
            onFail?.(gen);
          }
          break;
        case 'cancelled':
          if (isCancelledGeneration(gen)) {
            onCancel?.(gen);
          }
          break;
      }

      onProgress?.(gen);
    },
    [onStart, onComplete, onFail, onCancel, onProgress]
  );

  /**
   * Calculate next polling interval
   */
  const getNextInterval = useCallback((): number => {
    if (!exponentialBackoff) {
      return initialInterval;
    }
    const next = intervalRef.current * 1.5;
    intervalRef.current = Math.min(next, maxInterval);
    return intervalRef.current;
  }, [exponentialBackoff, initialInterval, maxInterval]);

  /**
   * Reset polling state
   */
  const resetState = useCallback((): void => {
    attemptRef.current = 0;
    intervalRef.current = initialInterval;
    previousStatusRef.current = null;
    setProgress(0);
  }, [initialInterval]);

  /**
   * Poll loop
   */
  const poll = useCallback(
    async (generationId: GenerationId): Promise<Generation | null> => {
      while (pollingRef.current && !abortRef.current) {
        attemptRef.current++;
        setProgress(Math.min(attemptRef.current / maxAttempts, 1));

        if (attemptRef.current > maxAttempts) {
          const timeoutError = new Error(
            `Polling timed out after ${maxAttempts} attempts`
          );
          setError(timeoutError);
          setIsPolling(false);
          pollingRef.current = false;
          return null;
        }

        try {
          const gen = await fetchGeneration(generationId);

          if (!gen) {
            await new Promise((r) => setTimeout(r, getNextInterval()));
            continue;
          }

          // Update local store
          updateGeneration(gen);
          setGeneration(gen);
          handleStatusChange(gen);

          // Check for terminal states
          if (
            isCompletedGeneration(gen) ||
            isFailedGeneration(gen) ||
            isCancelledGeneration(gen)
          ) {
            setIsPolling(false);
            pollingRef.current = false;
            return gen;
          }

          await new Promise((r) => setTimeout(r, getNextInterval()));
        } catch (err) {
          console.error('Polling error:', err);
          // Continue polling on transient errors
          await new Promise((r) => setTimeout(r, getNextInterval()));
        }
      }

      return generation;
    },
    [fetchGeneration, getNextInterval, handleStatusChange, maxAttempts, generation]
  );

  /**
   * Start polling for a generation
   */
  const startPolling = useCallback(
    async (generationId: GenerationId): Promise<Generation | null> => {
      // Stop any existing polling
      pollingRef.current = false;
      abortRef.current = true;
      await new Promise((r) => setTimeout(r, 100));

      // Reset state
      resetState();
      abortRef.current = false;
      pollingRef.current = true;
      currentIdRef.current = generationId;
      setIsPolling(true);
      setError(null);
      setGeneration(null);

      // Check if already in store with terminal state
      const existing = getGeneration(generationId);
      if (existing) {
        if (
          isCompletedGeneration(existing) ||
          isFailedGeneration(existing) ||
          isCancelledGeneration(existing)
        ) {
          setGeneration(existing);
          handleStatusChange(existing);
          setIsPolling(false);
          return existing;
        }
        setGeneration(existing);
        handleStatusChange(existing);
      }

      return poll(generationId);
    },
    [resetState, handleStatusChange, poll]
  );

  /**
   * Stop polling
   */
  const stopPolling = useCallback((): void => {
    pollingRef.current = false;
    abortRef.current = true;
    setIsPolling(false);
  }, []);

  /**
   * Wait for generation to complete
   */
  const waitForCompletion = useCallback(
    async (generationId: GenerationId): Promise<CompletedGeneration | null> => {
      try {
        const result = await withRetry(
          () =>
            waitAndGetGenerationCompleted(fetchGeneration, generationId, {
              initialInterval,
              maxAttempts,
              onProgress: (attempt, max) => setProgress(attempt / max),
            }),
          { maxRetries: 2 }
        );
        updateGeneration(result);
        setGeneration(result);
        handleStatusChange(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      }
    },
    [fetchGeneration, initialInterval, maxAttempts, handleStatusChange]
  );

  /**
   * Wait for generation to start running
   */
  const waitForRunning = useCallback(
    async (generationId: GenerationId): Promise<RunningGeneration | null> => {
      try {
        const result = await withRetry(
          () =>
            waitAndGetGenerationRunning(fetchGeneration, generationId, {
              initialInterval,
              maxAttempts: Math.floor(maxAttempts / 2),
              onProgress: (attempt, max) => setProgress(attempt / max),
            }),
          { maxRetries: 2 }
        );
        updateGeneration(result);
        setGeneration(result);
        handleStatusChange(result);
        return isRunningGeneration(result) ? result : null;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      }
    },
    [fetchGeneration, initialInterval, maxAttempts, handleStatusChange]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false;
      abortRef.current = true;
    };
  }, []);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && currentIdRef.current && !isPolling) {
      startPolling(currentIdRef.current);
    }
  }, [autoStart, isPolling, startPolling]);

  return {
    isPolling,
    generation,
    error,
    progress,
    startPolling,
    stopPolling,
    waitForCompletion,
    waitForRunning,
  };
}
