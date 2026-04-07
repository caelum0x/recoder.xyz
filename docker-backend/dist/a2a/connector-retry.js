"use strict";
/**
 * @module connector-retry
 *
 * Connector-level retry wrapper with exponential backoff.
 *
 * Uses the A2A error taxonomy's `retryable` flag to decide whether a failed
 * operation should be retried. Non-retryable errors are surfaced immediately.
 *
 * Retry policy:
 * - Exponential backoff: delay = baseDelayMs * 2^attempt (capped at maxDelayMs)
 * - Jitter: ±25% random jitter on each delay
 * - Max attempts: configurable (default: 3)
 * - Retryable check: uses error code registry or explicit flag
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRetryableError = isRetryableError;
exports.withConnectorRetry = withConnectorRetry;
exports.createRetryableExecutor = createRetryableExecutor;
const a2a_1 = require("@recoder/shared/a2a");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('connector-retry');
const DEFAULT_RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 15_000,
    jitterFactor: 0.25,
};
// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------
/**
 * Determine if an error is retryable based on the A2A error taxonomy.
 *
 * Checks, in order:
 * 1. If the error has a `retryable` boolean property, use that.
 * 2. If the error has a `code` string that matches an A2A error code, look up
 *    the registry metadata.
 * 3. Certain well-known error types are retryable (ECONNRESET, ETIMEDOUT, etc.).
 * 4. Default: not retryable.
 */
function isRetryableError(error) {
    // Structured A2A error
    if (error && typeof error === 'object') {
        const obj = error;
        // Direct retryable flag
        if (typeof obj.retryable === 'boolean') {
            return obj.retryable;
        }
        // A2A error with code
        if (typeof obj.code === 'string' && (0, a2a_1.isA2AErrorCode)(obj.code)) {
            const meta = (0, a2a_1.getErrorCodeMeta)(obj.code);
            return meta?.retryable ?? false;
        }
        // Error wrapping an A2A error
        if (obj.error && typeof obj.error === 'object') {
            return isRetryableError(obj.error);
        }
    }
    // Standard Error with known retryable error codes
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        const retryablePatterns = [
            'econnreset',
            'econnrefused',
            'etimedout',
            'epipe',
            'socket hang up',
            'network error',
            'timeout',
            'temporarily unavailable',
            'service unavailable',
            'too many requests',
            'rate limit',
        ];
        return retryablePatterns.some((p) => msg.includes(p));
    }
    return false;
}
/**
 * Calculate the delay for a given attempt with exponential backoff and jitter.
 */
function calculateDelay(attempt, config) {
    const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
    const capped = Math.min(exponentialDelay, config.maxDelayMs);
    // Apply jitter: ±jitterFactor
    const jitter = 1 + (Math.random() * 2 - 1) * config.jitterFactor;
    return Math.round(capped * jitter);
}
/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Execute an async operation with connector-level retry.
 *
 * @param operation - The async function to execute.
 * @param config - Retry configuration (merged with defaults).
 * @returns The result of the operation.
 * @throws The last error if all retries are exhausted.
 *
 * @example
 * ```ts
 * const result = await withConnectorRetry(
 *   () => runtime.executeTask(input),
 *   { maxAttempts: 3, onRetry: (attempt, err) => console.log(`Retry ${attempt}`) },
 * );
 * ```
 */
async function withConnectorRetry(operation, config) {
    const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError;
    for (let attempt = 0; attempt <= cfg.maxAttempts; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            // Don't retry if we've exhausted attempts
            if (attempt >= cfg.maxAttempts) {
                logger.warn({ attempt, maxAttempts: cfg.maxAttempts }, 'All retry attempts exhausted');
                break;
            }
            // Don't retry non-retryable errors
            if (!isRetryableError(error)) {
                logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'Error is not retryable, failing immediately');
                break;
            }
            const delayMs = calculateDelay(attempt, cfg);
            logger.info({
                attempt: attempt + 1,
                maxAttempts: cfg.maxAttempts,
                delayMs,
                error: error instanceof Error ? error.message : String(error),
            }, 'Retrying connector operation after retryable error');
            cfg.onRetry?.(attempt + 1, error, delayMs);
            await sleep(delayMs);
        }
    }
    throw lastError;
}
/**
 * Create a retry-wrapped version of a connector execution function.
 *
 * @param executeFn - The connector execution function.
 * @param config - Retry configuration.
 * @returns A wrapped function that retries on retryable errors.
 */
function createRetryableExecutor(executeFn, config) {
    return (input) => withConnectorRetry(() => executeFn(input), config);
}
