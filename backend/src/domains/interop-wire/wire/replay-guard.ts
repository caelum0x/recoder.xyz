/**
 * `replay-guard` — a TTL-bounded, in-process seen-cache that gives the signed
 * ingress gates REPLAY protection. A signed A2A envelope carries a unique id
 * (`jti`); once a signature has been ADMITTED, presenting the SAME `jti` again
 * within its validity window is a replay and must be rejected (fail-closed).
 *
 * The guard is deliberately tiny and dependency-free:
 *   - keyed by `jti` (the signed-envelope id),
 *   - each entry expires at the envelope's `expires_at` (or `now + maxTtlMs`
 *     when the envelope declares no expiry),
 *   - expired entries are purged lazily on every `remember` call, and the map
 *     is size-capped (oldest-first eviction) so a flood of distinct jtis can
 *     never grow it without bound.
 *
 * It is pure in-process state — no DB, no network — and is INJECTABLE and
 * `clear()`-able so tests can drive it deterministically.
 */

/** Per-call clock + expiry hints for a `remember` check. */
export interface ReplayRememberOptions {
  /** Injected wall-clock (ms since epoch); defaults to `Date.now()`. */
  readonly nowMs?: number;
  /**
   * The envelope's `expires_at` as ms since epoch. When present+finite the seen
   * entry lives until then (covering the full validity window); otherwise the
   * entry lives for `maxTtlMs`.
   */
  readonly expiresAtMs?: number;
}

/** The replay seen-cache surface the ingress gates depend on. */
export interface ReplayGuard {
  /**
   * Record `jti` as seen and report whether this was the FIRST presentation.
   * Returns `true` when the jti was not previously seen (now recorded); returns
   * `false` when it is a REPLAY of a still-live entry (caller must reject).
   */
  remember(jti: string, options?: ReplayRememberOptions): boolean;
  /** Drop all seen entries (test isolation / operational reset). */
  clear(): void;
  /** Current live-entry count (after no purge is forced) — for tests/metrics. */
  size(): number;
}

/** Construction knobs for the replay guard (all optional; safe defaults). */
export interface ReplayGuardConfig {
  /**
   * Fallback entry lifetime for envelopes with no `expires_at`, and the horizon
   * over which replays are rejected for such envelopes. Default: 10 minutes.
   */
  readonly maxTtlMs?: number;
  /**
   * Hard cap on retained entries; when exceeded the oldest-inserted entries are
   * evicted first. Default: 10_000.
   */
  readonly maxEntries?: number;
}

const DEFAULT_MAX_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * Build an in-process replay guard. Insertion-ordered `Map` gives us both O(1)
 * membership and cheap oldest-first eviction (Map preserves insertion order).
 */
export function createReplayGuard(config: ReplayGuardConfig = {}): ReplayGuard {
  const maxTtlMs = config.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  // jti → absolute expiry (ms since epoch). Insertion order = age order.
  const seen = new Map<string, number>();

  return {
    remember(jti: string, options: ReplayRememberOptions = {}): boolean {
      const nowMs = options.nowMs ?? Date.now();
      // Lazy purge. Entries are insertion-ordered, not expiry-ordered, so we
      // cannot early-break on the first live entry; scan and drop the dead ones.
      for (const [key, expiryMs] of seen) {
        if (expiryMs <= nowMs) seen.delete(key);
      }
      const existing = seen.get(jti);
      if (existing !== undefined && existing > nowMs) {
        // A still-live entry for this jti ⇒ this is a replay. Do NOT refresh it.
        return false;
      }
      // First presentation (or a previously-expired one just purged): record it.
      const expiresAtMs = options.expiresAtMs;
      const expiry =
        typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs)
          ? expiresAtMs
          : nowMs + maxTtlMs;
      // Re-insert at the tail so age ordering stays correct for eviction.
      seen.delete(jti);
      seen.set(jti, expiry);
      // Size cap: evict oldest-inserted entries until within bound.
      while (seen.size > maxEntries) {
        const oldest = seen.keys().next().value;
        if (oldest === undefined) break;
        seen.delete(oldest);
      }
      return true;
    },
    clear(): void {
      seen.clear();
    },
    size(): number {
      return seen.size;
    },
  };
}
