/**
 * Memory & Retrieval domain types — pure data shapes with no logic and no
 * imports from concrete adapters, so any layer (ports, adapters, retrieval,
 * recall, lifecycle, composer, tests) can use them without a cycle.
 *
 * Canonical `MemoryItem` / `MemoryCandidate` shapes live in `@recoder/agent-os`
 * (the store-of-record); this module only adds the domain-local shapes that
 * package does not carry: recall/fusion projections, provenance, retrieval
 * ingest input, and the NEW `memory_relations` row + relation kinds.
 */

// ── Relations (NEW — this domain owns `memory_relations`) ─────────────────────

/** The kind of edge between two durable memory items. */
export type RelationKind = 'supersedes' | 'derived-from' | 'contradicts' | 'relates-to';

/** The immutable set of legal relation kinds (validation + iteration). */
export const RELATION_KINDS: readonly RelationKind[] = [
  'supersedes',
  'derived-from',
  'contradicts',
  'relates-to',
] as const;

/** Is a string a legal relation kind? */
export function isRelationKind(value: string): value is RelationKind {
  return (RELATION_KINDS as readonly string[]).includes(value);
}

/** A single row in `memory_relations` (memory-domain-owned). */
export interface MemoryRelation {
  readonly relationId: string;
  /** App-layer owner id — the `WHERE user_id = :user_id` guard value. */
  readonly userId: string;
  readonly fromMemoryId: string;
  readonly toMemoryId: string;
  readonly kind: RelationKind;
  readonly createdAt: string;
}

// ── Recall + fusion projections ───────────────────────────────────────────────

/** Which memory source a recalled item came from. */
export type MemorySource = 'mem0' | 'beads' | 'candidates' | 'items' | 'colbert';

/** The immutable set of fusible recall sources. */
export const MEMORY_SOURCES: readonly MemorySource[] = [
  'mem0',
  'beads',
  'candidates',
  'items',
  'colbert',
] as const;

/** Provenance tag attached to every recalled memory (truthful attribution). */
export interface Provenance {
  /** Which source produced this recall. */
  readonly source: MemorySource;
  /** The source-native id (mem0 memory id, bd issue id, candidate/item id). */
  readonly ref: string;
  /** The score the source (or reranker) assigned, in `[0, 1]` when available. */
  readonly score: number;
  /** The scope this memory was recalled under, when known. */
  readonly scope?: string;
}

/** A recalled memory, normalized across sources and provenance-tagged. */
export interface RecalledMemory {
  /** Stable id for dedupe/ordering (source ref, or a hash when absent). */
  readonly id: string;
  /** Optional short title (mem0/beads may have none). */
  readonly title?: string;
  /** The memory text (the fact/pattern recalled). */
  readonly body: string;
  /** Truthful attribution — never fabricated. */
  readonly provenance: Provenance;
}

/** A recall request (fusion input). Tenant-scoped by `userId`. */
export interface RecallQuery {
  /** Free-text query the caller wants relevant memories for. */
  readonly query: string;
  /** App-layer owner id — every source is filtered to this user. */
  readonly userId: string;
  /** Optional scope narrowing (user|org|space|repo|path|agent|task-type). */
  readonly scope?: string;
  /** Optional scope ref (spaceId / repo path) when the scope is narrowed. */
  readonly scopeRef?: string;
  /** Max memories to return after fusion. Default applied by the fusion service. */
  readonly limit?: number;
}

/** Per-source availability at fusion time (truthful; drives partial results). */
export interface SourceAvailability {
  readonly source: MemorySource;
  readonly available: boolean;
  /** Why a source was skipped/degraded (only set when not `available`). */
  readonly reason?: string;
}

/** The fused, deduped, provenance-tagged recall result. */
export interface FusionResult {
  /** Fused memories, best-first, after rerank + dedupe. */
  readonly memories: readonly RecalledMemory[];
  /** Which sources contributed vs. degraded (truthful partial recall). */
  readonly sources: readonly SourceAvailability[];
  /**
   * Which reranker actually ran: `colbert` (late-interaction, sidecar up),
   * `lexical` (BM25-ish pure-TS fallback when ColBERT is down but the query
   * overlaps the pool), or `identity` (nothing could rank — order is
   * source-score descending).
   */
  readonly reranker: 'colbert' | 'lexical' | 'identity';
  /** Why ColBERT did NOT rank this recall. Set ONLY on a degraded rerank (`lexical`/`identity` after a real degrade) — truthful marker, never set when `colbert` ran. */
  readonly rerankerReason?: string;
}

// ── Retrieval (RAG) input ─────────────────────────────────────────────────────

/** A document to ingest into the retrieval index (inline text OR a file path). */
export interface IngestDoc {
  /** Inline document text. Takes precedence over `path` when both are set. */
  readonly text?: string;
  /** Filesystem path to read (PDF via preprocessor, else UTF-8). */
  readonly path?: string;
  /** Logical document id (grouping key stored in each chunk's payload). */
  readonly docId?: string;
  /** Human-readable source label (filename, URL, title). */
  readonly source?: string;
  /** Extra payload merged into every chunk point. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── Engine health rollup ──────────────────────────────────────────────────────

/** The set of engines the memory module fronts, for the health rollup. */
export type MemoryEngineName = 'mem0' | 'beads' | 'colbert' | 'vector' | 'embedding' | 'candidates';

/** Truthful per-engine readiness snapshot (never a faked `up`). */
export interface MemoryEngineReadiness {
  readonly name: MemoryEngineName;
  /** `true` only when the engine is genuinely reachable/configured. */
  readonly available: boolean;
  /** Optional truthful reason when not available or degraded. */
  readonly reason?: string;
  /** Optional detail (mode, provider, url host) — never secrets. */
  readonly detail?: Readonly<Record<string, unknown>>;
}
