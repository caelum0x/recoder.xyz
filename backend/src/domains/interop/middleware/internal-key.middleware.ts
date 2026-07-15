/**
 * `internal-key.middleware` — the single `/internal/*` gate (conflict #10: ONE
 * internal-key gate). Service-to-service callers must present a valid
 * `INTERNAL_SERVICE_KEY`; the compare is CONSTANT-TIME and length-safe.
 *
 * Fail-closed: an UNCONFIGURED gate (no key in config) denies with 503 rather
 * than opening internal routes; a missing/mismatched key denies with 401. The
 * key value is never logged and never echoed in an error.
 *
 * (Ported from `a2a/bridge-auth.ts`'s constant-time bearer check, generalized to
 * the `x-internal-service-key` header + `Authorization: Bearer` fallback.)
 */
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ErrorCode, createError, sendError } from '../../../shared/errors.js';

export interface InternalKeyGateConfig {
  /** The expected internal-service key; `null`/empty -> gate is unconfigured (denies). */
  readonly internalServiceKey: string | null;
}

/** Extract the presented key from the internal header or a Bearer authorization. */
function presentedKey(req: Request): string | null {
  const direct = req.headers['x-internal-service-key'];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  if (Array.isArray(direct) && direct.length > 0) return direct[0];
  const auth = req.headers.authorization;
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

/** Constant-time, length-safe equality (never short-circuits on length). */
function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a compare against a same-length buffer to avoid leaking length
    // via timing, then return false.
    timingSafeEqual(ab, Buffer.alloc(ab.length));
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Build the `/internal/*` guard. Mount it in the edge route table on every
 * `/internal/*` router (in addition to `interopGuard`).
 */
export function internalServiceGuard(config: InternalKeyGateConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expected = config.internalServiceKey;
    if (!expected) {
      // Fail-closed: an unconfigured gate denies rather than opening internal routes.
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Internal service gate not configured.'));
      return;
    }
    const provided = presentedKey(req);
    if (!provided || !constantTimeEquals(provided, expected)) {
      sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Invalid internal service key.'));
      return;
    }
    next();
  };
}
