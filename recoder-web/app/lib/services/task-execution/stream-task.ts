/**
 * Stream Task
 * Real-time streaming of task execution status
 */

import type { Task, TaskId, TaskExecutionContext } from './types';
import { getTask } from './get-task';

// Stream event types
export interface StreamConnectedEvent {
  type: 'connected';
}

export interface StreamDataEvent {
  type: 'data';
  data: StreamData;
}

export interface StreamErrorEvent {
  type: 'error';
  message: string;
}

export interface StreamEndEvent {
  type: 'end';
}

export type StreamEvent = StreamConnectedEvent | StreamDataEvent | StreamErrorEvent | StreamEndEvent;

export interface StreamData {
  task: Task;
}

function createDataHash(data: StreamData): string {
  // Create a simple hash of the data to detect changes
  return JSON.stringify({
    taskUpdatedAt: data.task.updatedAt,
    taskStatus: data.task.status,
    steps: data.task.steps,
  });
}

/**
 * Format a stream event for SSE transmission
 */
export function formatStreamData(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export interface StreamTaskOptions {
  taskId: TaskId;
  context: TaskExecutionContext;
  pollInterval?: number;
  timeout?: number;
}

/**
 * Create a readable stream that emits task status updates
 * Uses Server-Sent Events (SSE) format
 */
export function streamTask(options: StreamTaskOptions): ReadableStream<Uint8Array> {
  const { taskId, context, pollInterval = 500, timeout = 20 * 60 * 1000 } = options;
  const encoder = new TextEncoder();

  let pollIntervalId: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let polling = true;

  const cleanupResources = () => {
    polling = false;

    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return new ReadableStream({
    async start(controller) {
      let lastDataHash = '';
      let lastFetchedData: StreamData | null = null;

      // Send connection established event
      controller.enqueue(encoder.encode(formatStreamData({ type: 'connected' })));

      const sendUpdate = async () => {
        if (!polling || controller.desiredSize === null) {
          return;
        }

        try {
          lastFetchedData = {
            task: await getTask({ taskId, context }),
          };
          const currentHash = createDataHash(lastFetchedData);

          if (currentHash === lastDataHash) {
            return;
          }
          lastDataHash = currentHash;

          controller.enqueue(
            encoder.encode(
              formatStreamData({
                type: 'data',
                data: lastFetchedData,
              })
            )
          );
        } catch (error) {
          console.error('Error fetching task:', error);
          lastFetchedData = null;

          // Only send error if controller is still active
          try {
            controller.enqueue(
              encoder.encode(
                formatStreamData({
                  type: 'error',
                  message: 'Failed to fetch task data',
                })
              )
            );
          } catch {
            // Ignore if controller is already closed
          }
        }
      };

      const cleanup = () => {
        cleanupResources();

        // Send end message and close if controller is still active
        if (controller.desiredSize !== null) {
          controller.enqueue(encoder.encode(formatStreamData({ type: 'end' })));
          controller.close();
        }
      };

      const poll = async () => {
        if (!polling || controller.desiredSize === null) {
          return;
        }

        await sendUpdate();

        // Check if task is complete
        if (
          lastFetchedData?.task.status === 'completed' ||
          lastFetchedData?.task.status === 'failed' ||
          lastFetchedData?.task.status === 'cancelled'
        ) {
          cleanup();
        }
      };

      // Execute immediately first
      await poll();

      // Only set up polling if we haven't cleaned up already
      if (polling) {
        pollIntervalId = setInterval(poll, pollInterval);
        timeoutId = setTimeout(cleanup, timeout);
      }
    },

    cancel() {
      cleanupResources();
    },
  });
}

/**
 * Create an async generator that yields task updates
 * Useful for consuming task updates in async/await style
 */
export async function* streamTaskUpdates(
  options: StreamTaskOptions
): AsyncGenerator<StreamEvent, void, unknown> {
  const { taskId, context, pollInterval = 500, timeout = 20 * 60 * 1000 } = options;

  let lastDataHash = '';
  const startTime = Date.now();

  yield { type: 'connected' };

  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      yield { type: 'end' };
      return;
    }

    try {
      const task = await getTask({ taskId, context });
      const data: StreamData = { task };
      const currentHash = createDataHash(data);

      if (currentHash !== lastDataHash) {
        lastDataHash = currentHash;
        yield { type: 'data', data };
      }

      // Check if task is complete
      if (
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'cancelled'
      ) {
        yield { type: 'end' };
        return;
      }
    } catch (error) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}
