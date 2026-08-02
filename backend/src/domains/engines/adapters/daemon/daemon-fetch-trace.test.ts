/**
 * BE-7.3b — traceparent propagation on the shared sidecar transport
 * (`daemon-adapter-base.ts` → `daemonFetch`). Proves:
 *  1. a wired tracer (per-call injection, or the module-wide late-bound
 *     `setDaemonFetchTracer` used by `EnginesComposer.setMcpTelemetry`) opens an
 *     `engines.daemon_call` child span (target/method attrs) and the outbound
 *     request carries the injected W3C `traceparent` header;
 *  2. a sidecar failure records the error on the span while `daemonFetch`
 *     returns the SAME typed `{ ok:false }` — tracing never alters the outcome;
 *  3. unwired ⇒ no traceparent header, no span (untouched call path);
 *  4. a faulting tracer never breaks a sidecar call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '../../../../shared/outbound-resilience.js';
import type {
  Span,
  SpanOptions,
  TraceCarrier,
  TracerPort,
} from '../../../observability/ports/tracer.port.js';
import { daemonFetch, setDaemonFetchTracer, type FetchLike } from './daemon-adapter-base.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, string | number | boolean>;
  error?: string;
  ended: boolean;
}

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

interface CapturedInit {
  headers?: Record<string, string>;
}

function capturingFetch(status = 200, body = '{"ok":true}'): {
  fetch: FetchLike;
  captured: CapturedInit;
} {
  const captured: CapturedInit = {};
  const fetch: FetchLike = async (_url, init) => {
    captured.headers = (init?.headers ?? {}) as Record<string, string>;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as unknown as Response;
  };
  return { fetch, captured };
}

const URL_ = 'http://127.0.0.1:7311/health';
const TRACEPARENT = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`;

afterEach(() => {
  setDaemonFetchTracer(null); // never leak the module-wide bind across tests
  vi.restoreAllMocks();
});

describe('daemonFetch — BE-7.3b traceparent propagation', () => {
  it('opens an engines.daemon_call span and sends traceparent on the wire', async () => {
    const { fetch, captured } = capturingFetch();
    const { tracer, spans } = fakeTracer();

    const result = await daemonFetch(URL_, { method: 'GET' }, {
      fetchImpl: fetch,
      breaker: new CircuitBreaker(),
      tracer,
    });

    expect(result.ok).toBe(true);
    expect(captured.headers?.traceparent).toBe(TRACEPARENT);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      name: 'engines.daemon_call',
      attributes: {
        'daemon.target': 'http://127.0.0.1:7311',
        'http.method': 'GET',
        'outbound.status': 'ok',
      },
      ended: true,
    });
  });

  it('the module-wide late-bound tracer (setDaemonFetchTracer) is used by default', async () => {
    const { fetch, captured } = capturingFetch();
    const { tracer, spans } = fakeTracer();
    setDaemonFetchTracer(tracer);

    const result = await daemonFetch(URL_, { method: 'GET' }, {
      fetchImpl: fetch,
      breaker: new CircuitBreaker(),
    });

    expect(result.ok).toBe(true);
    expect(captured.headers?.traceparent).toBe(TRACEPARENT);
    expect(spans).toHaveLength(1);
  });

  it('records the sidecar failure on the span while returning the SAME typed failure', async () => {
    const { fetch } = capturingFetch(503, '{}');
    const { tracer, spans } = fakeTracer();

    const result = await daemonFetch(URL_, { method: 'POST', body: { x: 1 } }, {
      fetchImpl: fetch,
      breaker: new CircuitBreaker(),
      tracer,
    });

    expect(result).toMatchObject({ ok: false, code: 'http_503' });
    expect(spans[0]).toMatchObject({
      attributes: { 'http.method': 'POST', 'outbound.status': 'error' },
      error: `HTTP 503 from ${URL_}`,
      ended: true,
    });
  });

  it('unwired ⇒ no traceparent header and no span (untouched call path)', async () => {
    const { fetch, captured } = capturingFetch();

    const result = await daemonFetch(URL_, { method: 'GET' }, {
      fetchImpl: fetch,
      breaker: new CircuitBreaker(),
    });

    expect(result.ok).toBe(true);
    expect(captured.headers?.traceparent).toBeUndefined();
  });

  it('an explicit null tracer override disables tracing even when module-bound', async () => {
    const { fetch, captured } = capturingFetch();
    const { tracer, spans } = fakeTracer();
    setDaemonFetchTracer(tracer);

    await daemonFetch(URL_, { method: 'GET' }, {
      fetchImpl: fetch,
      breaker: new CircuitBreaker(),
      tracer: null,
    });

    expect(captured.headers?.traceparent).toBeUndefined();
    expect(spans).toHaveLength(0);
  });

  it('a faulting tracer never breaks the sidecar call', async () => {
    const { fetch } = capturingFetch();
    const throwing = {
      startSpan: () => {
        throw new Error('tracer down');
      },
    } as unknown as TracerPort;

    const result = await daemonFetch(URL_, { method: 'GET' }, {
      fetchImpl: fetch,
      breaker: new CircuitBreaker(),
      tracer: throwing,
    });

    expect(result).toMatchObject({ ok: true });
  });
});
