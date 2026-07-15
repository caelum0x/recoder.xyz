/**
 * `TracerPort` — the tracing boundary every edge/composer opens spans through,
 * decoupled from the OpenTelemetry API. W3C trace-context (`traceparent`) is
 * carried across HTTP/WS/MCP edges via `inject`/`extract`, so a request keeps one
 * trace id end-to-end without any domain importing `@opentelemetry/api`.
 *
 * FROZEN CONTRACT — Phase 11 seam. Degrade-safe: with no OTLP collector the
 * concrete tracer still mints span/trace ids (for correlation + logs) but exports
 * nowhere (`degraded:true`) — spans are never silently dropped as if exported.
 */

/** Carrier headers for trace-context propagation (a plain header map). */
export type TraceCarrier = Record<string, string>;

/** A span attribute value (kept primitive for wire-safety). */
export type SpanAttrValue = string | number | boolean;

/** An open span. `end()` is idempotent; recording after `end()` is a no-op. */
export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  /** Attach a structured attribute (never secrets). */
  setAttribute(key: string, value: SpanAttrValue): void;
  /** Mark the span failed with a reason (sets error status). */
  recordError(reason: string): void;
  /** Close the span, recording its duration. */
  end(): void;
}

/** Options when opening a span. */
export interface SpanOptions {
  /** Parent context extracted from an inbound carrier (continues a trace). */
  readonly parent?: SpanContext;
  readonly attributes?: Readonly<Record<string, SpanAttrValue>>;
}

/** The minimal propagated context (W3C traceparent decomposed). */
export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
  /** W3C trace-flags (1 = sampled). */
  readonly sampled: boolean;
}

export interface TracerPort {
  /** Open a span; caller must `end()` it (or use {@link withSpan}). */
  startSpan(name: string, options?: SpanOptions): Span;
  /** Run `fn` inside a span, ending it (and recording errors) automatically. */
  withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T, options?: SpanOptions): Promise<T>;
  /** Write the current/derived trace context into an outbound carrier. */
  inject(carrier: TraceCarrier, context?: SpanContext): void;
  /** Read a trace context from an inbound carrier (null when absent/malformed). */
  extract(carrier: TraceCarrier): SpanContext | null;
  /** The trace id bound to the current correlation, when one is active. */
  currentTraceId(): string | null;
}
