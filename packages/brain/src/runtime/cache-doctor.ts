import type { CacheStats } from "../engine/context-cache";

/**
 * Cache doctor — the truthful surface for the Brain's headline value metric:
 * "how many tokens has the shared brain saved by assembling once and reusing?".
 *
 * Where {@link runDoctor} reports which engines are LIVE and
 * {@link runCodeGraphDoctor} proves the code graph is indexed, this reports the
 * REUSE accounting: cache hits, misses, hit rate, and the cumulative tokens saved
 * — exactly the number the product reports as "X tokens saved by the shared
 * brain". It is a pure projection of a {@link CacheStats} snapshot (from
 * `Brain.cacheStats()`), so it is deterministic and never throws.
 *
 * `available` means the brain has been READ at least once (hits + misses > 0):
 * with no reads there is nothing to report yet, which is honest rather than a
 * fake "0 tokens saved, all good".
 */

/** The cache health surfaced alongside the engine + code-graph doctors. */
export interface CacheReport {
  /** True once the brain has been read at least once (there is data to report). */
  readonly available: boolean;
  /** Cache hits — reads served from a previously assembled context. */
  readonly hits: number;
  /** Cache misses — reads that triggered a fresh assembly. */
  readonly misses: number;
  /** hits / (hits + misses), 0..1. */
  readonly hitRate: number;
  /** Cumulative estimated tokens saved by reuse — the headline metric. */
  readonly tokensSaved: number;
  /** Human-readable summary the product can show directly. */
  readonly detail: string;
}

/** Round a 0..1 rate to a whole-number percentage for readable detail text. */
function asPercent(rate: number): number {
  return Math.round(rate * 100);
}

/**
 * Project a {@link CacheStats} snapshot into a truthful {@link CacheReport}.
 * Pure — pass `brain.cacheStats()`.
 */
export function runCacheDoctor(stats: CacheStats): CacheReport {
  const reads = stats.hits + stats.misses;
  if (reads === 0) {
    return {
      available: false,
      hits: 0,
      misses: 0,
      hitRate: 0,
      tokensSaved: 0,
      detail:
        "shared brain not yet read — no assemble-once reuse to report (0 reads)",
    };
  }
  return {
    available: true,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hitRate,
    tokensSaved: stats.tokensSaved,
    detail: `shared brain saved ~${stats.tokensSaved} tokens across ${reads} read(s): ${stats.hits} hit(s) / ${stats.misses} miss(es) (${asPercent(stats.hitRate)}% reuse)`,
  };
}
