/**
 * WebSocket Rate Limiter
 *
 * Per-connection message rate limiting for WebSocket handlers.
 * Prevents abuse by limiting the number of messages a single
 * WebSocket connection can send within a sliding time window.
 */

import WebSocket from 'ws';

// ==================== Types ====================

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

interface ConnectionTracker {
  timestamps: number[];
  warnings: number;
  blocked: boolean;
}

// ==================== Default Configs ====================

export const WS_RATE_LIMITS: Record<string, WsRateLimitConfig> = {
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

export class WsRateLimiter {
  private connections = new Map<WebSocket, ConnectionTracker>();
  private config: WsRateLimitConfig;
  private endpoint: string;

  constructor(endpoint: string, config?: Partial<WsRateLimitConfig>) {
    this.endpoint = endpoint;
    const defaults = WS_RATE_LIMITS[endpoint] || {
      maxMessages: 100,
      windowMs: 10_000,
      onExceeded: 'drop' as const,
    };
    this.config = { ...defaults, ...config };
  }

  /**
   * Track a connection for rate limiting.
   * Call this when a WS connection is established.
   */
  track(ws: WebSocket): void {
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
  allowMessage(ws: WebSocket): boolean {
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
        console.warn(
          `[WS Rate Limit] Closing ${this.endpoint} connection: ${tracker.timestamps.length} msgs in ${this.config.windowMs}ms (warnings: ${tracker.warnings})`
        );
        try {
          ws.close(
            this.config.closeCode || 1008,
            this.config.closeReason || 'Rate limit exceeded'
          );
        } catch {
          // Connection may already be closed
        }
        return false;
      }

      if (tracker.warnings === 1 || tracker.warnings % 3 === 0) {
        console.warn(
          `[WS Rate Limit] ${this.endpoint}: ${tracker.timestamps.length} msgs in ${this.config.windowMs}ms (warning ${tracker.warnings})`
        );
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
  getStats(): {
    activeConnections: number;
    endpoint: string;
    config: WsRateLimitConfig;
  } {
    return {
      activeConnections: this.connections.size,
      endpoint: this.endpoint,
      config: this.config,
    };
  }

  /**
   * Remove tracking for a connection.
   */
  untrack(ws: WebSocket): void {
    this.connections.delete(ws);
  }
}

// ==================== Per-endpoint instances ====================

const rateLimiters = new Map<string, WsRateLimiter>();

/**
 * Get or create a rate limiter for a specific endpoint.
 */
export function getWsRateLimiter(endpoint: string, config?: Partial<WsRateLimitConfig>): WsRateLimiter {
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
export function getAllWsRateLimitStats() {
  const stats: Record<string, ReturnType<WsRateLimiter['getStats']>> = {};
  for (const [endpoint, limiter] of rateLimiters) {
    stats[endpoint] = limiter.getStats();
  }
  return stats;
}
