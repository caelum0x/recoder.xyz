"use strict";
/**
 * Rate Limiter for Public API
 *
 * Implements sliding window rate limiting with per-tier configurations.
 * Returns standard rate limit headers for API responses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports._testing = exports.RATE_LIMIT_CONFIGS = void 0;
exports.checkRateLimit = checkRateLimit;
exports.checkSandboxLimit = checkSandboxLimit;
exports.consumeRateLimit = consumeRateLimit;
exports.getRateLimitStatus = getRateLimitStatus;
exports.getRateLimitHeaders = getRateLimitHeaders;
exports.getTierConfig = getTierConfig;
exports.getMaxFileSize = getMaxFileSize;
exports.getMaxCommandTimeout = getMaxCommandTimeout;
exports.getMaxSandboxDuration = getMaxSandboxDuration;
exports.checkSlidingWindowLimit = checkSlidingWindowLimit;
exports.cleanupSlidingWindows = cleanupSlidingWindows;
exports.checkTokenBucket = checkTokenBucket;
const api_keys_js_1 = require("./api-keys.js");
// ==================== Rate Limit Configurations ====================
/**
 * Rate limit configurations per tier
 */
exports.RATE_LIMIT_CONFIGS = {
    free: {
        requestsPerMinute: 30,
        requestsPerHour: 500,
        requestsPerDay: 2000,
        maxConcurrentSandboxes: 2,
        maxSandboxDurationSeconds: 1800, // 30 minutes
        maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB
        maxCommandTimeoutSeconds: 30,
    },
    developer: {
        requestsPerMinute: 100,
        requestsPerHour: 2000,
        requestsPerDay: 10000,
        maxConcurrentSandboxes: 5,
        maxSandboxDurationSeconds: 3600, // 1 hour
        maxFileSizeBytes: 25 * 1024 * 1024, // 25 MB
        maxCommandTimeoutSeconds: 60,
    },
    team: {
        requestsPerMinute: 300,
        requestsPerHour: 6000,
        requestsPerDay: 50000,
        maxConcurrentSandboxes: 20,
        maxSandboxDurationSeconds: 7200, // 2 hours
        maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
        maxCommandTimeoutSeconds: 300,
    },
    enterprise: {
        requestsPerMinute: 1000,
        requestsPerHour: 30000,
        requestsPerDay: 500000,
        maxConcurrentSandboxes: 100,
        maxSandboxDurationSeconds: 86400, // 24 hours
        maxFileSizeBytes: 500 * 1024 * 1024, // 500 MB
        maxCommandTimeoutSeconds: 600,
    },
};
// ==================== Rate Limiting Functions ====================
/**
 * Check rate limit for an API key
 *
 * @param apiKey - The API key to check
 * @returns Rate limit result
 */
function checkRateLimit(apiKey) {
    const config = exports.RATE_LIMIT_CONFIGS[apiKey.tier];
    const usage = (0, api_keys_js_1.getUsage)(apiKey.id);
    if (!usage) {
        // No usage tracked yet - allow
        return {
            allowed: true,
            limit: config.requestsPerMinute,
            remaining: config.requestsPerMinute - 1,
            resetAt: Date.now() + 60000,
        };
    }
    const now = Date.now();
    // Check minute limit (most restrictive first)
    if (usage.minuteCount >= config.requestsPerMinute) {
        const retryAfterSeconds = Math.ceil((usage.minuteReset - now) / 1000);
        return {
            allowed: false,
            limit: config.requestsPerMinute,
            remaining: 0,
            resetAt: usage.minuteReset,
            window: 'minute',
            retryAfterSeconds: Math.max(1, retryAfterSeconds),
        };
    }
    // Check hour limit
    if (usage.hourCount >= config.requestsPerHour) {
        const retryAfterSeconds = Math.ceil((usage.hourReset - now) / 1000);
        return {
            allowed: false,
            limit: config.requestsPerHour,
            remaining: 0,
            resetAt: usage.hourReset,
            window: 'hour',
            retryAfterSeconds: Math.max(1, retryAfterSeconds),
        };
    }
    // Check day limit
    if (usage.dayCount >= config.requestsPerDay) {
        const retryAfterSeconds = Math.ceil((usage.dayReset - now) / 1000);
        return {
            allowed: false,
            limit: config.requestsPerDay,
            remaining: 0,
            resetAt: usage.dayReset,
            window: 'day',
            retryAfterSeconds: Math.max(1, retryAfterSeconds),
        };
    }
    // All limits OK
    return {
        allowed: true,
        limit: config.requestsPerMinute,
        remaining: config.requestsPerMinute - usage.minuteCount - 1,
        resetAt: usage.minuteReset,
    };
}
/**
 * Check if a new sandbox can be created
 */
function checkSandboxLimit(apiKey) {
    const config = exports.RATE_LIMIT_CONFIGS[apiKey.tier];
    const activeCount = (0, api_keys_js_1.getActiveSandboxCount)(apiKey.id);
    if (activeCount >= config.maxConcurrentSandboxes) {
        return {
            allowed: false,
            limit: config.maxConcurrentSandboxes,
            remaining: 0,
            resetAt: Date.now(), // No specific reset time for concurrent limit
            window: 'concurrent',
            retryAfterSeconds: 60, // Suggest retry in 60s
        };
    }
    return {
        allowed: true,
        limit: config.maxConcurrentSandboxes,
        remaining: config.maxConcurrentSandboxes - activeCount - 1,
        resetAt: Date.now(),
    };
}
/**
 * Consume a rate limit token and return updated status
 */
function consumeRateLimit(apiKey) {
    // Track usage first
    const currentUsage = (0, api_keys_js_1.trackUsage)(apiKey.id);
    // Then check limits
    const config = exports.RATE_LIMIT_CONFIGS[apiKey.tier];
    const usage = (0, api_keys_js_1.getUsage)(apiKey.id);
    if (!usage) {
        return {
            allowed: true,
            limit: config.requestsPerMinute,
            remaining: config.requestsPerMinute - 1,
            resetAt: Date.now() + 60000,
        };
    }
    // Return minute-based limits (most common)
    return {
        allowed: true,
        limit: config.requestsPerMinute,
        remaining: Math.max(0, config.requestsPerMinute - usage.minuteCount),
        resetAt: usage.minuteReset,
    };
}
/**
 * Get rate limit status for an API key
 */
function getRateLimitStatus(apiKey) {
    const config = exports.RATE_LIMIT_CONFIGS[apiKey.tier];
    const usage = (0, api_keys_js_1.getUsage)(apiKey.id);
    const now = Date.now();
    const defaultUsage = {
        minuteCount: 0,
        minuteReset: now + 60000,
        hourCount: 0,
        hourReset: now + 3600000,
        dayCount: 0,
        dayReset: now + 86400000,
    };
    const currentUsage = usage || defaultUsage;
    const activeCount = (0, api_keys_js_1.getActiveSandboxCount)(apiKey.id);
    return {
        minute: {
            limit: config.requestsPerMinute,
            remaining: Math.max(0, config.requestsPerMinute - currentUsage.minuteCount),
            resetAt: currentUsage.minuteReset,
            window: 'minute',
        },
        hour: {
            limit: config.requestsPerHour,
            remaining: Math.max(0, config.requestsPerHour - currentUsage.hourCount),
            resetAt: currentUsage.hourReset,
            window: 'hour',
        },
        day: {
            limit: config.requestsPerDay,
            remaining: Math.max(0, config.requestsPerDay - currentUsage.dayCount),
            resetAt: currentUsage.dayReset,
            window: 'day',
        },
        sandboxes: {
            limit: config.maxConcurrentSandboxes,
            used: activeCount,
            remaining: Math.max(0, config.maxConcurrentSandboxes - activeCount),
        },
    };
}
/**
 * Generate rate limit headers for HTTP response
 */
function getRateLimitHeaders(result) {
    return {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': Math.max(0, result.remaining).toString(),
        'X-RateLimit-Reset': Math.floor(result.resetAt / 1000).toString(),
        'X-RateLimit-Window': result.window || 'minute',
    };
}
/**
 * Get configuration for a tier
 */
function getTierConfig(tier) {
    return exports.RATE_LIMIT_CONFIGS[tier];
}
/**
 * Get max file size for a tier
 */
function getMaxFileSize(tier) {
    return exports.RATE_LIMIT_CONFIGS[tier].maxFileSizeBytes;
}
/**
 * Get max command timeout for a tier
 */
function getMaxCommandTimeout(tier) {
    return exports.RATE_LIMIT_CONFIGS[tier].maxCommandTimeoutSeconds;
}
/**
 * Get max sandbox duration for a tier
 */
function getMaxSandboxDuration(tier) {
    return exports.RATE_LIMIT_CONFIGS[tier].maxSandboxDurationSeconds;
}
const slidingWindows = new Map();
/**
 * Check rate limit using sliding window algorithm
 *
 * @param key - Unique key for the limit (e.g., `${keyId}:endpoint`)
 * @param limit - Maximum requests in window
 * @param windowMs - Window duration in milliseconds
 * @returns Whether the request is allowed and remaining count
 */
function checkSlidingWindowLimit(key, limit, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    // Get or create window entries
    let entries = slidingWindows.get(key) || [];
    // Remove expired entries
    entries = entries.filter(entry => entry.timestamp > windowStart);
    // Calculate current count (with weights for smooth sliding)
    const count = entries.reduce((sum, entry) => {
        // Weight older entries less
        const age = now - entry.timestamp;
        const weight = 1 - (age / windowMs);
        return sum + (entry.weight * weight);
    }, 0);
    if (count >= limit) {
        // Find when the oldest significant entry expires
        const oldestEntry = entries[0];
        const resetAt = oldestEntry ? oldestEntry.timestamp + windowMs : now + windowMs;
        return {
            allowed: false,
            remaining: 0,
            resetAt,
        };
    }
    // Add new entry
    entries.push({ timestamp: now, weight: 1 });
    slidingWindows.set(key, entries);
    return {
        allowed: true,
        remaining: Math.floor(limit - count - 1),
        resetAt: now + windowMs,
    };
}
/**
 * Clean up old sliding window entries
 * Call periodically to prevent memory growth
 */
function cleanupSlidingWindows(maxAge = 86400000) {
    const now = Date.now();
    const cutoff = now - maxAge;
    for (const [key, entries] of slidingWindows.entries()) {
        const filtered = entries.filter(entry => entry.timestamp > cutoff);
        if (filtered.length === 0) {
            slidingWindows.delete(key);
        }
        else {
            slidingWindows.set(key, filtered);
        }
    }
}
// Run cleanup every hour
setInterval(() => cleanupSlidingWindows(), 3600000);
const tokenBuckets = new Map();
/**
 * Check if request is allowed using token bucket
 * Good for allowing bursts while maintaining average rate
 */
function checkTokenBucket(key, maxTokens, refillRate, tokensRequired = 1) {
    const now = Date.now();
    let bucket = tokenBuckets.get(key);
    if (!bucket) {
        bucket = {
            tokens: maxTokens,
            lastRefill: now,
            maxTokens,
            refillRate,
        };
        tokenBuckets.set(key, bucket);
    }
    // Refill tokens based on time passed
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = timePassed * bucket.refillRate;
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    // Check if enough tokens
    if (bucket.tokens < tokensRequired) {
        return {
            allowed: false,
            tokensRemaining: Math.floor(bucket.tokens),
        };
    }
    // Consume tokens
    bucket.tokens -= tokensRequired;
    return {
        allowed: true,
        tokensRemaining: Math.floor(bucket.tokens),
    };
}
// Export for testing
exports._testing = {
    slidingWindows,
    tokenBuckets,
    clearAll: () => {
        slidingWindows.clear();
        tokenBuckets.clear();
    },
};
