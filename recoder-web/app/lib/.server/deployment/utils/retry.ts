import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('DeployRetry');
/**
 * Retry utilities for deployment operations
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: (error: Error) => {
    // Retry on network errors, rate limits, and transient server errors
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    );
  },
  onRetry: () => {},
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error = new Error('Unknown error');
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt >= opts.maxRetries) {
        throw lastError;
      }

      if (!opts.retryableErrors(lastError)) {
        throw lastError;
      }

      // Calculate next delay with exponential backoff and jitter
      const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15
      const nextDelay = Math.min(delay * jitter, opts.maxDelayMs);

      opts.onRetry(attempt + 1, lastError, nextDelay);

      // Wait before retrying
      await sleep(nextDelay);

      // Increase delay for next attempt
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Fetch with retry support
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, options);

    // Throw on rate limit or server errors to trigger retry
    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response;
  }, {
    ...retryOptions,
    onRetry: (attempt, error, nextDelay) => {
      logger.info(`[Retry] Attempt ${attempt}, waiting ${Math.round(nextDelay)}ms: ${error.message}`);
      retryOptions.onRetry?.(attempt, error, nextDelay);
    },
  });
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function timeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message || `Operation timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Rate limiter for API requests
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(
    private maxConcurrent: number = 10,
    private minDelayMs: number = 100
  ) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      setTimeout(() => {
        this.running++;
        next();
      }, this.minDelayMs);
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
