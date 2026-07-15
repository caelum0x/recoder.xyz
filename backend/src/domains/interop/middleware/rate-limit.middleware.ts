/**
 * `rate-limit.middleware` — token-bucket / sliding-window rate limit + abuse
 * prevention (conflict #10: ONE rate-limit gate alongside the internal-key gate).
 *
 * CONSUMES the ported sliding-window limiter (`a2a/rate-limiter.service.ts`
 * `A2ARateLimiter`) for the counting algorithm, but emits the CANONICAL error
 * envelope (`429 RATE_LIMITED`) rather than the legacy A2A error, and keys by the
 * resolved `Principal` (falling back to IP) + route surface.
 *
 * Posture (per the governance doc): an EXCEEDED limit always returns 429. An
 * evaluator FAULT is fail-OPEN for reads (availability) and fail-CLOSED for
 * writes (a write must not slip past a broken limiter).
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ErrorCode, createError, sendError } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import { A2ARateLimiter, type RateLimitConfig } from '../../../a2a/rate-limiter.service.js';

/** HTTP methods that mutate state (fail-CLOSED when the limiter faults). */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RateLimitMiddlewareDeps {
  /** The bucket applied to the extracted key. */
  readonly config: RateLimitConfig;
  /** A shared limiter instance (inject one per surface); a private one is created if omitted. */
  readonly limiter?: A2ARateLimiter;
  /** Extract the rate-limit key. Default: `<principal.userId|ip>:<baseUrl>`. */
  readonly keyOf?: (req: Request) => string;
  /** Override write detection (defaults to the HTTP method). */
  readonly isWriteOf?: (req: Request) => boolean;
  readonly logger?: Logger;
}

function defaultKey(req: Request): string {
  const actor = req.principal?.userId ?? req.ip ?? 'anonymous';
  return `${actor}:${req.baseUrl || req.path}`;
}

/** Build the rate-limit middleware bound to a bucket + (optional) shared limiter. */
export function createRateLimitMiddleware(deps: RateLimitMiddlewareDeps): RequestHandler {
  const limiter = deps.limiter ?? new A2ARateLimiter();

  return (req: Request, res: Response, next: NextFunction): void => {
    const isWrite = deps.isWriteOf ? deps.isWriteOf(req) : WRITE_METHODS.has(req.method.toUpperCase());
    const key = deps.keyOf ? deps.keyOf(req) : defaultKey(req);

    let result;
    try {
      limiter.setConfig(key, deps.config);
      result = limiter.checkLimit(key);
    } catch (err) {
      // Limiter fault: fail-OPEN for reads, fail-CLOSED for writes.
      deps.logger?.error(
        { err: err instanceof Error ? err.message : String(err), key },
        'rate limiter faulted',
      );
      if (isWrite) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Rate limiter unavailable.'));
        return;
      }
      next();
      return;
    }

    res.setHeader('X-RateLimit-Limit', String(deps.config.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.retryAfterMs ?? 1_000) / 1_000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      sendError(
        res,
        createError(ErrorCode.RATE_LIMITED, `Rate limit exceeded. Retry after ${retryAfterSeconds}s.`, {
          details: { resetAt: result.resetAt },
        }),
      );
      return;
    }

    // Track concurrent request lifecycle so `maxConcurrent` is enforced.
    limiter.startRequest(key);
    res.on('finish', () => limiter.endRequest(key));
    next();
  };
}
