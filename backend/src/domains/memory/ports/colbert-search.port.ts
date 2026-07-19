/**
 * `ColbertSearchPort` — the FIRST-STAGE late-interaction retriever seam over the
 * owned ColBERT daemon (`backend/engines/py/colbert/rerank_server.py`). Unlike the
 * `RerankerPort` (which only reorders a caller-supplied candidate list), this port
 * SEARCHES a prebuilt per-collection PLAID index and GENERATES candidates — so a
 * passage the single-vector Qdrant top-K misses can still enter retrieval through
 * ColBERT late-interaction.
 *
 * Two capabilities, both degrade-truthful:
 *  - `search(collection, query, k)` → the best-k passages from the built index,
 *    scored by MaxSim. `available:false` (never a fabricated hit) when the daemon
 *    is unconfigured/unreachable, the collection is not built (404), or the heavy
 *    torch/colbert stack is absent (503).
 *  - `ensureIndex(collection, passages)` → build/refresh the per-collection index
 *    (the conductor per-repo index-build path). `built:false` + a truthful reason
 *    on any degrade — an absent engine NEVER blocks a run.
 *
 * The base URL is the SAME daemon the rerank path uses (`colbertRerankUrl`): the
 * one supervised Flask process now serves both `/rerank` and the index surface.
 */

/** One passage hit from a ColBERT index search (best-first). */
export interface ColbertSearchHit {
  /** The passage text stored in the built collection. */
  readonly text: string;
  /** The MaxSim late-interaction score (higher = more relevant). */
  readonly score: number;
  /** The collection-native passage id (position in the built collection). */
  readonly pid?: number;
  /** The rank the searcher assigned (1-based within the returned set). */
  readonly rank?: number;
}

/** Outcome of a ColBERT index search (degrade-truthful). */
export interface ColbertSearchResult {
  /** True only when the index was actually searched and returned a result set. */
  readonly available: boolean;
  /** Best-first passage hits. Always `[]` on any degrade path. */
  readonly hits: readonly ColbertSearchHit[];
  /** Why search was skipped/degraded (only set when `available` is false). */
  readonly reason?: string;
}

/** Outcome of a per-collection index build/refresh. */
export interface ColbertIndexBuildResult {
  /** True only when the daemon confirmed a real index build. */
  readonly built: boolean;
  /** The collection name that was (attempted to be) built. */
  readonly collection: string;
  /** Number of passages submitted to the indexer. */
  readonly documents: number;
  /** Why the build was skipped/degraded (only set when `built` is false). */
  readonly reason?: string;
}

/** The FIRST-STAGE ColBERT retriever + index-maintenance port. */
export interface ColbertSearchPort {
  /** True when a daemon base URL is configured (not liveness — see `search`). */
  configured(): boolean;
  /** Late-interaction search of a built collection; degrade-truthful. */
  search(collection: string, query: string, k: number): Promise<ColbertSearchResult>;
  /** Build/refresh a per-collection index from passages; degrade-truthful. */
  ensureIndex(
    collection: string,
    passages: readonly string[],
    opts?: { readonly overwrite?: boolean },
  ): Promise<ColbertIndexBuildResult>;
}
