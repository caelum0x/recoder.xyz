import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraceContext {
  /** Unique trace ID for the entire request chain */
  traceId: string;
  /** Span ID for this specific operation */
  spanId: string;
  /** Parent span ID (if this is a child operation) */
  parentSpanId?: string;
  /** Agent ID that originated the request */
  originAgentId?: string;
  /** Timestamp when this trace started */
  startedAt: number;
  /** Baggage: arbitrary key-value pairs propagated through the trace */
  baggage: Record<string, string>;
}

export interface SpanOptions {
  operationName: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface CompletedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRACE_PREFIX = 'trc_';
const SPAN_PREFIX = 'spn_';
const MAX_COMPLETED_SPANS = 10_000;

/** URL-safe random ID (similar to nanoid but without the dependency). */
function randomId(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class A2ATraceService {
  private storage = new AsyncLocalStorage<TraceContext>();
  private completedSpans: CompletedSpan[] = [];

  // ---- Context accessors --------------------------------------------------

  /** Get the current trace context (or undefined if none). */
  getCurrentContext(): TraceContext | undefined {
    return this.storage.getStore();
  }

  /** Get the current trace ID (or 'no-trace'). */
  getTraceId(): string {
    return this.storage.getStore()?.traceId ?? 'no-trace';
  }

  /** Get the current span ID (or 'no-span'). */
  getSpanId(): string {
    return this.storage.getStore()?.spanId ?? 'no-span';
  }

  // ---- Running within context ---------------------------------------------

  /** Run a function within a new trace context. */
  runWithTrace<T>(traceId: string, fn: () => T): T {
    const spanId = this.generateSpanId();
    const ctx: TraceContext = {
      traceId,
      spanId,
      startedAt: Date.now(),
      baggage: {},
    };
    return this.storage.run(ctx, fn);
  }

  /**
   * Run a function within a child span (inherits parent trace).
   * If no parent trace is active, a new root trace is created.
   */
  runWithSpan<T>(options: SpanOptions, fn: () => T | Promise<T>): T | Promise<T> {
    const parent = this.storage.getStore();
    const traceId = parent?.traceId ?? this.generateTraceId();
    const spanId = this.generateSpanId();
    const parentSpanId = parent?.spanId;

    const childCtx: TraceContext = {
      traceId,
      spanId,
      parentSpanId,
      originAgentId: parent?.originAgentId,
      startedAt: Date.now(),
      baggage: { ...(parent?.baggage ?? {}) },
    };

    const recordCompleted = (startedAt: number, status: 'ok' | 'error', error?: string) => {
      const endedAt = Date.now();
      const span: CompletedSpan = {
        traceId,
        spanId,
        parentSpanId,
        operationName: options.operationName,
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        attributes: options.attributes ? { ...options.attributes } : {},
        status,
        error,
      };
      this.completedSpans.push(span);
      if (this.completedSpans.length > MAX_COMPLETED_SPANS) {
        this.completedSpans.shift();
      }
    };

    return this.storage.run(childCtx, () => {
      const startedAt = Date.now();
      let result: T | Promise<T>;
      try {
        result = fn();
      } catch (err: any) {
        recordCompleted(startedAt, 'error', err?.message ?? String(err));
        throw err;
      }

      // Handle async results
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            recordCompleted(startedAt, 'ok');
            return value;
          },
          (err: any) => {
            recordCompleted(startedAt, 'error', err?.message ?? String(err));
            throw err;
          },
        ) as T | Promise<T>;
      }

      recordCompleted(startedAt, 'ok');
      return result;
    });
  }

  // ---- ID generation ------------------------------------------------------

  /** Generate a new trace ID in format trc_<21 chars>. */
  generateTraceId(): string {
    return `${TRACE_PREFIX}${randomId(21)}`;
  }

  /** Generate a new span ID in format spn_<16 chars>. */
  generateSpanId(): string {
    return `${SPAN_PREFIX}${randomId(16)}`;
  }

  // ---- Header extraction / propagation ------------------------------------

  /**
   * Extract trace ID from request headers.
   *
   * Priority:
   * 1. `x-trace-id` (custom header)
   * 2. `traceparent` (W3C Trace Context format: 00-<traceId>-<spanId>-<flags>)
   * 3. undefined (caller should generate a new trace ID)
   */
  extractTraceId(headers: Record<string, string | string[] | undefined>): string | undefined {
    // 1. Custom header
    const customTraceId = headers['x-trace-id'];
    if (customTraceId) {
      const value = Array.isArray(customTraceId) ? customTraceId[0] : customTraceId;
      if (value) return value;
    }

    // 2. W3C traceparent: 00-<traceId>-<spanId>-<flags>
    const traceparent = headers['traceparent'];
    if (traceparent) {
      const value = Array.isArray(traceparent) ? traceparent[0] : traceparent;
      if (value) {
        const parts = value.split('-');
        if (parts.length >= 2 && parts[1]) {
          return parts[1];
        }
      }
    }

    return undefined;
  }

  /**
   * Build propagation headers for outgoing requests.
   * Returns empty object if no trace context is active.
   */
  buildPropagationHeaders(): Record<string, string> {
    const ctx = this.storage.getStore();
    if (!ctx) return {};

    const headers: Record<string, string> = {
      'x-trace-id': ctx.traceId,
      'x-span-id': ctx.spanId,
    };

    if (ctx.parentSpanId) {
      headers['x-parent-span-id'] = ctx.parentSpanId;
    }

    return headers;
  }

  // ---- Span queries -------------------------------------------------------

  /** Get all completed spans (for testing / debugging). */
  getCompletedSpans(): CompletedSpan[] {
    return [...this.completedSpans];
  }

  /** Get completed spans for a specific trace. */
  getSpansForTrace(traceId: string): CompletedSpan[] {
    return this.completedSpans.filter((s) => s.traceId === traceId);
  }

  // ---- Reset --------------------------------------------------------------

  /** Reset all state. */
  reset(): void {
    this.completedSpans = [];
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let singleton: A2ATraceService | null = null;

export function getTraceService(): A2ATraceService {
  if (!singleton) {
    singleton = new A2ATraceService();
  }
  return singleton;
}

export function resetTraceService(): void {
  if (singleton) {
    singleton.reset();
  }
  singleton = null;
}
