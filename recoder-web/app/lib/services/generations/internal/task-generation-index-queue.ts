/**
 * Task Generation Index Queue
 * Handles batched updates to task generation indexes for performance
 */

import {
  getTaskGenerationIndexes,
  setTaskGenerationIndexes,
  taskGenerationIndexesPath,
} from '../storage';
import type {
  GenerationContextConfig,
  GenerationId,
  GenerationStorage,
  NodeGenerationIndex,
  TaskId,
} from '../types';

// =============================================================================
// Types
// =============================================================================

export type GenerationIndexPatch =
  | { type: 'upsert'; index: NodeGenerationIndex }
  | { type: 'remove'; generationId: GenerationId };

interface QueuedPatch {
  taskId: TaskId;
  patches: GenerationIndexPatch[];
  timestamp: number;
  retryCount: number;
}

interface QueueState {
  queue: Map<TaskId, QueuedPatch>;
  processing: Set<TaskId>;
  intervalId: ReturnType<typeof setInterval> | null;
  retryConfig: { maxRetries: number };
}

// =============================================================================
// Configuration
// =============================================================================

const BATCH_INTERVAL_MS = 50;
const DEFAULT_MAX_RETRIES = 3;

// =============================================================================
// Global State
// =============================================================================

const state: QueueState = {
  queue: new Map(),
  processing: new Set(),
  intervalId: null,
  retryConfig: { maxRetries: DEFAULT_MAX_RETRIES },
};

// =============================================================================
// Patch Operations
// =============================================================================

export function applyPatches(
  current: NodeGenerationIndex[] | undefined,
  patches: GenerationIndexPatch[],
): NodeGenerationIndex[] {
  let result = current ? [...current] : [];

  for (const patch of patches) {
    if (patch.type === 'upsert') {
      const existingIndex = result.findIndex((item) => item.id === patch.index.id);
      if (existingIndex === -1) {
        result.push(patch.index);
      } else {
        result[existingIndex] = patch.index;
      }
    } else {
      result = result.filter((item) => item.id !== patch.generationId);
    }
  }

  return result;
}

export function upsert(index: NodeGenerationIndex): GenerationIndexPatch {
  return { type: 'upsert', index };
}

export function remove(generationId: GenerationId): GenerationIndexPatch {
  return { type: 'remove', generationId };
}

// =============================================================================
// Queue Processing
// =============================================================================

async function processPatchBatch(storage: GenerationStorage, item: QueuedPatch): Promise<void> {
  const currentIndexes = await getTaskGenerationIndexes({
    storage,
    taskId: item.taskId,
  });

  const updatedIndexes = applyPatches(currentIndexes, item.patches);

  await storage.setJson({
    path: taskGenerationIndexesPath(item.taskId),
    data: updatedIndexes,
  });
}

async function processQueue(storage: GenerationStorage): Promise<void> {
  if (state.queue.size === 0) {
    return;
  }

  const itemsToProcess = Array.from(state.queue.entries());
  state.queue.clear();

  for (const [taskId, item] of itemsToProcess) {
    if (state.processing.has(taskId)) {
      const existingItem = state.queue.get(taskId);
      if (existingItem) {
        existingItem.patches.push(...item.patches);
      } else {
        state.queue.set(taskId, item);
      }
      continue;
    }

    state.processing.add(taskId);

    try {
      await processPatchBatch(storage, item);
    } catch (error) {
      if (item.retryCount < state.retryConfig.maxRetries) {
        const retryItem: QueuedPatch = {
          ...item,
          retryCount: item.retryCount + 1,
          timestamp: Date.now(),
        };
        const existingItem = state.queue.get(taskId);
        if (existingItem) {
          existingItem.patches.unshift(...retryItem.patches);
          existingItem.retryCount = Math.max(existingItem.retryCount, retryItem.retryCount);
        } else {
          state.queue.set(taskId, retryItem);
        }
        console.warn(
          `Generation index patch failed for task ${taskId}, retry ${item.retryCount + 1}/${state.retryConfig.maxRetries}:`,
          error,
        );
      } else {
        console.error(
          `Generation index patch permanently failed for task ${taskId} after ${state.retryConfig.maxRetries} retries. Data loss may occur:`,
          error,
          'Failed patches:',
          item.patches,
        );
      }
    } finally {
      state.processing.delete(taskId);
    }
  }
}

function startProcessing(storage: GenerationStorage): void {
  if (state.intervalId !== null) {
    return;
  }

  state.intervalId = setInterval(() => {
    processQueue(storage).catch((error) => {
      console.error('Unhandled error in generation index queue processing:', error);
    });
  }, BATCH_INTERVAL_MS);
}

function stopProcessing(): void {
  if (state.intervalId !== null) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function enqueuePatch(
  storage: GenerationStorage,
  taskId: TaskId,
  patch: GenerationIndexPatch,
): void {
  const existingItem = state.queue.get(taskId);

  if (existingItem) {
    existingItem.patches.push(patch);
  } else {
    state.queue.set(taskId, {
      taskId,
      patches: [patch],
      timestamp: Date.now(),
      retryCount: 0,
    });
  }

  startProcessing(storage);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Updates task generation indexes by queuing a patch
 */
export function updateTaskGenerationIndexes(
  storage: GenerationStorage,
  taskId: TaskId,
  newIndex: NodeGenerationIndex,
): void {
  const patch = upsert(newIndex);
  enqueuePatch(storage, taskId, patch);
}

/**
 * Flushes all pending patches immediately
 */
export async function flushGenerationIndexQueue(params: {
  context: GenerationContextConfig;
  options?: { skipRestart?: boolean };
}): Promise<void> {
  const { context, options } = params;

  stopProcessing();
  context.logger.debug('Flushing generation index queue');
  context.logger.debug(`state.queue.size: ${state.queue.size}`);

  try {
    while (state.queue.size > 0 || state.processing.size > 0) {
      if (state.processing.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }
      await processQueue(context.storage);
    }
  } finally {
    if (options?.skipRestart) {
      cleanupGenerationIndexQueue();
    } else {
      startProcessing(context.storage);
    }
  }
}

/**
 * Cleans up the generation index queue
 */
export function cleanupGenerationIndexQueue(): void {
  stopProcessing();
  state.queue.clear();
  state.processing.clear();
}

/**
 * Gets the current queue size (for testing/monitoring)
 */
export function getQueueSize(): number {
  return state.queue.size;
}
