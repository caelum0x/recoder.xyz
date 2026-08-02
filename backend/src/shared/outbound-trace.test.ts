/**
 * `startOutboundSpan` (BE-7.3b) — the shared outbound-tracing helper for the
 * HTTP client seams. Proves the degrade-truthful law:
 *  - no tracer ⇒ `null` (the caller's path is untouched — never a fake span);
 *  - a wired tracer yields a child span + injected W3C `traceparent` headers,
 *    with `succeed`/`fail` recording status attrs (+ `recordError` on failure);
 *  - ANY tracer fault (startSpan/inject/end throwing) is swallowed — telemetry
 *    can never break the outbound call it observes.
 */
import { describe, expect, it } from 'vitest';
import type {
  Span,
  SpanOptions,
  TraceCarrier,
  TracerPort,
} from '../domains/observability/ports/tracer.port.js';
import { startOutboundSpan } from './outbound-trace.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, string | number | boolean>;
  error?: string;
  ended: boolean;
}

/** A minimal recording TracerPort (no OTel, no network). */
function fakeTracer(): { tracer: TracerPort; spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const tracer: TracerPort = {
    startSpan(name: string, options?: SpanOptions): Span {
      const rec: RecordedSpan = {
        name,
        attributes: { ...(options?.attributes ?? {}) },
        ended: false,
      };
      spans.push(rec);
      return {
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        setAttribute: (key, value) => {
          rec.attributes[key] = value;
        },
        recordError: (reason) => {
          rec.error = reason;
        },
        end: () => {
          rec.ended = true;
        },
      };
    },
    async withSpan(name, fn, options) {
      const span = this.startSpan(name, options);
      try {
        return await fn(span);
      } finally {
        span.end();
      }
    },
    inject(carrier: TraceCarrier, context) {
      carrier.traceparent = `00-${context?.traceId ?? '0'.repeat(32)}-${
        context?.spanId ?? '0'.repeat(16)
      }-01`;
    },
    extract: () => null,
    currentTraceId: () => null,
  };
  return { tracer, spans };
}

describe('startOutboundSpan', () => {
  it('returns null when no tracer is wired (untraced path, never a fake span)', () => {
    expect(startOutboundSpan(null, 'x', {})).toBeNull();
    expect(startOutboundSpan(undefined, 'x', {})).toBeNull();
  });

  it('opens a span with the given attrs and injects its context as traceparent', () => {
    const { tracer, spans } = fakeTracer();
    const trace = startOutboundSpan(tracer, 'billing.provider_call', { provider: 'polar' });

    expect(trace).not.toBeNull();
    // The injected carrier parents the DOWNSTREAM onto this span's ids.
    expect(trace?.headers.traceparent).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      name: 'billing.provider_call',
      attributes: { provider: 'polar' },
      ended: false,
    });
  });

  it('succeed() stamps outbound.status=ok (+ extra attrs) and ends the span', () => {
    const { tracer, spans } = fakeTracer();
    startOutboundSpan(tracer, 'n', {})?.succeed({ 'http.status': 200 });
    expect(spans[0]).toMatchObject({
      attributes: { 'outbound.status': 'ok', 'http.status': 200 },
      ended: true,
    });
    expect(spans[0]?.error).toBeUndefined();
  });

  it('fail() records the error reason, stamps outbound.status=error, and ends', () => {
    const { tracer, spans } = fakeTracer();
    startOutboundSpan(tracer, 'n', {})?.fail('downstream boom', { 'http.status': 503 });
    expect(spans[0]).toMatchObject({
      attributes: { 'outbound.status': 'error', 'http.status': 503 },
      error: 'downstream boom',
      ended: true,
    });
  });

  it('a faulting tracer (startSpan/inject throws) yields null — never a broken call', () => {
    const throwingStart = {
      ...fakeTracer().tracer,
      startSpan: () => {
        throw new Error('tracer down');
      },
    } as TracerPort;
    expect(startOutboundSpan(throwingStart, 'n', {})).toBeNull();

    const base = fakeTracer().tracer;
    const throwingInject = {
      ...base,
      inject: () => {
        throw new Error('inject down');
      },
    } as TracerPort;
    expect(startOutboundSpan(throwingInject, 'n', {})).toBeNull();
  });

  it('a span that throws on end() is swallowed by succeed()/fail()', () => {
    const base = fakeTracer().tracer;
    const tracer = {
      ...base,
      startSpan: (name: string, options?: SpanOptions) => {
        const span = base.startSpan(name, options);
        return {
          ...span,
          end: () => {
            throw new Error('exporter fault');
          },
        };
      },
    } as TracerPort;
    const trace = startOutboundSpan(tracer, 'n', {});
    expect(() => trace?.succeed()).not.toThrow();
    expect(() => trace?.fail('r')).not.toThrow();
  });
});
