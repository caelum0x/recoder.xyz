/**
 * `Mem0Port` — the semantic per-user memory seam (mem0 over Qdrant, BYOK
 * embeddings). The concrete impl (`adapters/mem0.adapter.ts`) wraps
 * `backend/src/engines/mem0-client.ts` (platform | oss | none).
 *
 * DEGRADE CONTRACT: no MEM0_API_KEY and no self-hostable LLM+embedder →
 * `available:false` and `search → []`. Recall fusion drops the mem0 source
 * rather than fabricating memories. Nothing here throws to a caller.
 */

/** The identity scope a mem0 read/write is filtered/attributed to. */
export interface Mem0Scope {
  /** App-layer owner id (mem0 `user_id` filter). */
  readonly userId: string;
  readonly agentId?: string;
  readonly runId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A single semantic memory record returned by mem0. */
export interface Mem0Result {
  /** mem0-native memory id (used as provenance ref). */
  readonly id: string;
  /** The distilled memory text. */
  readonly memory: string;
  /** Relevance score when mem0 supplies one (`[0,1]`), else undefined. */
  readonly score?: number;
}

/** A chat turn fed into mem0's distillation layer on `add`. */
export interface Mem0Message {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

/** Truthful availability of the mem0 seam. */
export interface Mem0Availability {
  readonly available: boolean;
  readonly mode: 'platform' | 'oss' | 'none';
  readonly reason?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/** The truthful outcome of a maintenance consolidation/decay sweep. */
export interface Mem0ConsolidateResult {
  /** True only when a real batch consolidate ran (never a faked success). */
  readonly ok: boolean;
  /** Truthful reason when the sweep was a no-op or skipped (e.g. inline mode). */
  readonly reason?: string;
}

/** The semantic per-user memory port. */
export interface Mem0Port {
  /** Search distilled memories for `query` within `scope`. `[]` when down. */
  search(
    query: string,
    scope: Mem0Scope,
    limit?: number
  ): Promise<readonly Mem0Result[]>;
  /** Distil + store facts from `messages`. No-op (best-effort) when down. */
  add(
    messages: readonly Mem0Message[],
    scope: Mem0Scope
  ): Promise<{ ok: boolean; reason?: string }>;
  /** Truthful readiness (mode + reason), never a faked `up`. */
  health(): Promise<Mem0Availability>;
  /**
   * OPTIONAL periodic decay/consolidation sweep (maintenance driver only).
   *
   * mem0's real consolidation (LLM fact-merge / dedup / decay) runs INLINE on
   * every `add`, so the in-lib client has no separate batch trigger and this
   * returns a truthful no-op. When a self-hosted sidecar is wired it drives the
   * sidecar's batch consolidate endpoint. Degrade-safe: absent/unreachable →
   * `{ ok:false, reason }`, never a faked success.
   */
  consolidate?(scope?: Mem0Scope): Promise<Mem0ConsolidateResult>;
}
