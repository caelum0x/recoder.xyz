/**
 * Rate Limiter for Public API
 *
 * Implements sliding window rate limiting with per-tier configurations.
 * Returns standard rate limit headers for API responses.
 */
import type { ApiKey, ApiKeyTier, RateLimitConfig, RateLimitStatus, RateLimitHeaders } from './types.js';
/**
 * Rate limit configurations per tier
 */
export declare const RATE_LIMIT_CONFIGS: Record<ApiKeyTier, RateLimitConfig>;
/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Current limit */
    limit: number;
    /** Remaining requests */
    remaining: number;
    /** When the limit resets (Unix timestamp) */
    resetAt: number;
    /** Which window was hit (if not allowed) */
    window?: 'minute' | 'hour' | 'day' | 'concurrent';
    /** Retry after (in seconds) */
    retryAfterSeconds?: number;
}
/**
 * Check rate limit for an API key
 *
 * @param apiKey - The API key to check
 * @returns Rate limit result
 */
export declare function checkRateLimit(apiKey: ApiKey): RateLimitResult;
/**
 * Check if a new sandbox can be created
 */
export declare function checkSandboxLimit(apiKey: ApiKey): RateLimitResult;
/**
 * Consume a rate limit token and return updated status
 */
export declare function consumeRateLimit(apiKey: ApiKey): RateLimitResult;
/**
 * Get rate limit status for an API key
 */
export declare function getRateLimitStatus(apiKey: ApiKey): {
    minute: RateLimitStatus;
    hour: RateLimitStatus;
    day: RateLimitStatus;
    sandboxes: {
        limit: number;
        used: number;
        remaining: number;
    };
};
/**
 * Generate rate limit headers for HTTP response
 */
export declare function getRateLimitHeaders(result: RateLimitResult): RateLimitHeaders;
/**
 * Get configuration for a tier
 */
export declare function getTierConfig(tier: ApiKeyTier): RateLimitConfig;
/**
 * Get max file size for a tier
 */
export declare function getMaxFileSize(tier: ApiKeyTier): number;
/**
 * Get max command timeout for a tier
 */
export declare function getMaxCommandTimeout(tier: ApiKeyTier): number;
/**
 * Get max sandbox duration for a tier
 */
export declare function getMaxSandboxDuration(tier: ApiKeyTier): number;
/**
 * Sliding window rate limiter for more accurate limiting
 * This is a more sophisticated implementation that can be used for
 * critical endpoints
 */
interface SlidingWindowEntry {
    timestamp: number;
    weight: number;
}
/**
 * Check rate limit using sliding window algorithm
 *
 * @param key - Unique key for the limit (e.g., `${keyId}:endpoint`)
 * @param limit - Maximum requests in window
 * @param windowMs - Window duration in milliseconds
 * @returns Whether the request is allowed and remaining count
 */
export declare function checkSlidingWindowLimit(key: string, limit: number, windowMs: number): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};
/**
 * Clean up old sliding window entries
 * Call periodically to prevent memory growth
 */
export declare function cleanupSlidingWindows(maxAge?: number): void;
/**
 * Token bucket for burst protection
 */
interface TokenBucket {
    tokens: number;
    lastRefill: number;
    maxTokens: number;
    refillRate: number;
}
/**
 * Check if request is allowed using token bucket
 * Good for allowing bursts while maintaining average rate
 */
export declare function checkTokenBucket(key: string, maxTokens: number, refillRate: number, tokensRequired?: number): {
    allowed: boolean;
    tokensRemaining: number;
};
export declare const _testing: {
    slidingWindows: Map<string, SlidingWindowEntry[]>;
    tokenBuckets: Map<string, TokenBucket>;
    clearAll: () => void;
};
export {};
