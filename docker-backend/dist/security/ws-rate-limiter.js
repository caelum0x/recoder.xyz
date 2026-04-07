"use strict";
/**
 * WebSocket Rate Limiter
 *
 * Per-connection message rate limiting for WebSocket handlers.
 * Prevents abuse by limiting the number of messages a single
 * WebSocket connection can send within a sliding time window.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsRateLimiter = exports.WS_RATE_LIMITS = void 0;
exports.getWsRateLimiter = getWsRateLimiter;
exports.getAllWsRateLimitStats = getAllWsRateLimitStats;
// ==================== Default Configs ====================
exports.WS_RATE_LIMITS = {
    terminal: {
        maxMessages: 200,
        windowMs: 10_000,
        onExceeded: 'drop',
    },
    sync: {
        maxMessages: 100,
        windowMs: 10_000,
        onExceeded: 'warn',
    },
    'cli-sync': {
        maxMessages: 100,
        windowMs: 10_000,
        onExceeded: 'warn',
    },
    watch: {
        maxMessages: 50,
        windowMs: 10_000,
        onExceeded: 'drop',
    },
    'build-errors': {
        maxMessages: 50,
        windowMs: 10_000,
        onExceeded: 'drop',
    },
    debug: {
        maxMessages: 50,
        windowMs: 10_000,
        onExceeded: 'drop',
    },
    'agent-bridge': {
        maxMessages: 60,
        windowMs: 10_000,
        onExceeded: 'warn',
    },
};
// ==================== WsRateLimiter ====================
class WsRateLimiter {
    connections = new Map();
    config;
    endpoint;
    constructor(endpoint, config) {
        this.endpoint = endpoint;
        const defaults = exports.WS_RATE_LIMITS[endpoint] || {
            maxMessages: 100,
            windowMs: 10_000,
            onExceeded: 'drop',
        };
        this.config = { ...defaults, ...config };
    }
    /**
     * Track a connection for rate limiting.
     * Call this when a WS connection is established.
     */
    track(ws) {
        this.connections.set(ws, {
            timestamps: [],
            warnings: 0,
            blocked: false,
        });
        ws.on('close', () => {
            this.connections.delete(ws);
        });
    }
    /**
     * Check if a message from this connection should be allowed.
     * Returns true if allowed, false if rate limited.
     */
    allowMessage(ws) {
        const tracker = this.connections.get(ws);
        if (!tracker) {
            // Not tracked - allow but start tracking
            this.track(ws);
            return true;
        }
        if (tracker.blocked) {
            return false;
        }
        const now = Date.now();
        const windowStart = now - this.config.windowMs;
        // Remove timestamps outside the window
        tracker.timestamps = tracker.timestamps.filter(t => t > windowStart);
        // Check if within limit
        if (tracker.timestamps.length >= this.config.maxMessages) {
            tracker.warnings++;
            if (this.config.onExceeded === 'close' || tracker.warnings >= 5) {
                tracker.blocked = true;
                console.warn(`[WS Rate Limit] Closing ${this.endpoint} connection: ${tracker.timestamps.length} msgs in ${this.config.windowMs}ms (warnings: ${tracker.warnings})`);
                try {
                    ws.close(this.config.closeCode || 1008, this.config.closeReason || 'Rate limit exceeded');
                }
                catch {
                    // Connection may already be closed
                }
                return false;
            }
            if (tracker.warnings === 1 || tracker.warnings % 3 === 0) {
                console.warn(`[WS Rate Limit] ${this.endpoint}: ${tracker.timestamps.length} msgs in ${this.config.windowMs}ms (warning ${tracker.warnings})`);
            }
            // 'close' is already handled above, so this only checks for 'drop' vs 'warn'
            return this.config.onExceeded === 'warn';
        }
        tracker.timestamps.push(now);
        return true;
    }
    /**
     * Get rate limit stats for monitoring.
     */
    getStats() {
        return {
            activeConnections: this.connections.size,
            endpoint: this.endpoint,
            config: this.config,
        };
    }
    /**
     * Remove tracking for a connection.
     */
    untrack(ws) {
        this.connections.delete(ws);
    }
}
exports.WsRateLimiter = WsRateLimiter;
// ==================== Per-endpoint instances ====================
const rateLimiters = new Map();
/**
 * Get or create a rate limiter for a specific endpoint.
 */
function getWsRateLimiter(endpoint, config) {
    let limiter = rateLimiters.get(endpoint);
    if (!limiter) {
        limiter = new WsRateLimiter(endpoint, config);
        rateLimiters.set(endpoint, limiter);
    }
    return limiter;
}
/**
 * Get stats for all WebSocket rate limiters.
 */
function getAllWsRateLimitStats() {
    const stats = {};
    for (const [endpoint, limiter] of rateLimiters) {
        stats[endpoint] = limiter.getStats();
    }
    return stats;
}
