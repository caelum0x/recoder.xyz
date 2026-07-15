/**
 * The terminal error boundary of the edge pipeline. Consumes the canonical
 * envelope machinery from `shared/errors` (single source — no re-implementation):
 * `errorEnvelope` maps any thrown value / `AppError` / `createError` into the
 * uniform `{ success:false, error:{ code, message, requestId, timestamp } }`
 * body, logging full server-side context while NEVER leaking a stack or secret to
 * the client; unknown errors collapse to `SERVICE_UNAVAILABLE`. `notFound` is the
 * 404 tail; `asyncHandler` re-exported so route handlers' rejections flow here.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import {
  errorEnvelope as sharedErrorEnvelope,
  notFound as sharedNotFound,
  asyncHandler,
} from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';

export interface ErrorMiddlewareDeps {
  readonly logger: Logger;
}

/**
 * Build the terminal error middleware bound to the edge logger. Mount LAST,
 * after every route and the 404 tail.
 */
export function errorEnvelope(deps: ErrorMiddlewareDeps): ErrorRequestHandler {
  return sharedErrorEnvelope({
    error: (obj: unknown, msg?: string) => deps.logger.error(obj as Record<string, unknown>, msg),
  });
}

/** The 404 handler for unmatched routes. Mount just before `errorEnvelope`. */
export function notFound(): RequestHandler {
  return sharedNotFound();
}

export { asyncHandler };
