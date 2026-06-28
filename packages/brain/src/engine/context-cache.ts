import type { BrainContext } from "../domain/brain-context.types";
import type { BrainContextCacheStore } from "../ports/cache.port";
import { estimateContextTokens } from "./context-tokens";

/**
 * The assemble-once cache layer. It sits between the Brain and a
 * {@link BrainContextCacheStore}, turning "re-assemble every call" into
 * "assemble once per (repoRoot, revision, task, source-set), reuse forever after"
 * — the wedge's whole point: read the repo once, every agent reuses it.
 *
 * It is a REAL cache layer, not a thin wrapper:
 *   - it accounts hits/misses and exposes a hit rate;
 *   - on every HIT it attributes the tokens that did NOT have to be re-spent
 *     (a real tokenizer estimate over the reused context) into `tokensSaved`,
 *     the headline value metric the product reports as "X tokens saved by the
 *     shared brain";
 *   - it is degrade-safe: a store that throws on get/set is swallowed (a thrown
 *     get => MISS, a thrown set => the context is still returned), so the cache
 *     is an optimization layer that can never fail an assemble.
 *
 * The store is injectable so the in-memory default can be swapped for a
 * Postgres/Redis-backed store for cross-process / cross-agent reuse.
 */

/** A point-in-time snapshot of the cache's value accounting. */
export interface CacheStats {
  /** Cache hits since construction. */
  readonly hits: number;
  /** Cache misses since construction. */
  readonly misses: number;
  /** hits / (hits + misses); 0 when no reads yet. */
  readonly hitRate: number;
  /**
   * Total estimated tokens saved by reuse — the sum, over every HIT, of the
   * tokens the reused context would have cost to re-assemble and re-feed.
   */
  readonly tokensSaved: number;
}

/** The result of a read-through: the context plus whether it was a hit. */
export interface CacheLookup {
  readonly context: BrainContext | undefined;
  readonly hit: boolean;
  /** On a hit, the tokens this reuse saved (already added to the running total). */
  readonly tokensSavedThisHit: number;
}

export class ContextCache {
  private hits = 0;
  private misses = 0;
  private tokensSaved = 0;

  constructor(private readonly store: BrainContextCacheStore) {}

  /**
   * Look up a key. On a HIT, account the hit and the tokens saved (estimated over
   * the reused context) and return the context. On a MISS (absent OR a thrown
   * store get), account the miss and return undefined so the caller assembles.
   */
  async lookup(key: string): Promise<CacheLookup> {
    let cached: BrainContext | undefined;
    try {
      cached = await this.store.get(key);
    } catch {
      // A failing store is a miss, never an error — fall through to assemble.
      cached = undefined;
    }

    if (cached) {
      // The cached context already carries its estimate; recompute defensively
      // if a pre-cache/legacy entry lacks it, so savings are always real.
      const tokens =
        typeof cached.estimatedTokens === "number"
          ? cached.estimatedTokens
          : estimateContextTokens(cached);
      this.hits += 1;
      this.tokensSaved += tokens;
      return { context: cached, hit: true, tokensSavedThisHit: tokens };
    }

    this.misses += 1;
    return { context: undefined, hit: false, tokensSavedThisHit: 0 };
  }

  /**
   * Store a freshly assembled context under a key. Stamps `estimatedTokens` so a
   * later HIT attributes the right savings without re-walking the whole context.
   * A thrown store set is swallowed — the freshly assembled context is still the
   * caller's to return.
   */
  async store_(key: string, context: BrainContext): Promise<BrainContext> {
    const estimatedTokens =
      typeof context.estimatedTokens === "number"
        ? context.estimatedTokens
        : estimateContextTokens(context);
    const stamped: BrainContext = { ...context, estimatedTokens };
    try {
      await this.store.set(key, stamped);
    } catch {
      // Persisting is best-effort — never fail the assemble on a cache write.
    }
    return stamped;
  }

  /** Invalidate every cached context for a repo (head change / explicit bust). */
  async invalidateRepo(repoRoot: string): Promise<number> {
    try {
      return await this.store.clearRepo(repoRoot);
    } catch {
      return 0;
    }
  }

  /** Invalidate one key (explicit bust). */
  async invalidateKey(key: string): Promise<void> {
    try {
      await this.store.delete(key);
    } catch {
      // best-effort
    }
  }

  /** The current value accounting — hit rate + tokens saved by reuse. */
  stats(): CacheStats {
    const reads = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: reads > 0 ? this.hits / reads : 0,
      tokensSaved: this.tokensSaved,
    };
  }
}
