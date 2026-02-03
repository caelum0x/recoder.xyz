/**
 * Batched patch queue for high-frequency state updates.
 * Adapted from giselle's pattern -- groups patches by key and flushes on interval.
 *
 * Use cases:
 * - Streaming token updates (batched every 50ms instead of per-token)
 * - File write status updates
 * - Action execution progress
 */

type PatchFn<T> = (current: T) => T;

interface QueueEntry<T> {
  key: string;
  patch: PatchFn<T>;
  timestamp: number;
}

interface PatchQueueOptions {
  /** Flush interval in ms (default: 50) */
  flushInterval?: number;
  /** Max retries for failed patches (default: 3) */
  maxRetries?: number;
  /** Error handler */
  onError?: (error: Error, key: string) => void;
}

export class PatchQueue<T> {
  private queue: QueueEntry<T>[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private readonly flushInterval: number;
  private readonly maxRetries: number;
  private readonly onError?: (error: Error, key: string) => void;
  private readonly applyFn: (key: string, patch: PatchFn<T>) => void | Promise<void>;

  constructor(
    applyFn: (key: string, patch: PatchFn<T>) => void | Promise<void>,
    options: PatchQueueOptions = {},
  ) {
    this.applyFn = applyFn;
    this.flushInterval = options.flushInterval ?? 50;
    this.maxRetries = options.maxRetries ?? 3;
    this.onError = options.onError;
  }

  /** Start processing the queue */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushInterval);
  }

  /** Stop processing (flushes remaining) */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Final flush
    this.flush();
  }

  /** Add a patch to the queue */
  enqueue(key: string, patch: PatchFn<T>): void {
    this.queue.push({ key, patch, timestamp: Date.now() });

    // Auto-start if not running
    if (!this.timer) {
      this.start();
    }
  }

  /** Process all queued patches immediately */
  async flush(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    // Drain the queue
    const batch = this.queue.splice(0);

    // Group by key, preserving order within each group
    const grouped = new Map<string, PatchFn<T>[]>();
    for (const entry of batch) {
      if (!grouped.has(entry.key)) {
        grouped.set(entry.key, []);
      }
      grouped.get(entry.key)!.push(entry.patch);
    }

    // Apply grouped patches
    for (const [key, patches] of grouped) {
      // Compose all patches for this key into one
      const composedPatch: PatchFn<T> = (current: T) => {
        let result = current;
        for (const patch of patches) {
          result = patch(result);
        }
        return result;
      };

      let retries = 0;
      while (retries <= this.maxRetries) {
        try {
          await this.applyFn(key, composedPatch);
          break;
        } catch (error) {
          retries++;
          if (retries > this.maxRetries) {
            this.onError?.(error instanceof Error ? error : new Error(String(error)), key);
          }
        }
      }
    }

    this.processing = false;
  }

  /** Get current queue size */
  get size(): number {
    return this.queue.length;
  }

  /** Check if queue is empty */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }
}

/**
 * Convenience: create a throttled updater that batches calls.
 * Usage:
 *   const update = createBatchedUpdater((key, value) => store.set(key, value));
 *   update('file1', content1); // batched
 *   update('file2', content2); // batched
 *   // Both applied together on next tick
 */
export function createBatchedUpdater<V>(
  setter: (key: string, value: V) => void,
  interval = 50,
): (key: string, value: V) => void {
  const pending = new Map<string, V>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (key: string, value: V) => {
    pending.set(key, value);

    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        const entries = Array.from(pending.entries());
        pending.clear();
        for (const [k, v] of entries) {
          setter(k, v);
        }
      }, interval);
    }
  };
}
