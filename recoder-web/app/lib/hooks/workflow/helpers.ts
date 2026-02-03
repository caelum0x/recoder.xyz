/**
 * Workflow Helpers
 * Utility functions for generation polling, retry logic, and batching
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
// Timing Helpers
// ============================================================

/**
 * Wait for a specified number of milliseconds
 */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay
 */
export const exponentialBackoff = (
  interval: number,
  maxInterval: number = 30000
): number => {
  return Math.min(interval * 2, maxInterval);
};

// ============================================================
// Polling Types and Helpers
// ============================================================

export type GenerationFetcher = (
  generationId: GenerationId
) => Promise<Generation | undefined>;

export interface PollingOptions {
  /** Initial polling interval in ms */
  initialInterval?: number;
  /** Maximum polling attempts */
  maxAttempts?: number;
  /** Maximum polling interval in ms */
  maxInterval?: number;
  /** Progress callback */
  onProgress?: (attempt: number, maxAttempts: number) => void;
  /** Abort signal */
  signal?: AbortSignal;
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
  const {
    initialInterval = 500,
    maxAttempts = 60,
    maxInterval = 30000,
    onProgress,
    signal,
  } = options;

  let currentInterval = initialInterval;
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new Error('Polling aborted');
    }

    const generation = await fetcher(generationId);

    if (generation !== undefined && statuses.includes(generation.status)) {
      return generation;
    }

    onProgress?.(attempts + 1, maxAttempts);

    await wait(currentInterval);
    currentInterval = exponentialBackoff(currentInterval, maxInterval);
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

/**
 * Wait for a generation to reach any terminal state
 */
export async function waitAndGetGenerationTerminal(
  fetcher: GenerationFetcher,
  generationId: GenerationId,
  options?: PollingOptions
): Promise<CompletedGeneration | FailedGeneration | CancelledGeneration> {
  const generation = await waitAndGetGenerationStatus(
    fetcher,
    generationId,
    ['completed', 'failed', 'cancelled'],
    options
  );

  if (
    !isCompletedGeneration(generation) &&
    !isFailedGeneration(generation) &&
    !isCancelledGeneration(generation)
  ) {
    throw new Error(
      `Expected terminal generation state, got ${generation.status}`
    );
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

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ============================================================
// Retry Helpers
// ============================================================

export interface RetryOptions {
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Initial delay between retries in ms */
  initialDelay?: number;
  /** Maximum delay between retries in ms */
  maxDelay?: number;
  /** Function to determine if retry should happen */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Callback when a retry happens */
  onRetry?: (error: Error, attempt: number) => void;
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
    onRetry,
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

      onRetry?.(lastError, attempt);
      await wait(delay);
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Retry with jitter to avoid thundering herd
 */
export async function withRetryJitter<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const jitteredOptions: RetryOptions = {
    ...options,
    initialDelay: options.initialDelay
      ? options.initialDelay + Math.random() * 500
      : 1000 + Math.random() * 500,
  };
  return withRetry(fn, jitteredOptions);
}

// ============================================================
// Message Batching Helpers
// ============================================================

export interface BatchProcessor<T> {
  /** Add item to batch */
  add: (item: T) => void;
  /** Flush all pending items */
  flush: () => T[];
  /** Clear without flushing */
  clear: () => void;
  /** Current queue size */
  readonly size: number;
}

/**
 * Create a batch processor that collects items and flushes on requestAnimationFrame
 */
export function createBatchProcessor<T>(
  onFlush: (items: T[]) => void,
  options?: { maxBatchSize?: number; flushInterval?: number }
): BatchProcessor<T> {
  const { maxBatchSize = 100, flushInterval } = options ?? {};
  let queue: T[] = [];
  let pendingFlush: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const flush = (): T[] => {
    const items = [...queue];
    queue = [];
    if (pendingFlush !== null) {
      cancelAnimationFrame(pendingFlush);
      pendingFlush = null;
    }
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

  // Optional interval-based flushing
  if (flushInterval) {
    intervalId = setInterval(flush, flushInterval);
  }

  return {
    add: (item: T): void => {
      queue.push(item);
      if (queue.length >= maxBatchSize) {
        flush();
      } else {
        scheduleFlush();
      }
    },
    flush: (): T[] => {
      return flush();
    },
    clear: (): void => {
      if (pendingFlush !== null) {
        cancelAnimationFrame(pendingFlush);
        pendingFlush = null;
      }
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
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

// ============================================================
// Debounce and Throttle
// ============================================================

/**
 * Create a debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, ms);
  };
}

/**
 * Create a throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = ms - (now - lastCall);

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  };
}

// ============================================================
// Object Helpers
// ============================================================

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = { ...target };

  for (const source of sources) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
          typeof sourceValue === 'object' &&
          sourceValue !== null &&
          !Array.isArray(sourceValue) &&
          typeof targetValue === 'object' &&
          targetValue !== null &&
          !Array.isArray(targetValue)
        ) {
          (result as Record<string, unknown>)[key] = deepMerge(
            targetValue as Record<string, unknown>,
            sourceValue as Record<string, unknown>
          );
        } else {
          (result as Record<string, unknown>)[key] = sourceValue;
        }
      }
    }
  }

  return result;
}

/**
 * Omit keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Pick keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}
