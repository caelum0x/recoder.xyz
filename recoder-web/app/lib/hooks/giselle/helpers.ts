/**
 * Giselle Helpers
 * Utility functions for generation polling and status management
 */

import type {
  Generation,
  GenerationId,
  CompletedGeneration,
  FailedGeneration,
  RunningGeneration,
  CancelledGeneration,
} from './types';
import {
  isCompletedGeneration,
  isFailedGeneration,
  isRunningGeneration,
  isCancelledGeneration,
} from './types';

// ============================================================
// Polling Helpers
// ============================================================

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const exponentialBackoff = (interval: number): number => {
  return Math.min(interval * 2, 30000); // Cap at 30 seconds
};

export type GenerationFetcher = (
  generationId: GenerationId
) => Promise<Generation | undefined>;

export interface PollingOptions {
  initialInterval?: number;
  maxAttempts?: number;
  onProgress?: (attempt: number, maxAttempts: number) => void;
}

/**
 * Poll for a generation to reach a specific status
 */
async function waitAndGetGenerationStatus(
  fetcher: GenerationFetcher,
  generationId: GenerationId,
  statuses: Generation['status'][],
  options: PollingOptions = {}
): Promise<Generation> {
  const { initialInterval = 500, maxAttempts = 10, onProgress } = options;

  let currentInterval = initialInterval;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const generation = await fetcher(generationId);

    if (generation !== undefined && statuses.includes(generation.status)) {
      return generation;
    }

    onProgress?.(attempts + 1, maxAttempts);

    await wait(currentInterval);
    currentInterval = exponentialBackoff(currentInterval);
    attempts++;
  }

  throw new Error(
    `Maximum polling attempts (${maxAttempts}) reached without reaching status: ${statuses.join(', ')}`
  );
}

/**
 * Wait for a generation to complete
 */
export async function waitAndGetGenerationCompleted(
  fetcher: GenerationFetcher,
  generationId: GenerationId,
  options?: PollingOptions
): Promise<CompletedGeneration> {
  const generation = await waitAndGetGenerationStatus(
    fetcher,
    generationId,
    ['completed'],
    options
  );

  if (!isCompletedGeneration(generation)) {
    throw new Error(
      `Expected completed generation, got ${generation.status}`
    );
  }

  return generation;
}

/**
 * Wait for a generation to start running
 */
export async function waitAndGetGenerationRunning(
  fetcher: GenerationFetcher,
  generationId: GenerationId,
  options?: PollingOptions
): Promise<
  RunningGeneration | CompletedGeneration | FailedGeneration | CancelledGeneration
> {
  const generation = await waitAndGetGenerationStatus(
    fetcher,
    generationId,
    ['running', 'completed', 'failed', 'cancelled'],
    options
  );

  if (
    !isRunningGeneration(generation) &&
    !isCompletedGeneration(generation) &&
    !isFailedGeneration(generation) &&
    !isCancelledGeneration(generation)
  ) {
    throw new Error(
      `Expected running/completed/failed/cancelled generation, got ${generation.status}`
    );
  }

  return generation;
}

/**
 * Wait for a generation to fail
 */
export async function waitAndGetGenerationFailed(
  fetcher: GenerationFetcher,
  generationId: GenerationId,
  options?: PollingOptions
): Promise<FailedGeneration> {
  const generation = await waitAndGetGenerationStatus(
    fetcher,
    generationId,
    ['failed'],
    options
  );

  if (!isFailedGeneration(generation)) {
    throw new Error(`Expected failed generation, got ${generation.status}`);
  }

  return generation;
}

// ============================================================
// Array Helpers
// ============================================================

/**
 * Check if two arrays are equal (shallow comparison)
 */
export function arrayEquals(a: unknown, b: unknown): boolean {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index])
  );
}

/**
 * Deduplicate an array by a key function
 */
export function dedupeBy<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// ============================================================
// Retry Helpers
// ============================================================

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= maxRetries || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      await wait(delay);
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError;
}

// ============================================================
// Message Batching Helpers
// ============================================================

export interface BatchProcessor<T> {
  add: (item: T) => void;
  flush: () => T[];
  clear: () => void;
  size: number;
}

/**
 * Create a batch processor that collects items and flushes on requestAnimationFrame
 */
export function createBatchProcessor<T>(
  onFlush: (items: T[]) => void
): BatchProcessor<T> {
  let queue: T[] = [];
  let pendingFlush: number | null = null;

  const flush = (): T[] => {
    const items = [...queue];
    queue = [];
    pendingFlush = null;
    if (items.length > 0) {
      onFlush(items);
    }
    return items;
  };

  const scheduleFlush = (): void => {
    if (pendingFlush === null) {
      pendingFlush = requestAnimationFrame(flush);
    }
  };

  return {
    add: (item: T): void => {
      queue.push(item);
      scheduleFlush();
    },
    flush: (): T[] => {
      if (pendingFlush !== null) {
        cancelAnimationFrame(pendingFlush);
      }
      return flush();
    },
    clear: (): void => {
      if (pendingFlush !== null) {
        cancelAnimationFrame(pendingFlush);
        pendingFlush = null;
      }
      queue = [];
    },
    get size(): number {
      return queue.length;
    },
  };
}

// ============================================================
// Timeout Helpers
// ============================================================

export interface TimeoutController {
  promise: Promise<never>;
  cancel: () => void;
}

/**
 * Create a timeout that can be cancelled
 */
export function createTimeout(
  ms: number,
  message: string = 'Operation timed out'
): TimeoutController {
  let timeoutId: ReturnType<typeof setTimeout>;
  let reject: (error: Error) => void;

  const promise = new Promise<never>((_, rej) => {
    reject = rej;
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  return {
    promise,
    cancel: () => clearTimeout(timeoutId),
  };
}

/**
 * Race a promise against a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  const timeout = createTimeout(ms, message);

  try {
    return await Promise.race([promise, timeout.promise]);
  } finally {
    timeout.cancel();
  }
}
