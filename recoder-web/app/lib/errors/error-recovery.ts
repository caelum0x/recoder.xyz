/**
 * Error Recovery
 * Retry strategies, graceful degradation, and offline support
 */

import { type AppError, type ErrorSeverity, toAppError } from './types';

/**
 * Retry strategy types
 */
export type RetryStrategy = 'exponential' | 'linear' | 'fibonacci' | 'immediate';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay in ms */
  initialDelay: number;
  /** Maximum delay in ms */
  maxDelay: number;
  /** Backoff multiplier for exponential strategy */
  backoffMultiplier: number;
  /** Retry strategy */
  strategy: RetryStrategy;
  /** Whether to add jitter to delays */
  jitter: boolean;
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Callback when retrying */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
  /** Callback on final failure */
  onFinalFailure?: (error: Error, attempts: number) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  strategy: 'exponential',
  jitter: true,
};

/**
 * Calculate delay based on retry strategy
 */
function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  let delay: number;

  switch (config.strategy) {
    case 'immediate':
      delay = 0;
      break;

    case 'linear':
      delay = config.initialDelay * attempt;
      break;

    case 'fibonacci': {
      // Fibonacci sequence for delays
      let a = config.initialDelay;
      let b = config.initialDelay;
      for (let i = 1; i < attempt; i++) {
        const temp = a + b;
        a = b;
        b = temp;
      }
      delay = b;
      break;
    }

    case 'exponential':
    default:
      delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
      break;
  }

  // Apply jitter (up to 20% variance)
  if (config.jitter && delay > 0) {
    const jitterFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
    delay = Math.floor(delay * jitterFactor);
  }

  return Math.min(delay, config.maxDelay);
}

/**
 * Default retry predicate - determines if an error is retryable
 */
function defaultShouldRetry(error: Error, attempt: number): boolean {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Don't retry auth errors
  if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) {
    return false;
  }

  // Don't retry validation errors
  if (message.includes('validation') || message.includes('invalid')) {
    return false;
  }

  // Don't retry client errors (4xx except some specific ones)
  if (message.includes('400') || message.includes('404') || message.includes('405')) {
    return false;
  }

  // Retry network errors
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return true;
  }

  // Retry timeout errors
  if (message.includes('timeout') || name === 'aborterror') {
    return true;
  }

  // Retry server errors (5xx)
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return true;
  }

  // Default to retryable
  return true;
}

/**
 * Execute an operation with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const shouldRetry = fullConfig.shouldRetry || defaultShouldRetry;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    // Check for cancellation
    if (fullConfig.signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === fullConfig.maxRetries || !shouldRetry(lastError, attempt + 1)) {
        fullConfig.onFinalFailure?.(lastError, attempt + 1);
        throw lastError;
      }

      // Calculate delay
      const delay = calculateDelay(attempt + 1, fullConfig);

      // Notify about retry
      fullConfig.onRetry?.(lastError, attempt + 1, delay);

      // Wait before retrying
      if (delay > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delay);

          // Handle cancellation during wait
          fullConfig.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Operation cancelled'));
          });
        });
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Graceful degradation configuration
 */
export interface DegradationConfig<T> {
  /** Primary operation */
  primary: () => Promise<T>;
  /** Fallback operations in order of preference */
  fallbacks: Array<{
    name: string;
    operation: () => Promise<T>;
    shouldTry?: (error: Error) => boolean;
  }>;
  /** Callback when falling back */
  onFallback?: (fallbackName: string, error: Error) => void;
  /** Timeout for primary operation */
  timeout?: number;
}

/**
 * Execute with graceful degradation
 */
export async function withDegradation<T>(
  config: DegradationConfig<T>
): Promise<{ result: T; usedFallback?: string }> {
  // Try primary operation
  try {
    const result = config.timeout
      ? await withTimeout(config.primary, config.timeout)
      : await config.primary();
    return { result };
  } catch (primaryError) {
    const error = primaryError instanceof Error ? primaryError : new Error(String(primaryError));

    // Try fallbacks in order
    for (const fallback of config.fallbacks) {
      if (fallback.shouldTry && !fallback.shouldTry(error)) {
        continue;
      }

      try {
        config.onFallback?.(fallback.name, error);
        const result = await fallback.operation();
        return { result, usedFallback: fallback.name };
      } catch {
        // Continue to next fallback
      }
    }

    // All fallbacks failed
    throw error;
  }
}

/**
 * Execute operation with timeout
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Offline support configuration
 */
export interface OfflineConfig<T> {
  /** Operation to perform */
  operation: () => Promise<T>;
  /** Key for storing in offline queue */
  queueKey: string;
  /** Data to store if offline */
  offlineData?: unknown;
  /** Callback when operation is queued */
  onQueued?: (queueKey: string) => void;
  /** Callback when operation succeeds online */
  onSynced?: (result: T) => void;
}

/**
 * Offline queue item
 */
interface QueuedOperation {
  key: string;
  timestamp: number;
  data?: unknown;
  retries: number;
}

const OFFLINE_QUEUE_KEY = 'recoder_offline_queue';

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Get offline queue
 */
export function getOfflineQueue(): QueuedOperation[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Add operation to offline queue
 */
export function queueOfflineOperation(operation: QueuedOperation): void {
  if (typeof localStorage === 'undefined') return;
  const queue = getOfflineQueue();
  queue.push(operation);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Remove operation from offline queue
 */
export function removeFromOfflineQueue(key: string): void {
  if (typeof localStorage === 'undefined') return;
  const queue = getOfflineQueue();
  const filtered = queue.filter((op) => op.key !== key);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
}

/**
 * Clear offline queue
 */
export function clearOfflineQueue(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  }
}

/**
 * Execute operation with offline support
 */
export async function withOfflineSupport<T>(
  config: OfflineConfig<T>
): Promise<T | null> {
  if (!isOnline()) {
    // Queue the operation for later
    queueOfflineOperation({
      key: config.queueKey,
      timestamp: Date.now(),
      data: config.offlineData,
      retries: 0,
    });
    config.onQueued?.(config.queueKey);
    return null;
  }

  try {
    const result = await config.operation();
    config.onSynced?.(result);
    return result;
  } catch (error) {
    // Check if it's a network error
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('fetch')) {
      // Queue for later
      queueOfflineOperation({
        key: config.queueKey,
        timestamp: Date.now(),
        data: config.offlineData,
        retries: 0,
      });
      config.onQueued?.(config.queueKey);
      return null;
    }
    throw error;
  }
}

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time to wait before trying again (half-open) */
  resetTimeout: number;
  /** Callback when state changes */
  onStateChange?: (state: CircuitState, previousState: CircuitState) => void;
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: CircuitState = 'closed';

  constructor(private readonly config: CircuitBreakerConfig) {}

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.config.resetTimeout) {
        this.setState('half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.failures = 0;
    this.lastFailure = 0;
    this.setState('closed');
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state !== 'closed') {
      this.setState('closed');
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.setState('open');
    }
  }

  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      const previousState = this.state;
      this.state = newState;
      this.config.onStateChange?.(newState, previousState);
    }
  }
}

/**
 * Create a circuit breaker with default config
 */
export function createCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30000,
    ...config,
  });
}

/**
 * Error recovery action executor
 */
export interface RecoveryPlan {
  /** Error that triggered recovery */
  error: AppError;
  /** List of recovery steps */
  steps: Array<{
    name: string;
    action: () => Promise<boolean>;
    rollback?: () => Promise<void>;
  }>;
  /** Execute recovery plan */
  execute: () => Promise<boolean>;
}

/**
 * Create a recovery plan for an error
 */
export function createRecoveryPlan(
  error: Error | AppError,
  steps: RecoveryPlan['steps']
): RecoveryPlan {
  const appError = 'severity' in error ? error : toAppError(error);
  const executedSteps: string[] = [];

  return {
    error: appError,
    steps,
    async execute(): Promise<boolean> {
      for (const step of steps) {
        try {
          const success = await step.action();
          if (success) {
            executedSteps.push(step.name);
          } else {
            // Rollback executed steps
            await rollbackSteps(steps, executedSteps);
            return false;
          }
        } catch {
          // Rollback executed steps
          await rollbackSteps(steps, executedSteps);
          return false;
        }
      }
      return true;
    },
  };
}

async function rollbackSteps(
  steps: RecoveryPlan['steps'],
  executedSteps: string[]
): Promise<void> {
  // Rollback in reverse order
  for (let i = executedSteps.length - 1; i >= 0; i--) {
    const stepName = executedSteps[i];
    const step = steps.find((s) => s.name === stepName);
    if (step?.rollback) {
      try {
        await step.rollback();
      } catch {
        // Ignore rollback errors
      }
    }
  }
}

/**
 * Auto-recovery registry for common errors
 */
const autoRecoveryHandlers = new Map<
  string,
  (error: AppError) => Promise<boolean>
>();

/**
 * Register an auto-recovery handler
 */
export function registerAutoRecovery(
  errorCode: string,
  handler: (error: AppError) => Promise<boolean>
): void {
  autoRecoveryHandlers.set(errorCode, handler);
}

/**
 * Attempt auto-recovery for an error
 */
export async function attemptAutoRecovery(error: AppError): Promise<boolean> {
  const handler = autoRecoveryHandlers.get(error.code);
  if (handler) {
    try {
      return await handler(error);
    } catch {
      return false;
    }
  }
  return false;
}

// Register default auto-recovery handlers
if (typeof window !== 'undefined') {
  // Chunk load error - reload page
  registerAutoRecovery('CHUNK_LOAD_ERROR', async () => {
    // Clear caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    window.location.reload();
    return true;
  });

  // Auth error - redirect to login
  registerAutoRecovery('AUTH_REQUIRED', async () => {
    const loginUrl = `${window.location.origin.replace('app.', '')}/login?redirect=${encodeURIComponent(window.location.href)}`;
    window.location.href = loginUrl;
    return true;
  });

  // Auth token expired - redirect to login
  registerAutoRecovery('AUTH_TOKEN_EXPIRED', async () => {
    const loginUrl = `${window.location.origin.replace('app.', '')}/login?redirect=${encodeURIComponent(window.location.href)}`;
    window.location.href = loginUrl;
    return true;
  });
}

export default {
  withRetry,
  withDegradation,
  withTimeout,
  withOfflineSupport,
  CircuitBreaker,
  createCircuitBreaker,
  createRecoveryPlan,
  attemptAutoRecovery,
  registerAutoRecovery,
  isOnline,
  getOfflineQueue,
  clearOfflineQueue,
};
