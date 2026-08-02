/**
 * `startOutboundSpan` — the shared BE-7.3b outbound-tracing helper for the
 * outbound HTTP client seams (billing MoR transport, inference direct-provider
 * router, engine sidecar `daemonFetch`). It opens a child span, derives the W3C
 * `traceparent` carrier headers for the outbound request via `tracer.inject`,
 * and hands back an outcome recorder the seam drives on its existing paths.
 *
 * Degrade-truthful by contract (same law as the MCP `mcp.tool_call` seam):
 *  - no tracer wired (bootstrap has not late-bound observability yet, or tests)
 *    ⇒ returns `null` and the call path is untouched — never a fabricated span;
 *  - ANY tracer fault is swallowed here — telemetry can never alter, fail, or
 *    reorder the real outbound call it observes.
 *
 * TYPE-ONLY observability import (erased at build) — the concrete `TracerPort`
 * is late-bound by bootstrap AFTER observability composes, same discipline as
 * `conductor.setMetrics` / `engines.setMcpTelemetry`.
 */
import type {
  SpanAttrValue,
  TraceCarrier,
  TracerPort,
} from '../domains/observability/ports/tracer.port.js';

/** A live outbound child span + the trace-context headers to send with the call. */
export interface OutboundSpan {
  /** W3C `traceparent` header(s) to merge into the outbound request headers. */
  readonly headers: Readonly<Record<string, string>>;
  /** Record success (+ optional final attrs, e.g. `http.status`) and end the span. */
  succeed(attrs?: Readonly<Record<string, SpanAttrValue>>): void;
  /** Record a failure reason (+ optional final attrs) and end the span. */
  fail(reason: string, attrs?: Readonly<Record<string, SpanAttrValue>>): void;
}

/**
 * Open an outbound child span named `name` with `attributes` (provider/method —
 * NEVER a secret) and inject its context as `traceparent` carrier headers so the
 * downstream service joins this trace as a child of the new span.
 *
 * Returns `null` when no tracer is wired or the tracer faults — the caller then
 * performs the exact same call it always did, untraced.
 */
export function startOutboundSpan(
  tracer: TracerPort | null | undefined,
  name: string,
  attributes: Readonly<Record<string, SpanAttrValue>>,
): OutboundSpan | null {
  if (!tracer) return null;
  try {
    const span = tracer.startSpan(name, { attributes });
    const carrier: TraceCarrier = {};
    // The downstream continues THIS span: inject its context (not just the
    // ambient correlation) so the remote trace parents onto the child span.
    tracer.inject(carrier, { traceId: span.traceId, spanId: span.spanId, sampled: true });

    const finish = (
      status: 'ok' | 'error',
      reason?: string,
      attrs?: Readonly<Record<string, SpanAttrValue>>,
    ): void => {
      try {
        for (const [key, value] of Object.entries(attrs ?? {})) span.setAttribute(key, value);
        span.setAttribute('outbound.status', status);
        if (reason !== undefined) span.recordError(reason);
        span.end();
      } catch {
        /* a tracer fault never reaches the outbound caller */
      }
    };

    return {
      headers: carrier,
      succeed: (attrs) => finish('ok', undefined, attrs),
      fail: (reason, attrs) => finish('error', reason, attrs),
    };
  } catch {
    return null; // tracer fault ⇒ an untraced call, never a broken one
  }
}
