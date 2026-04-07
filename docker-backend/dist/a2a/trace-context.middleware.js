"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTraceMiddleware = createTraceMiddleware;
const trace_context_1 = require("./trace-context");
/**
 * Create Express middleware that wraps each request in a trace context.
 *
 * - Extracts an existing trace ID from incoming headers (`x-trace-id` or
 *   W3C `traceparent`), or generates a new one.
 * - Creates a span named after the HTTP method + path.
 * - Sets `x-trace-id` and `x-span-id` response headers.
 */
function createTraceMiddleware(options) {
    const { operationNameFn = (req) => `${req.method} ${req.path}`, setResponseHeaders = true, traceIdHeader = 'x-trace-id', spanIdHeader = 'x-span-id', } = options ?? {};
    return (req, res, next) => {
        const traceService = (0, trace_context_1.getTraceService)();
        // Extract or generate trace ID
        const incomingTraceId = traceService.extractTraceId(req.headers);
        const traceId = incomingTraceId ?? traceService.generateTraceId();
        const operationName = operationNameFn(req);
        // Run the rest of the middleware chain inside a trace span
        traceService.runWithTrace(traceId, () => {
            const result = traceService.runWithSpan({
                operationName,
                attributes: {
                    'http.method': req.method,
                    'http.path': req.path,
                    'http.url': req.originalUrl,
                },
            }, () => {
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
            });
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
