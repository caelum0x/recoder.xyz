/**
 * Stream Task
 * Real-time streaming of task execution status
 */

import type { Task, TaskId, TaskExecutionContext } from './types';
import { getTask } from './get-task';
import { createScopedLogger } from '~/utils/logger';
import { createSSEStream, serializeSSE } from '~/lib/.server/llm/sse-utils';
const logger = createScopedLogger('StreamTask');

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
  return serializeSSE(event);
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
  const isTerminal = (status: Task['status']) =>
    status === 'completed' || status === 'failed' || status === 'cancelled';

  return createSSEStream(async function* streamTaskEvents() {
    let lastDataHash = '';
    const startTime = Date.now();

    yield formatStreamData({ type: 'connected' });

    while (true) {
      if (Date.now() - startTime > timeout) {
        yield formatStreamData({ type: 'end' });
        return;
      }

      try {
        const data: StreamData = {
          task: await getTask({ taskId, context }),
        };
        const currentHash = createDataHash(data);

        if (currentHash !== lastDataHash) {
          lastDataHash = currentHash;
          yield formatStreamData({ type: 'data', data });
        }

        if (isTerminal(data.task.status)) {
          yield formatStreamData({ type: 'end' });
          return;
        }
      } catch (error) {
        logger.error('Error fetching task:', error);
        yield formatStreamData({
          type: 'error',
          message: 'Failed to fetch task data',
        });
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
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
