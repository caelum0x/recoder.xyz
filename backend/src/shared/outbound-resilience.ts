/**
 * outbound-resilience — reusable primitives for surviving flaky egress.
 *
 * Agents drive real outbound calls (LLM gateways, webhooks, git hosts, preview
 * fetches). Two failure modes dominate: transient blips (retry helps) and a hard
 * downstream outage (retrying just amplifies the storm). This module ships the
 * two matching primitives, both deterministic-by-injection so they can be unit
 * tested without real timers, real randomness, or a live network:
 *
 *   - withRetry(op, opts)  — bounded, jittered exponential backoff. Retries ONLY
 *     when the caller marks the operation idempotent (a non-idempotent POST must
 *     never be silently re-sent). Honors a caller AbortSignal at every await.
 *   - CircuitBreaker       — per-key closed→open→half-open state machine. After N
 *     consecutive failures the key trips OPEN and every call fast-fails with an
 *     EGRESS-style error until a cooldown elapses, then a single HALF-OPEN probe
 *     decides whether to close again or re-open.
 *
 * Determinism: the breaker reads time only through an injected `now()` (never
 * Date.now directly), and the retry backoff draws jitter only through an injected
 * `random()` and sleeps only through an injected `sleep()`. Defaults wire the
 * real clock/RNG/timer so production callers need no wiring.
 *
 * This is a standalone primitive — no consumer is wired to it yet (a later slice
 * does that). It intentionally depends on nothing else in the repo.
 */

/* ------------------------------------------------------------------ *
 * Shared injectable time/randomness seams                            *
 * ------------------------------------------------------------------ */

/** Monotonic-enough clock in milliseconds. Injected so timing is testable. */
export type Clock = () => number;

/** Returns a float in [0, 1). Injected so jitter is deterministic in tests. */
export type Random = () => number;

/** Abortable delay. Injected so retries never touch a real timer under test. */
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

const defaultNow: Clock = () => Date.now();
const defaultRandom: Random = () => Math.random();

/** Default sleep: a real timer that rejects promptly when the signal aborts. */
export const defaultSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });

/* ------------------------------------------------------------------ *
 * Abort helpers                                                       *
 * ------------------------------------------------------------------ */

/** Raised when a retry loop (or its sleep) is cut short by an AbortSignal. */
export class RetryAbortedError extends Error {
  readonly code = 'RETRY_ABORTED';
  /** The reason attached to the AbortSignal, if any. */
  readonly reason: unknown;
  constructor(reason?: unknown) {
    super(reason instanceof Error ? reason.message : 'operation aborted');
    this.name = 'RetryAbortedError';
    this.reason = reason;
  }
}

function abortReason(signal?: AbortSignal): unknown {
  const reason = (signal as { reason?: unknown } | undefined)?.reason;
  return reason !== undefined ? reason : new RetryAbortedError();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const reason = abortReason(signal);
    throw reason instanceof Error ? reason : new RetryAbortedError(reason);
  }
}

/* ------------------------------------------------------------------ *
 * Bounded jittered-backoff retry                                      *
 * ------------------------------------------------------------------ */

export interface RetryContext {
  /** 1-based attempt number about to run (1 = first try). */
  readonly attempt: number;
  /** The caller's abort signal, forwarded so the op can honor it too. */
  readonly signal?: AbortSignal;
}

export interface RetryNotice {
  /** The attempt that just failed (1-based). */
  readonly attempt: number;
  /** How long we will sleep before the next attempt, in ms. */
  readonly delayMs: number;
  /** The error that triggered the retry. */
  readonly error: unknown;
}

export interface RetryOptions {
  /**
   * Whether the operation is safe to re-run. Retries happen ONLY when true —
   * a non-idempotent call fails fast on the first error so it is never
   * duplicated. Required (no default) to force the caller to decide.
   */
  readonly idempotent: boolean;
  /** Total attempts including the first. Clamped to >= 1. Default 3. */
  readonly maxAttempts?: number;
  /** Backoff base in ms (attempt 1's uncapped ceiling). Default 100. */
  readonly baseDelayMs?: number;
  /** Upper bound on any single backoff delay, in ms. Default 30_000. */
  readonly maxDelayMs?: number;
  /** Abort at any await point; the pending/next attempt is not run. */
  readonly signal?: AbortSignal;
  /** Injected RNG in [0,1) for jitter. Default Math.random. */
  readonly random?: Random;
  /** Injected abortable delay. Default a real setTimeout. */
  readonly sleep?: Sleep;
  /**
   * Classifier for whether a given error is worth retrying. Default: retry all
   * errors EXCEPT aborts. Abort errors always terminate regardless.
   */
  readonly isRetryable?: (error: unknown) => boolean;
  /** Observability hook fired just before each backoff sleep. */
  readonly onRetry?: (notice: RetryNotice) => void;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 30_000;

function isAbortError(error: unknown): boolean {
  if (error instanceof RetryAbortedError) return true;
  // DOMException('AbortError') from AbortController, and Node's variants.
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * The uncapped-then-capped exponential ceiling for a 1-based attempt:
 * `min(maxDelay, base * 2^(attempt-1))`. Exported for direct unit testing.
 */
export function backoffCeilingMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.max(1, attempt) - 1;
  // Guard against Infinity from a huge shift before the min clamp.
  const raw = baseDelayMs * 2 ** exp;
  return Math.min(maxDelayMs, Number.isFinite(raw) ? raw : maxDelayMs);
}

/**
 * Full-jitter backoff: a uniformly random delay in `[0, ceiling]`. Draws from the
 * injected `random()` so the exact value is reproducible under test. This is the
 * AWS "full jitter" strategy — it spreads retries and avoids thundering herds.
 */
export function nextBackoffDelayMs(
  attempt: number,
  opts: { baseDelayMs?: number; maxDelayMs?: number; random?: Random } = {},
): number {
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const max = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const random = opts.random ?? defaultRandom;
  const ceiling = backoffCeilingMs(attempt, base, max);
  return Math.floor(random() * ceiling);
}

/**
 * Run `op` with bounded retries and jittered exponential backoff.
 *
 * Fails fast (no retry) when: the op is non-idempotent, the error is an abort,
 * `isRetryable` rejects it, or the attempt budget is exhausted. On a retryable
 * failure it sleeps a full-jitter backoff (honoring the signal) and tries again.
 */
export async function withRetry<T>(
  op: (ctx: RetryContext) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const random = opts.random ?? defaultRandom;
  const sleep = opts.sleep ?? defaultSleep;
  const isRetryable = opts.isRetryable ?? (() => true);
  const { signal, onRetry } = opts;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await op({ attempt, signal });
    } catch (error) {
      // Aborts and abort-shaped errors always terminate immediately.
      if (isAbortError(error) || signal?.aborted) {
        throwIfAborted(signal);
        throw error;
      }
      const budgetLeft = attempt < maxAttempts;
      if (!opts.idempotent || !budgetLeft || !isRetryable(error)) {
        throw error;
      }
      const delayMs = nextBackoffDelayMs(attempt, { baseDelayMs, maxDelayMs, random });
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs, signal);
      throwIfAborted(signal);
    }
  }
  // Unreachable: the loop either returns or throws on the final attempt.
  /* c8 ignore next */
  throw new Error('withRetry: exhausted attempts without a terminal result');
}

/* ------------------------------------------------------------------ *
 * Per-key circuit breaker                                             *
 * ------------------------------------------------------------------ */

export type CircuitState = 'closed' | 'open' | 'half-open';

/** Fast-fail error thrown while a circuit is OPEN. EGRESS-style, like the guard. */
export class CircuitOpenError extends Error {
  readonly code = 'EGRESS_CIRCUIT_OPEN';
  readonly key: string;
  /** Estimated ms until the next half-open probe is permitted. */
  readonly retryAfterMs: number;
  constructor(key: string, retryAfterMs: number) {
    super(`circuit open for '${key}' (retry after ${retryAfterMs}ms)`);
    this.name = 'CircuitOpenError';
    this.key = key;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip a closed circuit OPEN. Clamped to >= 1. */
  readonly failureThreshold?: number;
  /** How long a circuit stays OPEN before allowing a half-open probe, in ms. */
  readonly cooldownMs?: number;
  /** Concurrent half-open probes permitted. Clamped to >= 1. Default 1. */
  readonly halfOpenMaxProbes?: number;
  /** Injected clock. Default Date.now. Never reads Date.now internally. */
  readonly now?: Clock;
}

export interface CircuitSnapshot {
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  /** Ms until a probe is allowed (0 unless OPEN). */
  readonly retryAfterMs: number;
  /** In-flight half-open probes. */
  readonly probesInFlight: number;
}

interface CircuitEntry {
  failures: number;
  /** Timestamp the circuit last opened; null while closed. */
  openedAt: number | null;
  /** Reserved half-open probe slots currently in flight. */
  probes: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * A per-key circuit breaker. Keys isolate independent downstreams so one bad
 * host cannot trip calls to a healthy one. All timing flows through the injected
 * clock, making every transition deterministically testable.
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenMaxProbes: number;
  private readonly now: Clock;
  private readonly entries = new Map<string, CircuitEntry>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, Math.floor(options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD));
    this.cooldownMs = Math.max(0, options.cooldownMs ?? DEFAULT_COOLDOWN_MS);
    this.halfOpenMaxProbes = Math.max(1, Math.floor(options.halfOpenMaxProbes ?? 1));
    this.now = options.now ?? defaultNow;
  }

  private entry(key: string): CircuitEntry {
    let e = this.entries.get(key);
    if (!e) {
      e = { failures: 0, openedAt: null, probes: 0 };
      this.entries.set(key, e);
    }
    return e;
  }

  /** Derive the live state for an entry at a given time (pure, no mutation). */
  private stateAt(entry: CircuitEntry, now: number): CircuitState {
    if (entry.openedAt === null) return 'closed';
    return now - entry.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  private retryAfter(entry: CircuitEntry, now: number): number {
    if (entry.openedAt === null) return 0;
    return Math.max(0, this.cooldownMs - (now - entry.openedAt));
  }

  /** Non-mutating view of a key's current state. */
  snapshot(key: string): CircuitSnapshot {
    const entry = this.entry(key);
    const now = this.now();
    const state = this.stateAt(entry, now);
    return {
      state,
      consecutiveFailures: entry.failures,
      retryAfterMs: state === 'open' ? this.retryAfter(entry, now) : 0,
      probesInFlight: entry.probes,
    };
  }

  /** Convenience: current state only. */
  state(key: string): CircuitState {
    return this.stateAt(this.entry(key), this.now());
  }

  /**
   * Gate a call. Throws CircuitOpenError while OPEN (or while a half-open probe
   * is already in flight). On success returns the state under which the call is
   * allowed and RESERVES a probe slot when half-open — so the caller MUST pair
   * every `guard` that returns with exactly one `recordSuccess`/`recordFailure`.
   */
  guard(key: string): 'closed' | 'half-open' {
    const entry = this.entry(key);
    const now = this.now();
    const state = this.stateAt(entry, now);
    if (state === 'open') {
      throw new CircuitOpenError(key, this.retryAfter(entry, now));
    }
    if (state === 'half-open') {
      if (entry.probes >= this.halfOpenMaxProbes) {
        // A probe is already deciding the circuit's fate; keep others out.
        throw new CircuitOpenError(key, this.retryAfter(entry, now));
      }
      entry.probes += 1;
      return 'half-open';
    }
    return 'closed';
  }

  /** Record a successful call: fully closes the circuit and clears failures. */
  recordSuccess(key: string): void {
    const entry = this.entry(key);
    entry.failures = 0;
    entry.openedAt = null;
    entry.probes = 0;
  }

  /**
   * Record a failed call. A half-open probe failure re-opens immediately and
   * restarts the cooldown; a closed-state failure increments the streak and
   * trips OPEN once it reaches the threshold.
   */
  recordFailure(key: string): void {
    const entry = this.entry(key);
    const now = this.now();
    const state = this.stateAt(entry, now);
    if (state === 'half-open') {
      entry.openedAt = now; // probe failed → back to OPEN, restart cooldown
      entry.probes = 0;
      entry.failures = Math.max(entry.failures, this.failureThreshold);
      return;
    }
    if (state === 'open') {
      // A late failure arriving while still cooling: keep it open, don't extend.
      return;
    }
    entry.failures += 1;
    if (entry.failures >= this.failureThreshold) {
      entry.openedAt = now;
      entry.probes = 0;
    }
  }

  /**
   * Run `op` under the breaker: fast-fail if open, execute (optionally with
   * retry), then record the outcome. The one-call-in-flight half-open guarantee
   * and the success/failure bookkeeping are handled for you.
   */
  async execute<T>(
    key: string,
    op: (ctx: RetryContext) => Promise<T>,
    retry?: RetryOptions,
  ): Promise<T> {
    this.guard(key); // throws CircuitOpenError if not permitted
    try {
      const result = retry
        ? await withRetry(op, retry)
        : await op({ attempt: 1 });
      this.recordSuccess(key);
      return result;
    } catch (error) {
      this.recordFailure(key);
      throw error;
    }
  }

  /** Forget a key (or all keys) — resets it to a fresh CLOSED circuit. */
  reset(key?: string): void {
    if (key === undefined) {
      this.entries.clear();
      return;
    }
    this.entries.delete(key);
  }
}
