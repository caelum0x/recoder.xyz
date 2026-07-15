/**
 * `OtelTracer` — the concrete {@link TracerPort}. It mints W3C-compatible trace/
 * span ids and propagates `traceparent` across edges, and exports finished spans
 * to an OTLP-HTTP collector when one is configured — degrading to a NO-OP exporter
 * when it is not (`degraded:true`): spans are still created (for log/metric
 * correlation) but not shipped anywhere, which is reported truthfully rather than
 * pretending traces are being collected.
 *
 * It is self-contained (no `@opentelemetry/*` runtime dependency) so tracing works
 * out of the box; the same port can be re-backed by the OTel `NodeSDK` later
 * without changing any call site. `startTracing`/`shutdownTracing` are the
 * lifecycle hooks bootstrap drives.
 */
import { randomBytes } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type {
  Span,
  SpanContext,
  SpanOptions,
  TraceCarrier,
  TracerPort,
} from '../ports/tracer.port.js';
import { correlationLabels, enrichCorrelation } from '../services/correlation.service.js';

/** A finished span shipped to the exporter. */
export interface FinishedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startUnixNano: number;
  readonly endUnixNano: number;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly error?: string;
}

/** The exporter seam — real OTLP or the degrade-safe no-op. */
export interface SpanExporter {
  readonly kind: 'otlp' | 'noop';
  export(span: FinishedSpan): void;
}

/** A no-op exporter: spans are dropped after creation (no collector configured). */
export function createNoopExporter(): SpanExporter {
  return { kind: 'noop', export: () => undefined };
}

/**
 * An OTLP-HTTP exporter that POSTs each finished span (best-effort, fire-and-
 * forget). A transport failure is logged, never thrown into the traced path.
 */
export function createOtlpExporter(endpoint: string, logger: Logger): SpanExporter {
  return {
    kind: 'otlp',
    export: (span) => {
      // Best-effort async ship; the traced request never awaits or fails on this.
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(span),
      }).catch((err: unknown) => {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err), endpoint },
          'otlp span export failed (degrading silently for this span)',
        );
      });
    },
  };
}

const HEX = '0123456789abcdef';
function randHex(bytes: number): string {
  const buf = randomBytes(bytes);
  let out = '';
  for (const b of buf) out += HEX[(b >> 4) & 0xf] + HEX[b & 0xf];
  return out;
}

/** Parse a W3C `traceparent` header: `00-<32hex>-<16hex>-<2hex>`. */
export function parseTraceparent(value: string | undefined): SpanContext | null {
  if (!value) return null;
  const parts = value.trim().split('-');
  if (parts.length !== 4) return null;
  const [version, traceId, spanId, flags] = parts;
  if (version !== '00') return null;
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === '0'.repeat(32)) return null;
  if (!/^[0-9a-f]{16}$/.test(spanId) || spanId === '0'.repeat(16)) return null;
  return { traceId, spanId, sampled: (parseInt(flags, 16) & 0x01) === 1 };
}

/** Format a {@link SpanContext} as a W3C `traceparent` header. */
export function formatTraceparent(ctx: SpanContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? '01' : '00'}`;
}

export interface OtelTracerDeps {
  readonly logger: Logger;
  /** OTLP endpoint; `null` ⇒ the no-op exporter (degraded). */
  readonly otlpEndpoint: string | null;
  /** Head sampling ratio [0,1]. */
  readonly sampleRatio: number;
}

export class OtelTracer implements TracerPort {
  private exporter: SpanExporter;
  private readonly sampleRatio: number;
  private readonly logger: Logger;

  constructor(deps: OtelTracerDeps) {
    this.logger = deps.logger;
    this.sampleRatio = deps.sampleRatio;
    this.exporter = deps.otlpEndpoint
      ? createOtlpExporter(deps.otlpEndpoint, deps.logger)
      : createNoopExporter();
  }

  /** True when spans are actually exported (not the no-op). */
  get exporting(): boolean {
    return this.exporter.kind === 'otlp';
  }

  startSpan(name: string, options?: SpanOptions): Span {
    const parent = options?.parent;
    const traceId = parent?.traceId ?? randHex(16);
    const spanId = randHex(8);
    const sampled = parent ? parent.sampled : Math.random() < this.sampleRatio;
    const startNano = Date.now() * 1e6;
    const attributes: Record<string, string | number | boolean> = { ...(options?.attributes ?? {}) };
    let ended = false;
    let error: string | undefined;

    // Bind the trace id onto the active correlation so logs join this span.
    enrichCorrelation({ traceId });

    const exporter = this.exporter;
    return {
      traceId,
      spanId,
      setAttribute: (key, value) => {
        if (!ended) attributes[key] = value;
      },
      recordError: (reason) => {
        if (!ended) error = reason;
      },
      end: () => {
        if (ended) return;
        ended = true;
        if (!sampled) return;
        exporter.export({
          traceId,
          spanId,
          ...(parent?.spanId ? { parentSpanId: parent.spanId } : {}),
          name,
          startUnixNano: startNano,
          endUnixNano: Date.now() * 1e6,
          attributes,
          ...(error ? { error } : {}),
        });
      },
    };
  }

  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    options?: SpanOptions,
  ): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      return await fn(span);
    } catch (err) {
      span.recordError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      span.end();
    }
  }

  inject(carrier: TraceCarrier, context?: SpanContext): void {
    const traceId = context?.traceId ?? correlationLabels().traceId;
    if (!traceId) return;
    const ctx: SpanContext = {
      traceId,
      spanId: context?.spanId ?? randHex(8),
      sampled: context?.sampled ?? true,
    };
    carrier.traceparent = formatTraceparent(ctx);
  }

  extract(carrier: TraceCarrier): SpanContext | null {
    return parseTraceparent(carrier.traceparent ?? carrier.Traceparent);
  }

  currentTraceId(): string | null {
    return correlationLabels().traceId ?? null;
  }

  /** Swap in a live OTLP exporter (lifecycle start). Idempotent. */
  start(): void {
    // Exporter is chosen at construction; nothing async to open for HTTP OTLP.
    this.logger.debug({ exporting: this.exporting }, 'tracer started');
  }

  /** Drop the exporter to no-op (lifecycle stop). Idempotent, degrade-safe. */
  shutdown(): void {
    this.exporter = createNoopExporter();
  }
}

/** Build + start the tracer (lifecycle helper). */
export function startTracing(deps: OtelTracerDeps): OtelTracer {
  const tracer = new OtelTracer(deps);
  tracer.start();
  return tracer;
}

/** Shut a tracer down (lifecycle helper). */
export function shutdownTracing(tracer: OtelTracer): void {
  tracer.shutdown();
}
