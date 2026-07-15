/**
 * T3 — the telemetry middleware: opens a correlation scope + span, echoes the
 * inbound correlation id, and records an RED metric (requests_total + duration) on
 * both a 200 and a 500 with the truthful status label.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { telemetryMiddleware } from '../middleware/telemetry.middleware.js';
import type { MetricsPort, MetricSpec, CounterHandle, GaugeHandle, HistogramHandle } from '../ports/metrics.port.js';
import type { TracerPort, Span, SpanContext } from '../ports/tracer.port.js';
import type { CorrelatedLogger } from '../adapters/pino-logger.adapter.js';

function fakeMetrics() {
  const counters: Array<{ name: string; labels: unknown }> = [];
  const histObs: Array<{ name: string; labels: unknown; value: number }> = [];
  const counter = (spec: MetricSpec): CounterHandle => ({
    inc: (labels) => counters.push({ name: spec.name, labels }),
  });
  const gauge = (): GaugeHandle => ({ set: () => {}, inc: () => {}, dec: () => {} });
  const histogram = (spec: MetricSpec): HistogramHandle => ({
    observe: (labels, value) => histObs.push({ name: spec.name, labels, value }),
  });
  const port: MetricsPort = {
    counter,
    gauge,
    histogram,
    startTimer: () => ({ stop: () => 0 }),
  };
  return { port, counters, histObs };
}

function fakeTracer(): TracerPort {
  const span: Span = {
    traceId: 'trace-abc',
    spanId: 'span-1',
    setAttribute: vi.fn(),
    recordError: vi.fn(),
    end: vi.fn(),
  };
  return {
    startSpan: () => span,
    withSpan: async (_n, fn) => fn(span),
    inject: () => {},
    extract: (): SpanContext | null => null,
    currentTraceId: () => 'trace-abc',
  };
}

function fakeLogger(): { logger: CorrelatedLogger; calls: Array<{ level: string; fields: unknown }> } {
  const calls: Array<{ level: string; fields: unknown }> = [];
  const mk = (level: string) => (a: unknown) => calls.push({ level, fields: a });
  const logger = {
    info: mk('info'),
    warn: mk('warn'),
    error: mk('error'),
    debug: mk('debug'),
    pino: {} as never,
  } as unknown as CorrelatedLogger;
  return { logger, calls };
}

function fakeReq(overrides?: Partial<Request>): Request {
  const headers: Record<string, string> = { 'x-correlation-id': 'corr-123' };
  return {
    method: 'GET',
    path: '/api/thing',
    headers,
    baseUrl: '/api',
    header: (n: string) => headers[n.toLowerCase()],
    query: {},
    ...overrides,
  } as unknown as Request;
}

function fakeRes(statusCode: number): Response & EventEmitter {
  const res = new EventEmitter() as Response & EventEmitter;
  (res as { statusCode: number }).statusCode = statusCode;
  const headers: Record<string, string> = {};
  (res as unknown as { setHeader: (k: string, v: string) => void }).setHeader = (k, v) => {
    headers[k] = v;
  };
  (res as unknown as { _headers: Record<string, string> })._headers = headers;
  return res;
}

describe('telemetryMiddleware', () => {
  it('records a requests_total + duration metric with the 200 status label', async () => {
    const { port, counters, histObs } = fakeMetrics();
    const { logger, calls } = fakeLogger();
    const mw = telemetryMiddleware({ metrics: port, tracer: fakeTracer(), logger });

    const req = fakeReq();
    const res = fakeRes(200);
    await new Promise<void>((resolve) => {
      mw(req, res, () => resolve());
    });
    res.emit('finish');

    expect(counters.find((c) => c.name === 'http_requests_total')?.labels).toMatchObject({ status: '200' });
    expect(histObs.find((h) => h.name === 'http_request_duration_seconds')).toBeTruthy();
    // access log emitted at info for a 2xx
    expect(calls.find((c) => c.level === 'info')).toBeTruthy();
  });

  it('records the 500 status label + logs at error level for a 5xx', async () => {
    const { port, counters } = fakeMetrics();
    const { logger, calls } = fakeLogger();
    const mw = telemetryMiddleware({ metrics: port, tracer: fakeTracer(), logger });

    const req = fakeReq();
    const res = fakeRes(500);
    await new Promise<void>((resolve) => {
      mw(req, res, () => resolve());
    });
    res.emit('finish');

    expect(counters.find((c) => c.name === 'http_requests_total')?.labels).toMatchObject({ status: '500' });
    expect(calls.find((c) => c.level === 'error')).toBeTruthy();
  });

  it('echoes the inbound correlation id back on the response', async () => {
    const { port } = fakeMetrics();
    const { logger } = fakeLogger();
    const mw = telemetryMiddleware({ metrics: port, tracer: fakeTracer(), logger });

    const req = fakeReq();
    const res = fakeRes(200);
    await new Promise<void>((resolve) => {
      mw(req, res, () => resolve());
    });
    expect((res as unknown as { _headers: Record<string, string> })._headers['x-correlation-id']).toBe('corr-123');
  });
});
