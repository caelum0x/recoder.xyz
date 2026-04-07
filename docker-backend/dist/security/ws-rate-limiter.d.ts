/**
 * WebSocket Rate Limiter
 *
 * Per-connection message rate limiting for WebSocket handlers.
 * Prevents abuse by limiting the number of messages a single
 * WebSocket connection can send within a sliding time window.
 */
import WebSocket from 'ws';
export interface WsRateLimitConfig {
    /** Max messages per window (default: 100) */
    maxMessages: number;
    /** Window duration in ms (default: 10000 = 10s) */
    windowMs: number;
    /** Action on limit exceeded */
    onExceeded?: 'warn' | 'close' | 'drop';
    /** Close code when closing the connection (default: 1008) */
    closeCode?: number;
    /** Close reason message */
    closeReason?: string;
}
export declare const WS_RATE_LIMITS: Record<string, WsRateLimitConfig>;
export declare class WsRateLimiter {
    private connections;
    private config;
    private endpoint;
    constructor(endpoint: string, config?: Partial<WsRateLimitConfig>);
    /**
     * Track a connection for rate limiting.
     * Call this when a WS connection is established.
     */
    track(ws: WebSocket): void;
    /**
     * Check if a message from this connection should be allowed.
     * Returns true if allowed, false if rate limited.
     */
    allowMessage(ws: WebSocket): boolean;
    /**
     * Get rate limit stats for monitoring.
     */
    getStats(): {
        activeConnections: number;
        endpoint: string;
        config: WsRateLimitConfig;
    };
    /**
     * Remove tracking for a connection.
     */
    untrack(ws: WebSocket): void;
}
/**
 * Get or create a rate limiter for a specific endpoint.
 */
export declare function getWsRateLimiter(endpoint: string, config?: Partial<WsRateLimitConfig>): WsRateLimiter;
/**
 * Get stats for all WebSocket rate limiters.
 */
export declare function getAllWsRateLimitStats(): Record<string, {
    activeConnections: number;
    endpoint: string;
    config: WsRateLimitConfig;
}>;
