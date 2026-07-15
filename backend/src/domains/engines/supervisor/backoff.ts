/**
 * Pure exponential backoff with jitter + cap — shared by the daemon and sidecar
 * supervisors so the restart-loop policy lives in ONE place. No I/O, no timers;
 * callers schedule the returned delay themselves.
 */
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS } from '../constants.js';

/**
 * The delay (ms) before restart attempt `attempt` (0-indexed): an exponential
 * `base * 2^attempt` clamped to `capMs`, then jittered by ±20% so a fleet of
 * crashing daemons does not restart in lockstep (thundering herd).
 */
export function nextBackoff(
  attempt: number,
  capMs: number = BACKOFF_CAP_MS,
  baseMs: number = BACKOFF_BASE_MS,
): number {
  const clampedAttempt = Math.max(0, Math.floor(attempt));
  const raw = Math.min(baseMs * 2 ** clampedAttempt, capMs);
  // ±20% full jitter around the exponential value.
  const jitter = raw * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(raw + jitter));
}

/**
 * A tiny per-engine attempt counter with a max-attempts ceiling. The supervisor
 * calls `next()` to get the delay + advance, `reset()` after a healthy boot, and
 * `exhausted()` to stop looping (truthful `down` instead of an infinite restart).
 */
export class BackoffTracker {
  private attempt = 0;

  constructor(
    private readonly capMs: number = BACKOFF_CAP_MS,
    private readonly maxAttempts: number = Number.POSITIVE_INFINITY,
    private readonly baseMs: number = BACKOFF_BASE_MS,
  ) {}

  /** The delay for the current attempt, then advance the counter. */
  next(): number {
    const delay = nextBackoff(this.attempt, this.capMs, this.baseMs);
    this.attempt += 1;
    return delay;
  }

  /** True when the max-attempts ceiling has been reached (stop restarting). */
  exhausted(): boolean {
    return this.attempt >= this.maxAttempts;
  }

  /** The number of attempts made so far. */
  attempts(): number {
    return this.attempt;
  }

  /** Reset the counter after a successful boot / healthy probe. */
  reset(): void {
    this.attempt = 0;
  }
}
