/**
 * useTaskStreamReader Hook
 * Handles Server-Sent Events (SSE) stream for task execution
 *
 * Flow:
 * Client -> HTTP POST /streamTask -> SSE Stream -> Stream Processing
 *                                         |               |
 *                                         v               v
 *                                    onUpdateAction <- Parse Events
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskId, StreamData, StreamEvent } from './types';
import { parseStreamEvent } from './types';

// ============================================================
// Types
// ============================================================

export type StreamDataEventHandler = (data: StreamData) => void;

export interface UseTaskStreamReaderOptions {
  /** Task ID to stream */
  taskId: TaskId;
  /** Callback when stream data is received */
  onData: StreamDataEventHandler;
  /** Callback when stream connects */
  onConnect?: () => void;
  /** Callback when stream ends */
  onEnd?: () => void;
  /** Callback on stream error */
  onError?: (error: Error) => void;
  /** Auto-start streaming on mount */
  autoStart?: boolean;
  /** API endpoint for streaming */
  endpoint?: string;
}

export interface UseTaskStreamReaderResult {
  /** Whether the stream is connected */
  isConnected: boolean;
  /** Whether the stream is connecting */
  isConnecting: boolean;
  /** Current error if any */
  error: Error | null;
  /** Start streaming */
  start: () => void;
  /** Stop streaming */
  stop: () => void;
  /** Reconnect to the stream */
  reconnect: () => void;
}

// ============================================================
// Hook Implementation
// ============================================================

export function useTaskStreamReader(
  options: UseTaskStreamReaderOptions
): UseTaskStreamReaderResult {
  const {
    taskId,
    onData,
    onConnect,
    onEnd,
    onError,
    autoStart = false,
    endpoint = '/api/giselle/streamTask',
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for cleanup and state tracking
  const controllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const retriesRef = useRef(0);
  const maxRetries = 3;

  /**
   * Process SSE messages
   */
  const processMessage = useCallback(
    (message: string): boolean => {
      const trimmed = message.trim();
      if (!trimmed || !trimmed.startsWith('data:')) {
        return true; // Continue processing
      }

      try {
        const json = trimmed.slice(5).trim();
        const parsed = JSON.parse(json);
        const streamEvent = parseStreamEvent(parsed);

        if (!streamEvent) {
          console.warn('Failed to parse stream event:', parsed);
          return true;
        }

        switch (streamEvent.type) {
          case 'connected':
            if (process.env.NODE_ENV === 'development') {
              console.log('[TaskStreamReader] Connected');
            }
            onConnect?.();
            break;

          case 'data':
            onData(streamEvent.data);
            break;

          case 'end':
            if (process.env.NODE_ENV === 'development') {
              console.log('[TaskStreamReader] Stream ended');
            }
            onEnd?.();
            return false; // Stop processing

          case 'error':
            const err = new Error(streamEvent.message);
            setError(err);
            onError?.(err);
            return false; // Stop processing
        }
      } catch (parseError) {
        console.error('[TaskStreamReader] Failed to parse message:', parseError);
      }

      return true; // Continue processing
    },
    [onConnect, onData, onEnd, onError]
  );

  /**
   * Connect to the stream
   */
  const connect = useCallback(async (): Promise<void> => {
    if (cancelledRef.current) return;

    setIsConnecting(true);
    setError(null);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Stream request failed: ${response.status}`);
      }

      if (!response.body || cancelledRef.current) {
        setIsConnecting(false);
        return;
      }

      // Stream setup
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();

      setIsConnected(true);
      setIsConnecting(false);
      retriesRef.current = 0;

      let buffer = '';

      try {
        while (!cancelledRef.current) {
          const { value, done } = await reader.read();

          if (done || cancelledRef.current) {
            break;
          }

          buffer += value;

          // Split by double newline for SSE messages
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';

          for (const message of messages) {
            const shouldContinue = processMessage(message);
            if (!shouldContinue) {
              await reader.cancel();
              setIsConnected(false);
              return;
            }
          }
        }
      } finally {
        await reader.cancel();
      }

      setIsConnected(false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Expected during cleanup
        setIsConnecting(false);
        setIsConnected(false);
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      setIsConnecting(false);
      setIsConnected(false);

      // Retry logic
      if (!cancelledRef.current && retriesRef.current < maxRetries) {
        retriesRef.current++;
        const delay = 1000 * Math.pow(2, retriesRef.current - 1);
        if (process.env.NODE_ENV === 'development') {
          console.log(
            `[TaskStreamReader] Retrying in ${delay}ms (attempt ${retriesRef.current})`
          );
        }
        setTimeout(() => connect(), delay);
      }
    }
  }, [taskId, endpoint, processMessage, onError]);

  /**
   * Start streaming
   */
  const start = useCallback((): void => {
    cancelledRef.current = false;
    retriesRef.current = 0;
    connect();
  }, [connect]);

  /**
   * Stop streaming
   */
  const stop = useCallback((): void => {
    cancelledRef.current = true;
    controllerRef.current?.abort();
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  /**
   * Reconnect to stream
   */
  const reconnect = useCallback((): void => {
    stop();
    // Small delay before reconnecting
    setTimeout(() => {
      start();
    }, 100);
  }, [stop, start]);

  // Auto-start on mount if enabled
  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      cancelledRef.current = true;
      controllerRef.current?.abort();
    };
  }, [autoStart, start]);

  // Reconnect when taskId changes
  useEffect(() => {
    if (isConnected || isConnecting) {
      reconnect();
    }
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    isConnecting,
    error,
    start,
    stop,
    reconnect,
  };
}

// ============================================================
// Component Version (for compatibility)
// ============================================================

export interface TaskStreamReaderProps {
  taskId: TaskId;
  onUpdateAction: StreamDataEventHandler;
  children?: React.ReactNode;
}

/**
 * TaskStreamReader Component
 * Wrapper component that renders children while streaming task updates
 */
export function TaskStreamReader({
  taskId,
  onUpdateAction,
  children,
}: TaskStreamReaderProps): React.ReactNode {
  useTaskStreamReader({
    taskId,
    onData: onUpdateAction,
    autoStart: true,
  });

  return children;
}
