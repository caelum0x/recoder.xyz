/**
 * useNodeGenerations Hook
 * Manages generations for a specific node with SWR-like caching
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type {
  Generation,
  GenerationId,
  NodeId,
  GenerationOrigin,
  GenerationContext,
  CreatedGeneration,
  QueuedGeneration,
  CancelledGeneration,
} from './types';
import {
  generateGenerationId,
  isRunningGeneration,
  isQueuedGeneration,
  isCreatedGeneration,
} from './types';
import {
  $generations,
  addGenerations,
  updateGeneration,
  getGenerationsForNode,
} from './generation-store';
import { useGenerationPolling } from './useGenerationPolling';

// ============================================================
// Types
// ============================================================

export interface CreateGenerationOptions {
  onCreated?: (generation: CreatedGeneration) => void;
  onQueued?: (generation: QueuedGeneration) => void;
  onStarted?: (generation: Generation) => void;
  onCompleted?: (generation: Generation) => void;
  onFailed?: (generation: Generation) => void;
  onCancelled?: (generation: CancelledGeneration) => void;
  onMessagesUpdated?: (generation: Generation) => void;
}

export interface UseNodeGenerationsOptions {
  /** Auto-fetch generations on mount */
  autoFetch?: boolean;
  /** Revalidate on focus */
  revalidateOnFocus?: boolean;
  /** Revalidate on reconnect */
  revalidateOnReconnect?: boolean;
}

export interface UseNodeGenerationsResult {
  /** All generations for this node */
  generations: Generation[];
  /** Most recent generation */
  currentGeneration: Generation | undefined;
  /** Whether currently generating */
  isGenerating: boolean;
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Error from fetching */
  error: Error | null;
  /** Create a new generation */
  createGeneration: (
    context: GenerationContext,
    options?: CreateGenerationOptions
  ) => CreatedGeneration;
  /** Start a created generation */
  startGeneration: (
    generationId: GenerationId,
    options?: CreateGenerationOptions
  ) => Promise<void>;
  /** Create and immediately start a generation */
  createAndStartGeneration: (
    context: GenerationContext,
    options?: CreateGenerationOptions
  ) => Promise<void>;
  /** Stop the current generation */
  stopGeneration: () => Promise<void>;
  /** Refresh generations from server */
  refresh: () => Promise<void>;
}

// ============================================================
// Fetch generations for a node from API
// ============================================================

async function fetchNodeGenerations(
  nodeId: NodeId,
  origin: GenerationOrigin
): Promise<Generation[]> {
  try {
    const params = new URLSearchParams({
      nodeId,
      originType: origin.type,
    });

    if (origin.workspaceId) {
      params.set('workspaceId', origin.workspaceId);
    }
    if (origin.taskId) {
      params.set('taskId', origin.taskId);
    }

    const response = await fetch(`/api/generations?${params}`);

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch generations: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, any>;
    return data.generations || [];
  } catch (err) {
    console.error('Error fetching node generations:', err);
    return [];
  }
}

// ============================================================
// Hook Implementation
// ============================================================

export function useNodeGenerations(
  nodeId: NodeId,
  origin: GenerationOrigin,
  options: UseNodeGenerationsOptions = {}
): UseNodeGenerationsResult {
  const {
    autoFetch = true,
    revalidateOnFocus = false,
    revalidateOnReconnect = false,
  } = options;

  const allGenerations = useStore($generations);

  const [isLoading, setIsLoading] = useState(autoFetch);
  const [error, setError] = useState<Error | null>(null);

  const fetchedRef = useRef(false);
  const currentGenerationIdRef = useRef<GenerationId | null>(null);

  // Use polling for status updates
  const { startPolling, stopPolling: stopPollingHook } = useGenerationPolling();

  /**
   * Filter generations for this specific node and origin
   */
  const generations = useMemo(() => {
    return allGenerations.filter((gen) => {
      if (gen.context.operationNode.id !== nodeId) {
        return false;
      }

      // Skip cancelled generations
      if (gen.status === 'cancelled') {
        return false;
      }

      // Match origin
      if (gen.context.origin.type !== origin.type) {
        return false;
      }

      if (origin.type === 'studio' && gen.context.origin.type === 'studio') {
        return gen.context.origin.workspaceId === origin.workspaceId;
      }

      if (origin.type === 'task' && gen.context.origin.type === 'task') {
        return gen.context.origin.taskId === origin.taskId;
      }

      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }, [allGenerations, nodeId, origin]);

  /**
   * Get the most recent generation
   */
  const currentGeneration = useMemo(() => {
    return generations[0];
  }, [generations]);

  /**
   * Check if currently generating
   */
  const isGenerating = useMemo(() => {
    return (
      currentGeneration?.status === 'running' ||
      currentGeneration?.status === 'created' ||
      currentGeneration?.status === 'queued'
    );
  }, [currentGeneration]);

  /**
   * Fetch generations from server
   */
  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const serverGenerations = await fetchNodeGenerations(nodeId, origin);

      if (serverGenerations.length > 0) {
        // Only add the most recent generation to avoid duplicates
        const sorted = serverGenerations.sort(
          (a, b) => b.createdAt - a.createdAt
        );
        addGenerations(sorted[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [nodeId, origin]);

  /**
   * Create a new generation
   */
  const createGeneration = useCallback(
    (
      context: GenerationContext,
      options?: CreateGenerationOptions
    ): CreatedGeneration => {
      const generationId = generateGenerationId();
      const created: CreatedGeneration = {
        id: generationId,
        context,
        status: 'created',
        createdAt: Date.now(),
      };

      addGenerations(created);
      currentGenerationIdRef.current = generationId;
      options?.onCreated?.(created);

      return created;
    },
    []
  );

  /**
   * Start a created generation
   */
  const startGeneration = useCallback(
    async (
      generationId: GenerationId,
      options?: CreateGenerationOptions
    ): Promise<void> => {
      const generation = allGenerations.find((g) => g.id === generationId);

      if (!generation || !isCreatedGeneration(generation)) {
        console.warn(
          `Cannot start generation ${generationId}: not in created state`
        );
        return;
      }

      // Transition to queued
      const queued: QueuedGeneration = {
        ...generation,
        status: 'queued',
        queuedAt: Date.now(),
      };
      updateGeneration(queued);
      options?.onQueued?.(queued);

      // Start the generation on the server
      try {
        const response = await fetch('/api/generation/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ generation: queued }),
        });

        if (!response.ok) {
          throw new Error(`Failed to start generation: ${response.status}`);
        }

        const data = (await response.json()) as Record<string, any>;
        if (data.generation) {
          updateGeneration(data.generation);
          options?.onStarted?.(data.generation);
        }

        // Start polling for updates
        startPolling(generationId);
      } catch (err) {
        console.error('Error starting generation:', err);
        // Update to failed state
        updateGeneration({
          ...queued,
          status: 'failed',
          startedAt: Date.now(),
          failedAt: Date.now(),
          messages: [],
          error: {
            name: 'StartError',
            message: err instanceof Error ? err.message : String(err),
          },
        } as Generation);
      }
    },
    [allGenerations, startPolling]
  );

  /**
   * Create and start a generation in one call
   */
  const createAndStartGeneration = useCallback(
    async (
      context: GenerationContext,
      options?: CreateGenerationOptions
    ): Promise<void> => {
      const created = createGeneration(context, options);
      await startGeneration(created.id, options);
    },
    [createGeneration, startGeneration]
  );

  /**
   * Stop the current generation
   */
  const stopGeneration = useCallback(async (): Promise<void> => {
    if (!currentGeneration) {
      return;
    }

    stopPollingHook();

    const cancelled: CancelledGeneration = {
      ...currentGeneration,
      status: 'cancelled',
      cancelledAt: Date.now(),
    };
    updateGeneration(cancelled);

    // Notify server
    if (
      isRunningGeneration(currentGeneration) ||
      isQueuedGeneration(currentGeneration)
    ) {
      try {
        await fetch('/api/generation/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ generationId: currentGeneration.id }),
        });
      } catch (err) {
        console.error('Error cancelling generation on server:', err);
      }
    }
  }, [currentGeneration, stopPollingHook]);

  // Initial fetch
  useEffect(() => {
    if (autoFetch && !fetchedRef.current) {
      fetchedRef.current = true;
      refresh();
    }
  }, [autoFetch, refresh]);

  // Revalidate on focus
  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = (): void => {
      refresh();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [revalidateOnFocus, refresh]);

  // Revalidate on reconnect
  useEffect(() => {
    if (!revalidateOnReconnect) return;

    const handleOnline = (): void => {
      refresh();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [revalidateOnReconnect, refresh]);

  return {
    generations,
    currentGeneration,
    isGenerating,
    isLoading,
    error,
    createGeneration,
    startGeneration,
    createAndStartGeneration,
    stopGeneration,
    refresh,
  };
}
