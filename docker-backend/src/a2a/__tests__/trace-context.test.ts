/**
 * @module trace-context.test
 *
 * Test suite for the A2A distributed tracing service and middleware.
 *
 * Covers:
 * - A2ATraceService: ID generation, context propagation, nested spans,
 *   header extraction (x-trace-id, W3C traceparent), propagation headers,
 *   completed span collection, reset
 * - createTraceMiddleware: response headers, custom operation name,
 *   trace propagation through request lifecycle
 * - Singleton management: getTraceService / resetTraceService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  A2ATraceService,
  getTraceService,
  resetTraceService,
} from '../trace-context';
import { createTraceMiddleware } from '../trace-context.middleware';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockReq(overrides?: {
  method?: string;
  path?: string;
  originalUrl?: string;
  headers?: Record<string, string>;
}): any {
  return {
    method: overrides?.method ?? 'GET',
    path: overrides?.path ?? '/test',
    originalUrl: overrides?.originalUrl ?? '/test',
    headers: overrides?.headers ?? {},
  };
}

function makeMockRes(): any {
  const res: any = {
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res._headers[name.toLowerCase()] = value;
    },
  };
  return res;
}

function makeMockNext() {
  return vi.fn();
}

// ===========================================================================
// A2ATraceService
// ===========================================================================

describe('A2ATraceService', () => {
  let service: A2ATraceService;

  beforeEach(() => {
    service = new A2ATraceService();
  });

  // ---- ID generation ------------------------------------------------------

  describe('ID generation', () => {
    it('generates trace IDs with trc_ prefix', () => {
      const id = service.generateTraceId();
      expect(id).toMatch(/^trc_.{21}$/);
    });

    it('generates span IDs with spn_ prefix', () => {
      const id = service.generateSpanId();
      expect(id).toMatch(/^spn_.{16}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(service.generateTraceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  // ---- Context management -------------------------------------------------

  describe('context management', () => {
    it('returns undefined when no context is active', () => {
      expect(service.getCurrentContext()).toBeUndefined();
      expect(service.getTraceId()).toBe('no-trace');
      expect(service.getSpanId()).toBe('no-span');
    });

    it('provides context inside runWithTrace', () => {
      const traceId = service.generateTraceId();

      service.runWithTrace(traceId, () => {
        const ctx = service.getCurrentContext();
        expect(ctx).toBeDefined();
        expect(ctx!.traceId).toBe(traceId);
        expect(ctx!.spanId).toMatch(/^spn_/);
        expect(service.getTraceId()).toBe(traceId);
      });

      // Context should be gone after runWithTrace
      expect(service.getCurrentContext()).toBeUndefined();
    });
  });

  // ---- Nested spans -------------------------------------------------------

  describe('nested spans', () => {
    it('creates child spans that inherit parent trace ID', () => {
      const traceId = service.generateTraceId();

      service.runWithTrace(traceId, () => {
        const parentSpanId = service.getSpanId();

        service.runWithSpan({ operationName: 'child-op' }, () => {
          const ctx = service.getCurrentContext();
          expect(ctx!.traceId).toBe(traceId);
          expect(ctx!.spanId).not.toBe(parentSpanId);
          expect(ctx!.parentSpanId).toBe(parentSpanId);
        });
      });
    });

    it('records completed spans for sync operations', () => {
      const traceId = service.generateTraceId();

      service.runWithTrace(traceId, () => {
        service.runWithSpan({ operationName: 'test-op', attributes: { foo: 'bar' } }, () => {
          // sync operation
        });
      });

      const spans = service.getCompletedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].operationName).toBe('test-op');
      expect(spans[0].status).toBe('ok');
      expect(spans[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(spans[0].attributes.foo).toBe('bar');
    });

    it('records error status for throwing operations', () => {
      const traceId = service.generateTraceId();

      service.runWithTrace(traceId, () => {
        try {
          service.runWithSpan({ operationName: 'failing-op' }, () => {
            throw new Error('boom');
          });
        } catch {
          // expected
        }
      });

      const spans = service.getCompletedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status).toBe('error');
      expect(spans[0].error).toBe('boom');
    });

    it('records completed spans for async operations', async () => {
      const traceId = service.generateTraceId();

      await service.runWithTrace(traceId, () => {
        return service.runWithSpan({ operationName: 'async-op' }, async () => {
          await new Promise((r) => setTimeout(r, 10));
          return 'done';
        });
      });

      const spans = service.getCompletedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].operationName).toBe('async-op');
      expect(spans[0].status).toBe('ok');
      expect(spans[0].durationMs).toBeGreaterThanOrEqual(5);
    });

    it('creates root trace when no parent exists for runWithSpan', () => {
      service.runWithSpan({ operationName: 'root-span' }, () => {
        const ctx = service.getCurrentContext();
        expect(ctx).toBeDefined();
        expect(ctx!.traceId).toMatch(/^trc_/);
        expect(ctx!.parentSpanId).toBeUndefined();
      });
    });
  });

  // ---- Header extraction --------------------------------------------------

  describe('extractTraceId', () => {
    it('extracts from x-trace-id header', () => {
      const result = service.extractTraceId({ 'x-trace-id': 'trc_abc123' });
      expect(result).toBe('trc_abc123');
    });

    it('extracts from W3C traceparent header', () => {
      const result = service.extractTraceId({
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      });
      expect(result).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    });

    it('prefers x-trace-id over traceparent', () => {
      const result = service.extractTraceId({
        'x-trace-id': 'custom-trace',
        traceparent: '00-w3c-trace-id-span-01',
      });
      expect(result).toBe('custom-trace');
    });

    it('returns undefined when no trace headers present', () => {
      const result = service.extractTraceId({});
      expect(result).toBeUndefined();
    });

    it('handles array header values', () => {
      const result = service.extractTraceId({ 'x-trace-id': ['first', 'second'] });
      expect(result).toBe('first');
    });
  });

  // ---- Propagation headers ------------------------------------------------

  describe('buildPropagationHeaders', () => {
    it('returns empty object when no context is active', () => {
      const headers = service.buildPropagationHeaders();
      expect(headers).toEqual({});
    });

    it('returns trace and span headers when context is active', () => {
      const traceId = service.generateTraceId();

      service.runWithTrace(traceId, () => {
        const headers = service.buildPropagationHeaders();
        expect(headers['x-trace-id']).toBe(traceId);
        expect(headers['x-span-id']).toMatch(/^spn_/);
      });
    });
  });

  // ---- Span queries -------------------------------------------------------

  describe('span queries', () => {
    it('getSpansForTrace filters by trace ID', () => {
      const traceId1 = service.generateTraceId();
      const traceId2 = service.generateTraceId();

      service.runWithTrace(traceId1, () => {
        service.runWithSpan({ operationName: 'op-1' }, () => {});
      });

      service.runWithTrace(traceId2, () => {
        service.runWithSpan({ operationName: 'op-2' }, () => {});
      });

      const spans1 = service.getSpansForTrace(traceId1);
      expect(spans1).toHaveLength(1);
      expect(spans1[0].operationName).toBe('op-1');

      const spans2 = service.getSpansForTrace(traceId2);
      expect(spans2).toHaveLength(1);
      expect(spans2[0].operationName).toBe('op-2');
    });
  });

  // ---- Reset --------------------------------------------------------------

  describe('reset', () => {
    it('clears all completed spans', () => {
      service.runWithTrace(service.generateTraceId(), () => {
        service.runWithSpan({ operationName: 'test' }, () => {});
      });

      expect(service.getCompletedSpans()).toHaveLength(1);
      service.reset();
      expect(service.getCompletedSpans()).toHaveLength(0);
    });
  });
});

// ===========================================================================
// Singleton management
// ===========================================================================

describe('singleton management', () => {
  afterEach(() => {
    resetTraceService();
  });

  it('returns the same instance on repeated calls', () => {
    const a = getTraceService();
    const b = getTraceService();
    expect(a).toBe(b);
  });

  it('returns a new instance after reset', () => {
    const a = getTraceService();
    resetTraceService();
    const b = getTraceService();
    expect(a).not.toBe(b);
  });
});

// ===========================================================================
// createTraceMiddleware
// ===========================================================================

describe('createTraceMiddleware', () => {
  afterEach(() => {
    resetTraceService();
  });

  it('calls next() and sets trace response headers', () => {
    const mw = createTraceMiddleware();
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._headers['x-trace-id']).toMatch(/^trc_/);
    expect(res._headers['x-span-id']).toMatch(/^spn_/);
  });

  it('propagates incoming x-trace-id', () => {
    const mw = createTraceMiddleware();
    const req = makeMockReq({ headers: { 'x-trace-id': 'incoming-trace-123' } });
    const res = makeMockRes();
    const next = makeMockNext();

    mw(req, res, next);

    expect(res._headers['x-trace-id']).toBe('incoming-trace-123');
  });

  it('uses custom operationNameFn when provided', () => {
    const mw = createTraceMiddleware({
      operationNameFn: (req) => `custom:${req.method}`,
    });

    const req = makeMockReq({ method: 'POST' });
    const res = makeMockRes();
    const next = makeMockNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // The span should be recorded with the custom name
    const spans = getTraceService().getCompletedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
    // At least one span should have our custom operation name
    const customSpan = spans.find((s) => s.operationName === 'custom:POST');
    expect(customSpan).toBeDefined();
  });

  it('does not set headers when setResponseHeaders is false', () => {
    const mw = createTraceMiddleware({ setResponseHeaders: false });
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._headers['x-trace-id']).toBeUndefined();
    expect(res._headers['x-span-id']).toBeUndefined();
  });

  it('generates a new trace ID when none is provided', () => {
    const mw = createTraceMiddleware();
    const req = makeMockReq({ headers: {} });
    const res = makeMockRes();
    const next = makeMockNext();

    mw(req, res, next);

    expect(res._headers['x-trace-id']).toMatch(/^trc_/);
  });
});
