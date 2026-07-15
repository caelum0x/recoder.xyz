/**
 * `CorrelationContext` — the request/run correlation lifecycle over Node's
 * `AsyncLocalStorage`. A correlation id (+ optional run id + trace id) is derived
 * at the edge (telemetry middleware) or when a run starts, and propagates across
 * every async boundary WITHOUT being threaded through call signatures. The logger,
 * tracer, and metrics labels all read the current correlation from here, so a
 * single request's logs/spans/metrics share one id end-to-end.
 *
 * Foundational for every other signal (implementation order step 2): built before
 * the logging/metrics/tracing adapters so they can label with the active context.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** The immutable correlation carried through a request/run. */
export interface CorrelationContext {
  /** Stable per-request/run id (propagated in the `x-correlation-id` header). */
  readonly correlationId: string;
  /** The Recoder run id, when the work maps to a run. */
  readonly runId?: string;
  /** The W3C trace id, when a span is open. */
  readonly traceId?: string;
  /** The resolved actor id, for audit-linked logs (never a secret). */
  readonly actorId?: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** The current correlation, or `null` outside any `runWithCorrelation` scope. */
export function currentCorrelation(): CorrelationContext | null {
  return storage.getStore() ?? null;
}

/** Just the current correlation id (or `null`). */
export function currentCorrelationId(): string | null {
  return storage.getStore()?.correlationId ?? null;
}

/**
 * Run `fn` inside a fresh correlation scope. A `correlationId` is generated when
 * not supplied. Nested calls create a NEW isolated scope (child runs do not leak
 * their run/trace ids back to the parent).
 */
export function runWithCorrelation<T>(
  seed: Partial<CorrelationContext> | undefined,
  fn: () => T,
): T {
  const context: CorrelationContext = {
    correlationId: seed?.correlationId ?? randomUUID(),
    ...(seed?.runId ? { runId: seed.runId } : {}),
    ...(seed?.traceId ? { traceId: seed.traceId } : {}),
    ...(seed?.actorId ? { actorId: seed.actorId } : {}),
  };
  return storage.run(context, fn);
}

/**
 * Enrich the CURRENT correlation with additional fields (e.g. a trace id minted
 * after the scope opened) without opening a new scope. No-op outside a scope.
 * Immutable: mutates the in-flight store object in place is avoided by re-running
 * is not possible with ALS, so we merge onto the existing frozen store shape.
 */
export function enrichCorrelation(patch: Partial<Omit<CorrelationContext, 'correlationId'>>): void {
  const current = storage.getStore();
  if (!current) return;
  // ALS stores a single object per scope; we replace its enrichable fields in
  // place (the object identity is scope-local, so this stays isolated per request).
  const mutable = current as {
    -readonly [K in keyof CorrelationContext]: CorrelationContext[K];
  };
  if (patch.runId !== undefined) mutable.runId = patch.runId;
  if (patch.traceId !== undefined) mutable.traceId = patch.traceId;
  if (patch.actorId !== undefined) mutable.actorId = patch.actorId;
}

/** Correlation label record for metrics/log fields (only present keys). */
export function correlationLabels(): Record<string, string> {
  const c = storage.getStore();
  if (!c) return {};
  return {
    correlationId: c.correlationId,
    ...(c.runId ? { runId: c.runId } : {}),
    ...(c.traceId ? { traceId: c.traceId } : {}),
  };
}
