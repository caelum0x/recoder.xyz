/**
 * BE-7.3b — traceparent propagation on the rung-3 direct provider router
 * (`direct-provider.transport.ts` with the late-bound `tracer` getter). Proves:
 *  1. a wired tracer opens an `inference.provider_call` child span
 *     (provider/model/key-source attrs) and the outbound request carries the
 *     injected W3C `traceparent` header alongside the real auth header;
 *  2. a provider failure records the error on the span (status attr + http
 *     status) while the SAME truthful decline is returned — tracing never
 *     alters the outcome, and key material never reaches span attrs/reasons;
 *  3. unwired ⇒ no traceparent header, no span (untouched call path);
 *  4. a faulting tracer never breaks a completion.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type {
  Span,
  SpanOptions,
  TraceCarrier,
  TracerPort,
} from '../../observability/ports/tracer.port.js';
import type { ByokKeyResolver } from '../ports/byok-resolver.port.js';
import type { InferenceRequest } from '../types.js';
import { createDirectProviderTransport, type ProviderFetchLike } from './direct-provider.transport.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

const KEY = 'sk-byok-super-secret-123';

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

function fakeResolver(key: string | null, enabled = true): ByokKeyResolver {
  return {
    enabled: () => enabled,
    resolve: vi.fn(async () => key),
    store: vi.fn(async () => ({ stored: false as const, reason: 'unused' })),
    remove: vi.fn(async () => false),
    markUsed: vi.fn(),
  };
}

interface Captured {
  headers?: Record<string, string>;
}

function fetchReturning(
  json: unknown,
  status = 200,
): { fetch: ProviderFetchLike; captured: Captured } {
  const captured: Captured = {};
  const fetch: ProviderFetchLike = async (_url, init) => {
    captured.headers = init.headers;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json) };
  };
  return { fetch, captured };
}

const REQ: InferenceRequest = {
  model: 'openai/gpt-4o-mini',
  messages: [{ role: 'user', content: 'hi' }],
  userId: 'u1',
};

const OK_BODY = { id: 'chatcmpl-1', choices: [{ message: { role: 'assistant', content: 'ok' } }] };

describe('rung-3 direct router — BE-7.3b traceparent propagation', () => {
  it('opens an inference.provider_call span and sends traceparent on the wire', async () => {
    const { fetch, captured } = fetchReturning(OK_BODY);
    const { tracer, spans } = fakeTracer();
    const router = createDirectProviderTransport({
      logger: log,
      resolver: fakeResolver(KEY),
      fetch,
      tracer: () => tracer,
    });

    const result = await router.complete(REQ);

    expect(result.routed).toBe(true);
    expect(captured.headers?.traceparent).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    // The real auth header still rides along (tracing merges, never replaces).
    expect(captured.headers?.authorization).toBe(`Bearer ${KEY}`);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      name: 'inference.provider_call',
      attributes: {
        'inference.provider': 'openai',
        'inference.model': 'openai/gpt-4o-mini',
        'inference.key_source': 'byok',
        'outbound.status': 'ok',
        'http.status': 200,
      },
      ended: true,
    });
    // The redaction law extends to spans: key material never reaches attrs.
    expect(JSON.stringify(spans[0])).not.toContain(KEY);
  });

  it('records the provider failure on the span while returning the SAME truthful decline', async () => {
    const { fetch } = fetchReturning({ error: 'nope' }, 502);
    const { tracer, spans } = fakeTracer();
    const router = createDirectProviderTransport({
      logger: log,
      resolver: fakeResolver(KEY),
      fetch,
      tracer: () => tracer,
    });

    const result = await router.complete(REQ);

    expect(result).toMatchObject({ routed: false });
    expect(spans[0]).toMatchObject({
      attributes: { 'outbound.status': 'error', 'http.status': 502 },
      error: 'direct openai call failed (status 502)',
      ended: true,
    });
    expect(JSON.stringify(spans[0])).not.toContain(KEY);
  });

  it('a truthful decline BEFORE the wire (no key) opens no span at all', async () => {
    const { fetch } = fetchReturning(OK_BODY);
    const { tracer, spans } = fakeTracer();
    const router = createDirectProviderTransport({
      logger: log,
      resolver: fakeResolver(null),
      fetch,
      tracer: () => tracer,
    });

    const result = await router.complete(REQ);

    expect(result.routed).toBe(false);
    expect(spans).toHaveLength(0); // no outbound HTTP happened ⇒ no outbound span
  });

  it('unwired ⇒ no traceparent header (untouched call path)', async () => {
    const { fetch, captured } = fetchReturning(OK_BODY);
    const router = createDirectProviderTransport({
      logger: log,
      resolver: fakeResolver(KEY),
      fetch,
    });

    const result = await router.complete(REQ);

    expect(result.routed).toBe(true);
    expect(captured.headers?.traceparent).toBeUndefined();
  });

  it('a faulting tracer never breaks the completion', async () => {
    const { fetch } = fetchReturning(OK_BODY);
    const throwing = {
      startSpan: () => {
        throw new Error('tracer down');
      },
    } as unknown as TracerPort;
    const router = createDirectProviderTransport({
      logger: log,
      resolver: fakeResolver(KEY),
      fetch,
      tracer: () => throwing,
    });

    await expect(router.complete(REQ)).resolves.toMatchObject({ routed: true, content: 'ok' });
  });
});
