import type { BrainContext } from "../domain/brain-context.types";

/**
 * The store the assemble-once cache writes through. It is intentionally minimal
 * and value-typed (BrainContext in, BrainContext out) so a concrete backend
 * (in-memory by default; a Postgres/Redis impl later) can satisfy it without the
 * cache layer leaking storage details. The key is the content-addressed cache
 * key (see engine/cache-key.ts): a hash of (repoRoot, taskId, revision,
 * source-set). All operations are async so a network-backed store fits the same
 * contract.
 *
 * Implementations MUST be degrade-safe: a get on an absent/failed store should
 * resolve `undefined` (a miss), and a set should never reject in a way that fails
 * an assemble — the cache is an optimization, never a correctness dependency.
 */
export interface BrainContextCacheStore {
  /** Return the cached context for a key, or undefined on a miss. */
  get(key: string): Promise<BrainContext | undefined>;
  /** Store a context under a key (overwrites). */
  set(key: string, value: BrainContext): Promise<void>;
  /** Remove one key (explicit bust). */
  delete(key: string): Promise<void>;
  /**
   * Remove every key whose content was assembled for `repoRoot` — used by
   * refresh() to invalidate a repo's contexts wholesale on a head change or an
   * explicit bust. Returns the number of entries removed.
   */
  clearRepo(repoRoot: string): Promise<number>;
}
