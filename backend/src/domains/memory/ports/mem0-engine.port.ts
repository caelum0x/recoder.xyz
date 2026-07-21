/**
 * `Mem0EnginePort` — memory's consumer-owned seam onto the engines mem0 client
 * (`engines/mem0-client.ts`, modes platform | oss | none). The mem0 adapter
 * NEVER value-imports the engines client; bootstrap (the composition root) binds
 * the concrete `mem0Add` / `mem0Search` / `mem0Health` functions to this shape
 * and injects them via `createMemoryModule({ mem0Engine })`.
 *
 * The three-method surface mirrors exactly what the adapter consumes. Degrade
 * posture is unchanged: an unconfigured provider reports `available:false` and
 * empty results, and the adapter maps that to a truthful empty recall / down
 * health — never a fabricated memory. An absent injection degrades identically
 * (the adapter falls back to a truthful `available:false` engine).
 */

/** The identity scope a mem0 read/write is filtered/attributed to. */
export interface Mem0EngineScope {
  readonly userId: string;
  readonly agentId?: string;
  readonly runId?: string;
  readonly metadata?: Record<string, unknown>;
}

/** A chat turn fed into mem0's distillation layer on `add`. */
export interface Mem0EngineMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

/** A single raw mem0 record (`{ id, memory, …extra }`). */
export interface Mem0EngineRecord {
  readonly id: string;
  readonly memory: string;
  readonly [key: string]: unknown;
}

/** Truthful readiness of the mem0 engine (never a faked `up`). */
export interface Mem0EngineHealth {
  readonly available: boolean;
  readonly mode: 'platform' | 'oss' | 'none';
  readonly vectorStore?: string;
  readonly llmProvider?: string;
  readonly embedderProvider?: string;
  readonly reason?: string;
}

/** The outcome of an `add` (best-effort distil + store). */
export interface Mem0EngineAddResult {
  readonly available: boolean;
  readonly reason?: string;
  readonly memories?: readonly Mem0EngineRecord[];
}

/** The outcome of a `search` (`results:[]` when down). */
export interface Mem0EngineSearchResult {
  readonly available: boolean;
  readonly reason?: string;
  readonly results: readonly Mem0EngineRecord[];
}

/** The engines mem0 client, narrowed to the surface the memory adapter consumes. */
export interface Mem0EnginePort {
  /** Distil + store facts from `messages`. */
  add(
    messages: readonly Mem0EngineMessage[],
    scope: Mem0EngineScope,
  ): Promise<Mem0EngineAddResult>;
  /** Search distilled memories for `query` within `scope`. */
  search(
    query: string,
    scope: Mem0EngineScope,
    limit?: number,
  ): Promise<Mem0EngineSearchResult>;
  /** Truthful readiness (mode + reason). */
  health(): Promise<Mem0EngineHealth>;
}
