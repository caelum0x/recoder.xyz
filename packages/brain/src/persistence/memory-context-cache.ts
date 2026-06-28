import type { BrainContext } from "../domain/brain-context.types";
import type { BrainContextCacheStore } from "../ports/cache.port";
import { repoKeyPrefix } from "../engine/cache-key";

/**
 * The default {@link BrainContextCacheStore}: an in-process Map. This is the
 * "in-memory default" — a real cache store, not a thin wrapper — that backs the
 * assemble-once cache out of the box, with no infrastructure. Because it satisfies
 * the port, a Postgres/Redis store can be dropped in later for cross-process /
 * cross-agent reuse without touching the cache layer or the Brain.
 *
 * Degrade-safe by construction: every operation is a pure Map access that cannot
 * throw, so the cache can only ever be a HIT, a MISS, or a no-op — never a
 * failure that breaks an assemble.
 *
 * An optional `maxEntries` bound keeps the in-memory store from growing without
 * limit in a long-lived process: when full, the oldest-inserted entry is evicted
 * (insertion-ordered Map => FIFO). The bound only affects reuse depth, never
 * correctness — an evicted key simply re-assembles on its next read.
 */
export class InMemoryContextCache implements BrainContextCacheStore {
  private readonly store = new Map<string, BrainContext>();
  private readonly maxEntries: number;

  constructor(options: { maxEntries?: number } = {}) {
    // 0 / negative => unbounded; a sane default keeps memory bounded by default.
    this.maxEntries =
      options.maxEntries === undefined ? 512 : Math.max(0, options.maxEntries);
  }

  async get(key: string): Promise<BrainContext | undefined> {
    return this.store.get(key);
  }

  async set(key: string, value: BrainContext): Promise<void> {
    if (this.maxEntries > 0 && !this.store.has(key)) {
      this.evictIfFull();
    }
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clearRepo(repoRoot: string): Promise<number> {
    const prefix = repoKeyPrefix(repoRoot);
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Current number of cached contexts (for tests / introspection). */
  size(): number {
    return this.store.size;
  }

  /** Evict the oldest-inserted entry when at capacity (FIFO via Map order). */
  private evictIfFull(): void {
    if (this.store.size < this.maxEntries) {
      return;
    }
    const oldest = this.store.keys().next().value;
    if (oldest !== undefined) {
      this.store.delete(oldest);
    }
  }
}

/** Construct the default in-memory context cache store. */
export function createInMemoryContextCache(options?: {
  maxEntries?: number;
}): BrainContextCacheStore {
  return new InMemoryContextCache(options);
}
