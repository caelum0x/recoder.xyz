"use strict";
/**
 * @module rate-limiter.service
 *
 * Sliding-window rate limiter for A2A adapter operations.
 *
 * Provides an in-memory rate limiting service (no Redis dependency) that
 * tracks per-key request rates and concurrent request counts. Includes an
 * Express middleware factory for easy integration with adapter routes.
 *
 * Features:
 * - Sliding window algorithm with configurable window size
 * - Concurrent request tracking (start/end lifecycle)
 * - Per-key configuration overrides
 * - Summary/metrics for observability
 * - Express middleware with standard rate limit headers
 *
 * P17-016: Adapter-level rate limiting & quota enforcement
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2ARateLimiter = exports.DEFAULT_AGENT_LIMITS = exports.DEFAULT_ADAPTER_LIMITS = void 0;
exports.getA2ARateLimiter = getA2ARateLimiter;
exports.resetA2ARateLimiter = resetA2ARateLimiter;
exports.createRateLimitMiddleware = createRateLimitMiddleware;
const a2a_1 = require("@recoder/shared/a2a");
// ---------------------------------------------------------------------------
// Default configs
// ---------------------------------------------------------------------------
exports.DEFAULT_ADAPTER_LIMITS = {
    maxRequests: 100, // 100 requests per minute
    windowMs: 60_000, // 1 minute window
    maxConcurrent: 10, // Max 10 concurrent
};
exports.DEFAULT_AGENT_LIMITS = {
    maxRequests: 200, // 200 requests per minute per agent
    windowMs: 60_000,
    maxConcurrent: 20,
};
// ---------------------------------------------------------------------------
// A2ARateLimiter
// ---------------------------------------------------------------------------
class A2ARateLimiter {
    entries = new Map();
    configs = new Map();
    totalChecks = 0;
    totalAllowed = 0;
    totalDenied = 0;
    /** Set config for a specific key (e.g., 'adapter:rest-1' or 'agent:claude-connector'). */
    setConfig(key, config) {
        this.configs.set(key, { ...config });
    }
    /** Resolve the config for a given key, falling back to defaults. */
    getConfig(key) {
        return this.configs.get(key) ?? exports.DEFAULT_ADAPTER_LIMITS;
    }
    /** Get or create an entry for a key. */
    getEntry(key) {
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { timestamps: [], concurrent: 0 };
            this.entries.set(key, entry);
        }
        return entry;
    }
    /** Remove expired timestamps from the entry's sliding window. */
    cleanExpired(entry, windowMs, now) {
        const cutoff = now - windowMs;
        // Since timestamps are inserted in order, find the first valid index
        let firstValid = 0;
        while (firstValid < entry.timestamps.length && entry.timestamps[firstValid] <= cutoff) {
            firstValid++;
        }
        if (firstValid > 0) {
            entry.timestamps = entry.timestamps.slice(firstValid);
        }
    }
    /**
     * Check if a request is allowed for the given key.
     * If allowed, the current timestamp is recorded in the sliding window.
     */
    checkLimit(key) {
        const now = Date.now();
        const config = this.getConfig(key);
        const entry = this.getEntry(key);
        this.cleanExpired(entry, config.windowMs, now);
        this.totalChecks++;
        // Check rate limit
        if (entry.timestamps.length >= config.maxRequests) {
            this.totalDenied++;
            const oldestTs = entry.timestamps[0];
            const resetAtMs = oldestTs + config.windowMs;
            const retryAfterMs = Math.max(0, resetAtMs - now);
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(resetAtMs).toISOString(),
                retryAfterMs,
                currentConcurrent: entry.concurrent,
            };
        }
        // Check concurrent limit (0 means unlimited)
        if (config.maxConcurrent > 0 && entry.concurrent >= config.maxConcurrent) {
            this.totalDenied++;
            // For concurrent denial, reset is when the window expires
            const resetAtMs = entry.timestamps.length > 0
                ? entry.timestamps[0] + config.windowMs
                : now + config.windowMs;
            const retryAfterMs = 1_000; // Suggest retry in 1s for concurrent limit
            return {
                allowed: false,
                remaining: Math.max(0, config.maxRequests - entry.timestamps.length),
                resetAt: new Date(resetAtMs).toISOString(),
                retryAfterMs,
                currentConcurrent: entry.concurrent,
            };
        }
        // Allowed: record the timestamp
        entry.timestamps.push(now);
        this.totalAllowed++;
        const remaining = config.maxRequests - entry.timestamps.length;
        const resetAtMs = entry.timestamps[0] + config.windowMs;
        return {
            allowed: true,
            remaining,
            resetAt: new Date(resetAtMs).toISOString(),
            currentConcurrent: entry.concurrent,
        };
    }
    /** Record that a concurrent request started for the given key. */
    startRequest(key) {
        const entry = this.getEntry(key);
        entry.concurrent++;
    }
    /** Record that a concurrent request ended for the given key. */
    endRequest(key) {
        const entry = this.getEntry(key);
        entry.concurrent = Math.max(0, entry.concurrent - 1);
    }
    /** Get current rate limit status for a key (without recording a request). */
    getStatus(key) {
        const now = Date.now();
        const config = this.getConfig(key);
        const entry = this.getEntry(key);
        this.cleanExpired(entry, config.windowMs, now);
        const remaining = Math.max(0, config.maxRequests - entry.timestamps.length);
        const resetAtMs = entry.timestamps.length > 0
            ? entry.timestamps[0] + config.windowMs
            : now + config.windowMs;
        const allowed = entry.timestamps.length < config.maxRequests
            && (config.maxConcurrent === 0 || entry.concurrent < config.maxConcurrent);
        const result = {
            allowed,
            remaining,
            resetAt: new Date(resetAtMs).toISOString(),
            currentConcurrent: entry.concurrent,
        };
        if (!allowed) {
            if (entry.timestamps.length >= config.maxRequests) {
                result.retryAfterMs = Math.max(0, resetAtMs - now);
            }
            else {
                result.retryAfterMs = 1_000;
            }
        }
        return result;
    }
    /** Get summary of all rate limits. */
    getSummary() {
        const now = Date.now();
        const byKey = {};
        for (const [key, entry] of this.entries) {
            const config = this.getConfig(key);
            this.cleanExpired(entry, config.windowMs, now);
            byKey[key] = {
                key,
                requestsInWindow: entry.timestamps.length,
                concurrent: entry.concurrent,
                config: { ...config },
            };
        }
        return {
            totalChecks: this.totalChecks,
            totalAllowed: this.totalAllowed,
            totalDenied: this.totalDenied,
            byKey,
        };
    }
    /** Reset all state. */
    reset() {
        this.entries.clear();
        this.configs.clear();
        this.totalChecks = 0;
        this.totalAllowed = 0;
        this.totalDenied = 0;
    }
}
exports.A2ARateLimiter = A2ARateLimiter;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let singleton = null;
function getA2ARateLimiter() {
    if (!singleton) {
        singleton = new A2ARateLimiter();
    }
    return singleton;
}
function resetA2ARateLimiter() {
    if (singleton) {
        singleton.reset();
    }
    singleton = null;
}
// ---------------------------------------------------------------------------
// Express middleware factory
// ---------------------------------------------------------------------------
/**
 * Create an Express middleware that enforces rate limits using the A2A
 * rate limiter singleton.
 *
 * @param keyExtractor - A function that extracts the rate limit key from the
 *   incoming request (e.g., `(req) => \`adapter:\${req.params.adapterId}\``).
 * @param config - Optional per-key rate limit config. If provided, the
 *   config is set on the singleton for the extracted key.
 * @returns An Express request handler.
 */
function createRateLimitMiddleware(keyExtractor, config) {
    return (req, res, next) => {
        const limiter = getA2ARateLimiter();
        const key = keyExtractor(req);
        // Apply config if provided (idempotent -- same config object each time)
        if (config) {
            limiter.setConfig(key, config);
        }
        const result = limiter.checkLimit(key);
        if (result.allowed) {
            // Set standard rate limit response headers
            res.setHeader('X-RateLimit-Limit', limiter['getConfig'](key).maxRequests.toString());
            res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
            res.setHeader('X-RateLimit-Reset', result.resetAt);
            // Track concurrent request lifecycle
            limiter.startRequest(key);
            res.on('finish', () => {
                limiter.endRequest(key);
            });
            next();
            return;
        }
        // Denied: return 429
        const retryAfterSeconds = Math.ceil((result.retryAfterMs ?? 1_000) / 1_000);
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        res.setHeader('X-RateLimit-Limit', limiter['getConfig'](key).maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', result.resetAt);
        const error = (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.RateLimitExceeded,
            message: `Rate limit exceeded for key: ${key}. Retry after ${retryAfterSeconds}s.`,
            details: {
                key,
                retryAfterMs: result.retryAfterMs,
                resetAt: result.resetAt,
            },
        });
        res.status(429).json({ success: false, error });
    };
}
