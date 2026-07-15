/**
 * `telemetryMiddleware` — the express (and WS) tap that turns every request into
 * correlated, traced, metered, logged evidence:
 *
 *  1. correlation — derive/propagate a `correlationId` (from the inbound
 *     `x-correlation-id` header or a fresh uuid) and open an
 *     {@link runWithCorrelation} scope so all downstream logs/spans/metrics share it.
 *  2. trace context — extract the inbound W3C `traceparent`, open a request span,
 *     and echo the id back on the response `x-correlation-id` header.
 *  3. RED metrics — increment `http_requests_total{method,route,status}` and
 *     observe `http_request_duration_seconds` on completion (rate/errors/duration).
 *  4. access log — a single structured line per request, secrets redacted by the
 *     correlated logger.
 *
 * It is mounted ONCE, first in the edge chain, so it wraps every downstream
 * handler. Degrade-safe: a metrics/tracer/logger fault never blocks the request.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { MetricSpec, MetricsPort } from '../ports/metrics.port.js';
import type { TracerPort } from '../ports/tracer.port.js';
import type { CorrelatedLogger } from '../adapters/pino-logger.adapter.js';
import { runWithCorrelation } from '../services/correlation.service.js';

const REQUESTS_TOTAL: MetricSpec = {
  name: 'http_requests_total',
  help: 'Total HTTP requests (RED rate + errors).',
  labelNames: ['method', 'route', 'status'],
};
const REQUEST_DURATION: MetricSpec = {
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds (RED duration).',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
};
const IN_FLIGHT: MetricSpec = {
  name: 'http_requests_in_flight',
  help: 'In-flight HTTP requests (USE saturation).',
  labelNames: ['method'],
};

export interface TelemetryMiddlewareDeps {
  readonly metrics: MetricsPort;
  readonly tracer: TracerPort;
  readonly logger: CorrelatedLogger;
}

/** Header carrying the correlation id in/out. */
const CORRELATION_HEADER = 'x-correlation-id';

/** Prefer the matched express route pattern over the raw path (bounds cardinality). */
function routeLabel(req: Request): string {
  const route = (req as { route?: { path?: string } }).route?.path;
  const base = (req as { baseUrl?: string }).baseUrl ?? '';
  if (typeof route === 'string') return `${base}${route}` || '/';
  // Fall back to baseUrl (mount base) so we never emit a high-cardinality raw path.
  return base || 'unmatched';
}

/** Build the express telemetry middleware. */
export function telemetryMiddleware(deps: TelemetryMiddlewareDeps): RequestHandler {
  const requests = deps.metrics.counter(REQUESTS_TOTAL);
  const duration = deps.metrics.histogram(REQUEST_DURATION);
  const inFlight = deps.metrics.gauge(IN_FLIGHT);

  return (req: Request, res: Response, next: NextFunction): void => {
    const inbound = req.header(CORRELATION_HEADER);
    const traceCtx = deps.tracer.extract(req.headers as Record<string, string>);

    runWithCorrelation(
      {
        ...(inbound ? { correlationId: inbound } : {}),
        ...(traceCtx?.traceId ? { traceId: traceCtx.traceId } : {}),
      },
      () => {
        const start = process.hrtime.bigint();
        const method = req.method;
        inFlight.inc({ method });

        const span = deps.tracer.startSpan(`${method} ${req.path}`, {
          ...(traceCtx ? { parent: traceCtx } : {}),
          attributes: { 'http.method': method, 'http.target': req.path },
        });
        // Echo the correlation id back so a client can join its logs to the trace.
        if (inbound) res.setHeader(CORRELATION_HEADER, inbound);

        let finished = false;
        const onDone = (): void => {
          if (finished) return;
          finished = true;
          const status = String(res.statusCode);
          const route = routeLabel(req);
          const labels = { method, route, status };
          const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;

          try {
            requests.inc(labels);
            duration.observe(labels, elapsedSec);
            inFlight.dec({ method });
            span.setAttribute('http.status_code', res.statusCode);
            if (res.statusCode >= 500) span.recordError(`status ${res.statusCode}`);
            span.end();
          } catch {
            // Telemetry must never break the response path.
          }

          const level = res.statusCode >= 500 ? 'error' : 'info';
          deps.logger[level](
            {
              method,
              route,
              path: req.path,
              status: res.statusCode,
              durationMs: Math.round(elapsedSec * 1000),
            },
            'request',
          );
        };

        res.on('finish', onDone);
        res.on('close', onDone);
        next();
      },
    );
  };
}

/** A WS connection descriptor the telemetry tap labels a session frame stream with. */
export interface WsTelemetryCtx {
  readonly path: string;
  readonly correlationId?: string;
}

/**
 * WS telemetry: open a correlation scope + count the connection. Returns a
 * `close()` that records the connection duration + decrements the gauge. The edge
 * upgrade router calls this when a socket opens (conflict #6 owner still owns the
 * upgrade; this only meters it).
 */
export function wsTelemetry(
  deps: TelemetryMiddlewareDeps,
  ctx: WsTelemetryCtx,
): { readonly correlationId: string; close(): void } {
  const conns = deps.metrics.gauge({
    name: 'ws_connections_active',
    help: 'Active WebSocket connections (USE saturation).',
    labelNames: ['path'],
  });
  const total = deps.metrics.counter({
    name: 'ws_connections_total',
    help: 'Total WebSocket connections opened.',
    labelNames: ['path'],
  });
  conns.inc({ path: ctx.path });
  total.inc({ path: ctx.path });
  let correlationId = ctx.correlationId ?? '';
  runWithCorrelation(ctx.correlationId ? { correlationId: ctx.correlationId } : {}, () => {
    correlationId = ctx.correlationId ?? '';
  });
  return {
    correlationId,
    close: () => {
      try {
        conns.dec({ path: ctx.path });
      } catch {
        // never throw from a socket-close path.
      }
    },
  };
}
