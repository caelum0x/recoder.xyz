/**
 * BE-7.3b — traceparent propagation on the shared MoR HTTP transport
 * (`adapters/shared.ts` → `createProviderTransport` with the late-bound
 * `tracer` getter). Proves:
 *  1. a wired tracer opens a `billing.provider_call` child span
 *     (provider/method/path attrs) and the outbound fetch carries the injected
 *     W3C `traceparent` header;
 *  2. a failing provider call records the error on the span (status=error) and
 *     still throws the SAME truthful `SERVICE_UNAVAILABLE` — tracing never
 *     alters the outcome;
 *  3. unwired (no tracer / getter yields null) ⇒ NO `traceparent` header and no
 *     span — the untraced path is untouched;
 *  4. a faulting tracer never breaks the provider call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type {
  Span,
  SpanOptions,
  TraceCarrier,
  TracerPort,
} from '../../observability/ports/tracer.port.js';
import { createProviderTransport } from '../adapters/shared.js';

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

function okResp(json: unknown): Response {
  return { ok: true, status: 200, text: async () => JSON.stringify(json) } as unknown as Response;
}

function failResp(): Response {
  return {
    ok: false,
    status: 503,
    text: async () => JSON.stringify({ detail: 'downstream boom' }),
  } as unknown as Response;
}

const BASE = 'https://api.polar.sh';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createProviderTransport — BE-7.3b traceparent propagation', () => {
  it('opens a billing.provider_call span and sends traceparent on the wire', async () => {
    const fetchMock = vi.fn<[], Promise<Response>>().mockResolvedValue(okResp({ id: 'sub_1' }));
    vi.stubGlobal('fetch', fetchMock);
    const { tracer, spans } = fakeTracer();

    const t = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      tracer: () => tracer,
    });
    await t.call('GET', '/v1/subscriptions/sub_1');

    const init = fetchMock.mock.calls[0]?.[1] as unknown as { headers: Record<string, string> };
    expect(init.headers.traceparent).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    // The real auth header still rides along (tracing merges, never replaces).
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      name: 'billing.provider_call',
      attributes: {
        'billing.provider': 'polar',
        'http.method': 'GET',
        'http.path': '/v1/subscriptions/sub_1',
        'outbound.status': 'ok',
      },
      ended: true,
    });
    expect(spans[0]?.error).toBeUndefined();
  });

  it('records the failure on the span and still throws the truthful AppError', async () => {
    vi.stubGlobal('fetch', vi.fn<[], Promise<Response>>().mockResolvedValue(failResp()));
    const { tracer, spans } = fakeTracer();

    const t = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      tracer: () => tracer,
    });

    await expect(t.call('POST', '/v1/checkouts', { productId: 'p' })).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    } satisfies Partial<AppError>);
    expect(spans[0]).toMatchObject({
      attributes: { 'billing.provider': 'polar', 'outbound.status': 'error' },
      error: 'downstream boom',
      ended: true,
    });
  });

  it('unwired (absent or null getter) ⇒ no traceparent header, untouched call', async () => {
    const fetchMock = vi.fn<[], Promise<Response>>().mockResolvedValue(okResp({}));
    vi.stubGlobal('fetch', fetchMock);

    const bare = createProviderTransport({ provider: 'polar', baseUrl: BASE, apiKey: 'k' });
    await bare.call('GET', '/v1/health');
    const nulled = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      tracer: () => null,
    });
    await nulled.call('GET', '/v1/health');

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as unknown as { headers: Record<string, string> };
      expect(init.headers.traceparent).toBeUndefined();
    }
  });

  it('a faulting tracer never breaks the provider call', async () => {
    vi.stubGlobal('fetch', vi.fn<[], Promise<Response>>().mockResolvedValue(okResp({ ok: 1 })));
    const throwing = {
      startSpan: () => {
        throw new Error('tracer down');
      },
    } as unknown as TracerPort;

    const t = createProviderTransport({
      provider: 'polar',
      baseUrl: BASE,
      apiKey: 'k',
      tracer: () => throwing,
    });
    await expect(t.call('GET', '/v1/health')).resolves.toEqual({ ok: 1 });
  });
});
