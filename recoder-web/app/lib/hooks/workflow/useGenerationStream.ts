/**
 * useGenerationStream Hook
 * Handles real-time streaming of generation responses via SSE or fetch streaming
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type {
  Generation,
  GenerationId,
  UIMessage,
  RunningGeneration,
  CompletedGeneration,
  FailedGeneration,
} from './types';
import { isStreamEndChunk, isRunningGeneration } from './types';
import {
  $generationsById,
  updateGeneration,
  upsertGenerationMessage,
  addStopHandler,
  removeStopHandler,
} from './generation-store';
import { $streamingEnabled, $batchProcessingEnabled } from './feature-flags-store';
import { createBatchProcessor, withTimeout } from './helpers';

// ============================================================
// Types
// ============================================================

export interface GenerationStreamCallbacks {
  /** Called when generation starts running */
  onStart?: (generation: RunningGeneration) => void;
  /** Called for each streamed message */
  onMessage?: (message: UIMessage) => void;
  /** Called when generation completes successfully */
  onComplete?: (generation: CompletedGeneration) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when stream is aborted */
  onAbort?: () => void;
}

export interface UseGenerationStreamOptions {
  /** Polling interval when not streaming (ms) */
  pollingInterval?: number;
  /** Request timeout (ms) */
  timeout?: number;
  /** Maximum retries on connection failure */
  maxRetries?: number;
  /** Enable batch message updates for performance */
  batchUpdates?: boolean;
  /** API endpoint for streaming */
  endpoint?: string;
}

export interface UseGenerationStreamResult {
  /** Whether the stream is currently connected */
  isStreaming: boolean;
  /** Current error if any */
  error: Error | null;
  /** Start streaming a generation */
  startStream: (generationId: GenerationId) => Promise<void>;
  /** Stop the current stream */
  stopStream: () => void;
  /** Current messages being streamed */
  messages: UIMessage[];
  /** Current generation being streamed */
  currentGenerationId: GenerationId | null;
}

// ============================================================
// Hook Implementation
// ============================================================

export function useGenerationStream(
  options: UseGenerationStreamOptions = {},
  callbacks: GenerationStreamCallbacks = {}
): UseGenerationStreamResult {
  const {
    pollingInterval = 5000,
    timeout = 60000,
    maxRetries = 3,
    batchUpdates: batchUpdatesOption,
    endpoint = '/api/generation/stream',
  } = options;

  const { onStart, onMessage, onComplete, onError, onAbort } = callbacks;

  // Feature flags
  const streamingEnabled = useStore($streamingEnabled);
  const batchProcessingEnabled = useStore($batchProcessingEnabled);
  const generationsById = useStore($generationsById);

  // Use option if provided, otherwise use feature flag
  const batchUpdates = batchUpdatesOption ?? batchProcessingEnabled;

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);

  // Refs for cleanup and state management
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentGenerationIdRef = useRef<GenerationId | null>(null);
  const retriesRef = useRef(0);
  const batchProcessorRef = useRef<ReturnType<
    typeof createBatchProcessor<UIMessage>
  > | null>(null);

  // Initialize batch processor
  useEffect(() => {
    if (batchUpdates) {
      batchProcessorRef.current = createBatchProcessor<UIMessage>(
        (items) => {
          const genId = currentGenerationIdRef.current;
          if (genId) {
            for (const msg of items) {
              upsertGenerationMessage(genId, msg);
              onMessage?.(msg);
            }
            setMessages((prev) => {
              const msgMap = new Map(prev.map((m) => [m.id, m]));
              for (const msg of items) {
                msgMap.set(msg.id, msg);
              }
              return Array.from(msgMap.values());
            });
          }
        },
        { maxBatchSize: 50 }
      );
    }

    return () => {
      batchProcessorRef.current?.clear();
    };
  }, [batchUpdates, onMessage]);

  /**
   * Process incoming stream chunks
   */
  const processChunk = useCallback(
    (chunk: unknown): 'continue' | 'finish' | 'abort' | 'error' => {
      if (isStreamEndChunk(chunk)) {
        return chunk.type === 'error' ? 'error' : chunk.type;
      }

      // Handle message chunks (Vercel AI SDK format)
      if (typeof chunk === 'object' && chunk !== null) {
        const typedChunk = chunk as Record<string, unknown>;

        // UIMessage chunk
        if (
          'id' in typedChunk &&
          'role' in typedChunk &&
          typeof typedChunk.id === 'string' &&
          typeof typedChunk.role === 'string'
        ) {
          const message: UIMessage = {
            id: typedChunk.id,
            role: typedChunk.role as UIMessage['role'],
            content:
              typeof typedChunk.content === 'string' ? typedChunk.content : '',
            parts: Array.isArray(typedChunk.parts)
              ? (typedChunk.parts as UIMessage['parts'])
              : undefined,
            createdAt:
              typedChunk.createdAt instanceof Date
                ? typedChunk.createdAt
                : undefined,
          };

          if (batchUpdates && batchProcessorRef.current) {
            batchProcessorRef.current.add(message);
          } else {
            const genId = currentGenerationIdRef.current;
            if (genId) {
              upsertGenerationMessage(genId, message);
              onMessage?.(message);
              setMessages((prev) => {
                const idx = prev.findIndex((m) => m.id === message.id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = message;
                  return updated;
                }
                return [...prev, message];
              });
            }
          }
        }
      }

      return 'continue';
    },
    [batchUpdates, onMessage]
  );

  /**
   * Handle stream completion
   */
  const handleStreamComplete = useCallback(
    (generationId: GenerationId, isAbort: boolean, isError: boolean) => {
      // Flush any pending batch updates
      batchProcessorRef.current?.flush();

      const generation = generationsById[generationId];

      if (isAbort) {
        onAbort?.();
      } else if (isError) {
        const err = new Error('Stream ended with error');
        setError(err);
        onError?.(err);
      } else if (generation && generation.status === 'running') {
        const completed: CompletedGeneration = {
          ...generation,
          status: 'completed',
          completedAt: Date.now(),
        };
        updateGeneration(completed);
        onComplete?.(completed);
      }

      setIsStreaming(false);
      removeStopHandler(generationId);
      currentGenerationIdRef.current = null;
    },
    [generationsById, onAbort, onComplete, onError]
  );

  /**
   * Fetch and process stream via SSE/fetch
   */
  const fetchStream = useCallback(
    async (generationId: GenerationId): Promise<void> => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Register stop handler
      addStopHandler(generationId, () => {
        controller.abort();
      });

      try {
        const response = await withTimeout(
          fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ generationId }),
            signal: controller.signal,
          }),
          timeout,
          'Stream request timed out'
        );

        if (!response.ok) {
          throw new Error(`Stream request failed: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();

        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();

          if (done || controller.signal.aborted) {
            break;
          }

          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;

            try {
              const json = JSON.parse(line.slice(5).trim());
              const result = processChunk(json);

              if (result !== 'continue') {
                handleStreamComplete(
                  generationId,
                  result === 'abort',
                  result === 'error'
                );
                await reader.cancel();
                return;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        handleStreamComplete(generationId, controller.signal.aborted, false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          handleStreamComplete(generationId, true, false);
          return;
        }

        // Retry logic
        if (retriesRef.current < maxRetries) {
          retriesRef.current++;
          await new Promise((r) =>
            setTimeout(r, 1000 * Math.pow(2, retriesRef.current - 1))
          );
          return fetchStream(generationId);
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);
        setIsStreaming(false);
        removeStopHandler(generationId);
      }
    },
    [endpoint, timeout, maxRetries, processChunk, handleStreamComplete, onError]
  );

  /**
   * Poll for generation updates (fallback when streaming disabled)
   */
  const pollForUpdates = useCallback(
    async (generationId: GenerationId): Promise<void> => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      addStopHandler(generationId, () => {
        controller.abort();
      });

      try {
        while (!controller.signal.aborted) {
          try {
            const response = await fetch(`/api/generation/${generationId}`);
            if (!response.ok) {
              await new Promise((r) => setTimeout(r, pollingInterval));
              continue;
            }

            const data = (await response.json()) as Record<string, any>;
            const generation = data.generation as Generation | undefined;

            if (!generation) {
              await new Promise((r) => setTimeout(r, pollingInterval));
              continue;
            }

            updateGeneration(generation);

            if (isRunningGeneration(generation)) {
              setMessages(generation.messages);
              for (const msg of generation.messages) {
                onMessage?.(msg);
              }
            }

            if (
              generation.status === 'completed' ||
              generation.status === 'failed' ||
              generation.status === 'cancelled'
            ) {
              handleStreamComplete(
                generationId,
                generation.status === 'cancelled',
                generation.status === 'failed'
              );
              return;
            }

            await new Promise((r) => setTimeout(r, pollingInterval));
          } catch (err) {
            if ((err as Error).name === 'AbortError') break;
            await new Promise((r) => setTimeout(r, pollingInterval));
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          onError?.(error);
        }
        setIsStreaming(false);
        removeStopHandler(generationId);
      }
    },
    [pollingInterval, onMessage, handleStreamComplete, onError]
  );

  /**
   * Start streaming a generation
   */
  const startStream = useCallback(
    async (generationId: GenerationId): Promise<void> => {
      // Clean up any existing stream
      abortControllerRef.current?.abort();
      batchProcessorRef.current?.clear();

      setIsStreaming(true);
      setError(null);
      setMessages([]);
      currentGenerationIdRef.current = generationId;
      retriesRef.current = 0;

      const generation = generationsById[generationId];
      if (generation && isRunningGeneration(generation)) {
        onStart?.(generation);
      }

      if (streamingEnabled) {
        await fetchStream(generationId);
      } else {
        await pollForUpdates(generationId);
      }
    },
    [generationsById, streamingEnabled, fetchStream, pollForUpdates, onStart]
  );

  /**
   * Stop the current stream
   */
  const stopStream = useCallback((): void => {
    abortControllerRef.current?.abort();
    batchProcessorRef.current?.flush();

    const genId = currentGenerationIdRef.current;
    if (genId) {
      removeStopHandler(genId);
    }

    setIsStreaming(false);
    currentGenerationIdRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      batchProcessorRef.current?.clear();

      const genId = currentGenerationIdRef.current;
      if (genId) {
        removeStopHandler(genId);
      }
    };
  }, []);

  return {
    isStreaming,
    error,
    startStream,
    stopStream,
    messages,
    currentGenerationId: currentGenerationIdRef.current,
  };
}
