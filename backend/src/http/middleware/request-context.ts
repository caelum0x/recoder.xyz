/**
 * The FIRST link of the edge chain: request identity + observability. Replaces
 * the inline `requestIdMiddleware` + `metricsMiddleware` from the legacy
 * `server.ts`.
 *
 * For every inbound request it:
 *  - assigns/propagates an `x-request-id` (honours a client-supplied one when
 *    present, else mints a uuid) and echoes it on the response,
 *  - propagates the W3C `traceparent` when present (opaque pass-through),
 *  - binds a child `@recoder/logger` (`{ domain:'edge', requestId }`) onto
 *    `req.log` so downstream handlers log with correlation,
 *  - emits a structured start log and, on `finish`, a finish log with status +
 *    latency (the metrics hook).
 *
 * It never throws and never blocks — pure context assignment.
 */
import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Logger } from '../../shared/logger.js';

// --- Express request augmentation: correlation id + bound child logger + trace. ---
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      /** Child logger bound to `{ domain:'edge', requestId }`. */
      log?: Logger;
      /** W3C trace context propagated from the caller, when present. */
      traceparent?: string;
    }
  }
}

export interface RequestContextDeps {
  readonly logger: Logger;
}

/** The correlation context bound onto each request. */
export interface RequestCtx {
  readonly requestId: string;
  readonly log: Logger;
  readonly traceparent?: string;
}

/** Read a single header value (first when repeated). */
function header(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Build the request-context middleware. Mount it FIRST so every later middleware
 * (including cors + error) has `req.requestId` + `req.log`.
 */
export function requestContext(deps: RequestContextDeps): RequestHandler {
  return (req, res, next) => {
    const requestId = header(req, 'x-request-id') ?? randomUUID();
    const traceparent = header(req, 'traceparent');
    const log = deps.logger.child({ requestId });

    req.requestId = requestId;
    req.log = log;
    if (traceparent) req.traceparent = traceparent;
    res.setHeader('x-request-id', requestId);

    const startedAt = process.hrtime.bigint();
    log.debug({ method: req.method, path: req.path }, 'request start');

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      log.info(
        { method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs) },
        'request finish',
      );
    });

    next();
  };
}
