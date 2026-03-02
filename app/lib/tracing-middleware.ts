/**
 * Request Tracing Middleware / Helper
 *
 * Provides lightweight utilities for propagating trace IDs through
 * API request/response cycles:
 *
 * - Extracts an existing trace-id from the incoming request, or generates one
 * - Attaches the trace ID as an `x-trace-id` response header
 * - Integrates with the structured logger to include trace IDs in log output
 *
 * Works independently of OpenTelemetry — if OTel is active, it will prefer
 * the active span's trace ID. Otherwise it falls back to the request header
 * or generates a random ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Generate a random 32-character hex string suitable as a trace ID.
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Attempt to get the active OTel trace ID from the current span context.
 * Returns null if OpenTelemetry is not active or no valid span exists.
 */
function getOtelTraceId(): string | null {
  try {
    // Dynamic import avoidance — use require so this works even when OTel
    // packages are not installed (returns null in that case).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('@opentelemetry/api');
    const span = api.trace.getActiveSpan?.();
    if (span) {
      const ctx = span.spanContext();
      // A valid trace ID is 32 hex chars and not all zeros
      if (ctx?.traceId && ctx.traceId !== '00000000000000000000000000000000') {
        return ctx.traceId;
      }
    }
  } catch {
    // OTel not available — fall through
  }
  return null;
}

/**
 * Extract or generate a trace ID for the current request.
 *
 * Priority:
 *   1. Active OpenTelemetry span trace ID
 *   2. Incoming `x-trace-id` header
 *   3. Incoming `traceparent` header (W3C format, extract trace-id segment)
 *   4. Newly generated random trace ID
 */
export function getTraceId(request: NextRequest): string {
  // 1. Try OTel active span
  const otelTraceId = getOtelTraceId();
  if (otelTraceId) {
    return otelTraceId;
  }

  // 2. Explicit x-trace-id header
  const headerTraceId = request.headers.get('x-trace-id');
  if (headerTraceId) {
    return headerTraceId;
  }

  // 3. W3C traceparent header: version-traceId-parentId-traceFlags
  const traceparent = request.headers.get('traceparent');
  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length >= 2 && parts[1].length === 32) {
      return parts[1];
    }
  }

  // 4. Generate a new trace ID
  return generateTraceId();
}

/**
 * Attach the trace ID as an `x-trace-id` header on a NextResponse.
 */
export function withTraceId(response: NextResponse, traceId: string): NextResponse {
  response.headers.set('x-trace-id', traceId);
  return response;
}

/**
 * Create a trace-aware logger that automatically includes the trace ID
 * in every log entry.
 */
export function tracedLogger(traceId: string) {
  return {
    info(msg: string, meta?: Record<string, unknown>) {
      logger.info(msg, { ...meta, traceId });
    },
    warn(msg: string, meta?: Record<string, unknown>) {
      logger.warn(msg, { ...meta, traceId });
    },
    error(msg: string, meta?: Record<string, unknown>) {
      logger.error(msg, { ...meta, traceId });
    },
  };
}

/**
 * Convenience: extract the trace ID, log it, and return a helper
 * that can apply it to responses.
 *
 * Usage in an API route:
 *   const { traceId, applyTraceId, log } = traceRequest(request);
 *   log.info('handling request');
 *   return applyTraceId(NextResponse.json({ ok: true }));
 */
export function traceRequest(request: NextRequest) {
  const traceId = getTraceId(request);
  const log = tracedLogger(traceId);

  return {
    traceId,
    log,
    applyTraceId: (response: NextResponse) => withTraceId(response, traceId),
  };
}
