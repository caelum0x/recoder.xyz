/**
 * `createCorrelatedLogger` — wraps the shared `@recoder/logger` (pino) sink with
 * three observability concerns, WITHOUT reimplementing logging:
 *
 *  1. correlation — every log line is enriched with the current
 *     `correlationId`/`runId`/`traceId` from {@link correlationLabels}, so a
 *     request's logs join its spans + metrics.
 *  2. redaction — configured keys (`authorization`, `cookie`, `token`, …) are
 *     replaced with `[redacted]` before the record is emitted, so a secret never
 *     reaches the log transport.
 *  3. ring buffer — a bounded {@link LogRingBuffer} keeps the last N structured
 *     records in memory to feed the cockpit ops log surface (no re-read from disk).
 *
 * The underlying pino instance is unchanged; this is a thin decorator that binds
 * the two cross-cutting mixins pino already supports (child + redact) plus a
 * transport-side tap for the ring buffer.
 */
import type { Logger } from '../../../shared/logger.js';
import { childLogger } from '../../../shared/logger.js';
import { correlationLabels } from '../services/correlation.service.js';

/** One captured structured log record kept in the ring. */
export interface LogRecord {
  readonly level: string;
  readonly time: string;
  readonly domain?: string;
  readonly msg: string;
  readonly correlationId?: string;
  readonly runId?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

/**
 * A bounded FIFO ring of the most-recent structured log records. Feeds the ops
 * surface; never grows unbounded. Push is O(1); `recent()` returns a copy.
 */
export class LogRingBuffer {
  private readonly buf: LogRecord[] = [];
  constructor(private readonly capacity: number) {}

  push(record: LogRecord): void {
    this.buf.push(record);
    if (this.buf.length > this.capacity) this.buf.shift();
  }

  /** The last `limit` records (newest last), a defensive copy. */
  recent(limit = 100): readonly LogRecord[] {
    const n = Math.max(0, Math.min(limit, this.buf.length));
    return this.buf.slice(this.buf.length - n);
  }

  get size(): number {
    return this.buf.length;
  }

  clear(): void {
    this.buf.length = 0;
  }
}

const REDACTED = '[redacted]';

/** Recursively replace any key in `redactSet` (case-insensitive) with `[redacted]`. */
export function redactFields(
  value: unknown,
  redactSet: ReadonlySet<string>,
  depth = 0,
): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactFields(v, redactSet, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (redactSet.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = redactFields(v, redactSet, depth + 1);
    }
  }
  return out;
}

export interface CorrelatedLoggerDeps {
  /** Domain label bound onto the child logger (e.g. `'edge'`). */
  readonly domain: string;
  /** Keys redacted from every emitted record. */
  readonly redactKeys: readonly string[];
  /** The shared ring buffer that feeds the ops log surface. */
  readonly ring: LogRingBuffer;
  /** Optional base logger (defaults to the shared `childLogger(domain)`). */
  readonly base?: Logger;
}

/**
 * The correlated logger surface. Mirrors the subset of pino used across the spine;
 * each method enriches with correlation labels, redacts, taps the ring, and
 * delegates to the underlying pino child.
 */
export interface CorrelatedLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  warn(msg: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  error(msg: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
  debug(msg: string): void;
  /** The bound pino child (for handing to code that wants the raw Logger). */
  readonly pino: Logger;
}

/** Build the correlated logger over the shared pino sink. */
export function createCorrelatedLogger(deps: CorrelatedLoggerDeps): CorrelatedLogger {
  const redactSet = new Set(deps.redactKeys.map((k) => k.toLowerCase()));
  const base = deps.base ?? childLogger(deps.domain);

  const emit = (
    level: 'info' | 'warn' | 'error' | 'debug',
    a: Record<string, unknown> | string,
    b?: string,
  ): void => {
    const labels = correlationLabels();
    const msg = typeof a === 'string' ? a : b ?? '';
    const rawFields = typeof a === 'string' ? {} : a;
    const fields = redactFields({ ...rawFields, ...labels }, redactSet) as Record<string, unknown>;

    deps.ring.push({
      level,
      time: new Date().toISOString(),
      domain: deps.domain,
      msg,
      ...(labels.correlationId ? { correlationId: labels.correlationId } : {}),
      ...(labels.runId ? { runId: labels.runId } : {}),
      fields,
    });

    // Delegate to pino (which applies its own transport). Pass fields then msg.
    (base[level] as (o: unknown, m?: string) => void)(fields, msg);
  };

  return {
    info: (a: Record<string, unknown> | string, b?: string) => emit('info', a, b),
    warn: (a: Record<string, unknown> | string, b?: string) => emit('warn', a, b),
    error: (a: Record<string, unknown> | string, b?: string) => emit('error', a, b),
    debug: (a: Record<string, unknown> | string, b?: string) => emit('debug', a, b),
    pino: base,
  };
}
