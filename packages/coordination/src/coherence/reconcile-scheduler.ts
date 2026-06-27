/**
 * reconcile-scheduler — the periodic-trigger contract a cron/loop adapter calls.
 *
 * Coordination does not own a timer loop (that is a runtime concern). It exposes
 * a small contract: `ReconcileTrigger.tick()` runs one reconcile pass and
 * returns its result. An adapter (e.g. a `setInterval`, a cron job, or the
 * engine's loop) calls `tick()` every `intervalMs`. This keeps the package free
 * of process-lifecycle side effects while still describing the cadence.
 *
 * `createIntervalScheduler` is a tiny, optional convenience for a Node timer; it
 * is the ONLY place in this module that touches `setInterval`, and it is not on
 * the pure path. The handle is `unref`-ed so it never keeps the process alive.
 */

import type { ReconcileResult } from './reconciler';

/** What a scheduler drives: a single reconcile pass. */
export interface ReconcileTrigger {
  tick(): Promise<ReconcileResult>;
}

export type SchedulerHandle = {
  /** Stop the periodic trigger. */
  stop(): void;
  /** Run a pass immediately, outside the interval. */
  runNow(): Promise<ReconcileResult>;
};

export type IntervalSchedulerOptions = {
  intervalMs: number;
  /** Called with each pass result (for logging/metrics). Best-effort. */
  onResult?: (result: ReconcileResult) => void;
  /** Called when a pass throws (never lets the timer die). */
  onError?: (error: unknown) => void;
  /** Injectable timer for tests (defaults to global setInterval/clearInterval). */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

/**
 * Drive a `ReconcileTrigger` on a fixed interval. Returns a handle to stop it or
 * run a pass on demand. Errors in a pass are routed to `onError` and never crash
 * the timer (fail-safe per §2.4).
 */
export function createIntervalScheduler(
  trigger: ReconcileTrigger,
  options: IntervalSchedulerOptions,
): SchedulerHandle {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  const runNow = async (): Promise<ReconcileResult> => {
    const result = await trigger.tick();
    options.onResult?.(result);
    return result;
  };

  const timer = setIntervalFn(() => {
    void runNow().catch((error) => options.onError?.(error));
  }, options.intervalMs);

  if (timer && typeof timer === 'object' && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }

  return {
    stop: () => clearIntervalFn(timer),
    runNow,
  };
}
