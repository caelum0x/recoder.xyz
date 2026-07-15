/**
 * HTTP rate-limit tiers + the WS per-connection limiter binding.
 *
 * CONSUMES the interop rate-limit middleware (`createRateLimitMiddleware`, conflict
 * #10: ONE rate-limit gate) so the counting algorithm + the canonical `429`
 * envelope + the read-open/write-closed fault posture are NOT duplicated here.
 * This module only binds the three EDGE tiers (`api` global, `heavy` for
 * container/expensive ops, `auth` for auth-sensitive routes) to distinct buckets
 * over ONE shared limiter instance, keying by resolved principal → IP and
 * NAMESPACING the key by tier so the tiers never collide.
 *
 * `wsRateLimit` reuses the same sliding-window limiter for per-connection WS frame
 * budgeting (bound by the upgrade router / socket backends).
 */
import type { RequestHandler } from 'express';
import type { Logger } from '../../shared/logger.js';
import { A2ARateLimiter, type RateLimitConfig } from '../../domains/interop/rate-limiter.service.js';
import { createRateLimitMiddleware } from '../../domains/interop/middleware/rate-limit.middleware.js';
import type { EdgeConfig, RateTierConfig } from '../../domains/edge/config.js';
import type { RateTier } from '../../domains/edge/types.js';

/** The three bound HTTP tier middlewares. */
export interface HttpRateLimiters {
  readonly api: RequestHandler;
  readonly heavy: RequestHandler;
  readonly auth: RequestHandler;
}

function toConfig(tier: RateTierConfig): RateLimitConfig {
  return { maxRequests: tier.maxRequests, windowMs: tier.windowMs, maxConcurrent: tier.maxConcurrent };
}

/**
 * Build the three HTTP rate-limit tiers over one shared limiter. Keys are
 * `<tier>:<userId|ip>:<baseUrl>` so a request that flows through both the global
 * `api` tier and a per-mount `heavy`/`auth` tier is counted independently.
 */
export function httpRateLimiters(cfg: EdgeConfig['rateLimit'], logger: Logger): HttpRateLimiters {
  const limiter = new A2ARateLimiter();
  const tier = (name: RateTier, bucket: RateTierConfig): RequestHandler =>
    createRateLimitMiddleware({
      config: toConfig(bucket),
      limiter,
      logger,
      keyOf: (req) => `${name}:${req.principal?.userId ?? req.ip ?? 'anonymous'}:${req.baseUrl || req.path}`,
    });
  return {
    api: tier('api', cfg.api),
    heavy: tier('heavy', cfg.heavy),
    auth: tier('auth', cfg.auth),
  };
}

/** A per-connection WS frame budget check (fail-open never applies — a WS frame is a write). */
export interface WsRateLimiter {
  /** Returns `true` when the frame is within budget; `false` ⇒ the caller should close/drop. */
  allow(connectionKey: string): boolean;
  /** Release a connection's window when it disconnects. */
  release(connectionKey: string): void;
}

/**
 * Bind a WS frame limiter to the edge WS config. Consumed by the upgrade router /
 * socket backends to bound inbound frames per connection.
 */
export function wsRateLimit(cfg: EdgeConfig['ws']): WsRateLimiter {
  const limiter = new A2ARateLimiter();
  const config: RateLimitConfig = {
    maxRequests: cfg.maxFramesPerWindow,
    windowMs: cfg.frameWindowMs,
    maxConcurrent: 0,
  };
  return {
    allow(connectionKey: string): boolean {
      limiter.setConfig(connectionKey, config);
      return limiter.checkLimit(connectionKey).allowed;
    },
    release(connectionKey: string): void {
      limiter.endRequest(connectionKey);
    },
  };
}
