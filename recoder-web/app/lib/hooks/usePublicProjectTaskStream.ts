import { useEffect, useRef } from 'react';
import {
  parseTaskStreamFrame,
  type PublicPromptTaskSnapshot,
} from '~/lib/public-api/task-stream-protocol';

interface UsePublicProjectTaskStreamOptions {
  projectId?: string;
  taskId?: string;
  apiKey?: string;
  enabled?: boolean;
  onTask?: (task: PublicPromptTaskSnapshot) => void;
  onEnd?: (status: PublicPromptTaskSnapshot['status']) => void;
  onError?: (message: string) => void;
}

export function usePublicProjectTaskStream(options: UsePublicProjectTaskStreamOptions): void {
  const abortRef = useRef<AbortController | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectDelayMsRef = useRef<number>(1000);
  const endedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!options.enabled || !options.projectId || !options.taskId || !options.apiKey) {
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    endedRef.current = false;
    reconnectDelayMsRef.current = 1000;

    const run = async () => {
      let shouldReconnect = true;
      try {
        const params = new URLSearchParams({
          projectId: options.projectId!,
          taskId: options.taskId!,
        });
        const response = await fetch(`/api/public/projects/task-stream?${params.toString()}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${options.apiKey}`,
            'Accept': 'text/event-stream',
            ...(lastEventIdRef.current ? { 'Last-Event-ID': lastEventIdRef.current } : {}),
          },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          let errorMessage = 'Task stream disconnected';
          try {
            const payload = await response.json() as { error?: string };
            if (payload?.error) errorMessage = payload.error;
          } catch {
            // Ignore non-JSON error payloads.
          }
          options.onError?.(errorMessage);
          return;
        }

        const retryHeader = response.headers.get('Retry-After');
        const parsedRetryHeader = Number.parseInt(retryHeader || '', 10);
        if (Number.isFinite(parsedRetryHeader) && parsedRetryHeader > 0) {
          reconnectDelayMsRef.current = Math.max(1000, parsedRetryHeader * 1000);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!abortController.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';

          for (const frame of frames) {
            try {
              const parsedFrame = parseTaskStreamFrame(frame);
              if (parsedFrame.id) {
                lastEventIdRef.current = parsedFrame.id;
              }
              if (typeof parsedFrame.retry === 'number') {
                reconnectDelayMsRef.current = Math.max(500, parsedFrame.retry);
              }
              const parsed = parsedFrame.data;
              if (parsed.type === 'data') {
                options.onTask?.(parsed.data.task);
              } else if (parsed.type === 'end') {
                options.onEnd?.(parsed.status || 'completed');
                endedRef.current = true;
                shouldReconnect = false;
                abortController.abort();
                return;
              } else if (parsed.type === 'error') {
                options.onError?.(parsed.message || 'Task stream error');
              }
            } catch (error) {
              options.onError?.(error instanceof Error ? error.message : 'Failed to parse task stream event');
            }
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          options.onError?.(error instanceof Error ? error.message : 'Task stream disconnected');
        }
      } finally {
        if (shouldReconnect && !abortController.signal.aborted && !endedRef.current) {
          const delay = reconnectDelayMsRef.current;
          reconnectDelayMsRef.current = Math.min(delay * 2, 10_000);
          setTimeout(() => {
            if (!abortController.signal.aborted && !endedRef.current) {
              void run();
            }
          }, delay);
        }
      }
    };

    void run();

    return () => {
      abortController.abort();
      abortRef.current = null;
    };
  }, [
    options.enabled,
    options.projectId,
    options.taskId,
    options.apiKey,
    options.onTask,
    options.onEnd,
    options.onError,
  ]);
}
