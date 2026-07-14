/**
 * @module trace-context.middleware
 *
 * Express middleware that wraps every incoming request in a distributed
 * trace context using the A2ATraceService.
 *
 * Extracts or generates a trace ID, creates a root span for the request,
 * and attaches trace/span IDs to the response headers for downstream
 * correlation.
 *
 * P17-017: Distributed tracing infrastructure
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getTraceService } from './trace-context';

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export interface TraceMiddlewareOptions {
  /** Custom function to derive the operation name from the request. */
  operationNameFn?: (req: Request) => string;
  /** Whether to set response headers with trace/span IDs (default true). */
  setResponseHeaders?: boolean;
  /** Header name for returning the trace ID (default 'x-trace-id'). */
  traceIdHeader?: string;
  /** Header name for returning the span ID (default 'x-span-id'). */
  spanIdHeader?: string;
}

/**
 * Create Express middleware that wraps each request in a trace context.
 *
 * - Extracts an existing trace ID from incoming headers (`x-trace-id` or
 *   W3C `traceparent`), or generates a new one.
 * - Creates a span named after the HTTP method + path.
 * - Sets `x-trace-id` and `x-span-id` response headers.
 */
export function createTraceMiddleware(options?: TraceMiddlewareOptions): RequestHandler {
  const {
    operationNameFn = (req: Request) => `${req.method} ${req.path}`,
    setResponseHeaders = true,
    traceIdHeader = 'x-trace-id',
    spanIdHeader = 'x-span-id',
  } = options ?? {};

  return (req: Request, res: Response, next: NextFunction): void => {
    const traceService = getTraceService();

    // Extract or generate trace ID
    const incomingTraceId = traceService.extractTraceId(
      req.headers as Record<string, string | string[] | undefined>,
    );
    const traceId = incomingTraceId ?? traceService.generateTraceId();

    const operationName = operationNameFn(req);

    // Run the rest of the middleware chain inside a trace span
    traceService.runWithTrace(traceId, () => {
      const result = traceService.runWithSpan(
        {
          operationName,
          attributes: {
            'http.method': req.method,
            'http.path': req.path,
            'http.url': req.originalUrl,
          },
        },
        () => {
          // Set response headers before downstream middleware runs
          if (setResponseHeaders) {
            const ctx = traceService.getCurrentContext();
            if (ctx) {
              res.setHeader(traceIdHeader, ctx.traceId);
              res.setHeader(spanIdHeader, ctx.spanId);
              if (ctx.parentSpanId) {
                res.setHeader('x-parent-span-id', ctx.parentSpanId);
              }
            }
          }

          // Continue to the next middleware / route handler
          next();
        },
      );

      // If runWithSpan returned a promise (shouldn't happen for sync next()
      // call, but handle defensively), we still let Express handle it.
      if (result instanceof Promise) {
        result.catch(() => {
          // Error handling is left to Express error middleware
        });
      }
    });
  };
}
