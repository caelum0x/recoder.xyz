import type { VectorStorePort } from "../ports/vector-store.port";
import type { BrainPassage } from "../domain/passage.types";

/**
 * REAL {@link VectorStorePort}, backed by the OWNED Phase-2 retrieval engine
 * (`@recoder/retrieval` — chunk → embed → Qdrant → ColBERT rerank → passages).
 *
 * This is the rag → retrieval consolidation seam. Brain's vector-store port was
 * originally wired to `@recoder/rag`'s `QueryService`; this adapter lets a host
 * wire the newer `@recoder/retrieval` engine behind the exact same port with no
 * change to the brain core, so the two overlapping RAG stacks can run side by
 * side while `@recoder/rag` is retired (see docs/architecture/RAG-CONSOLIDATION.md).
 *
 * NO SIDEWAYS ENGINE COUPLING: this module does NOT import `@recoder/retrieval`.
 * It re-declares the minimal structural slice of the engine it consumes
 * ({@link RetrievalSearchPort}) — mirroring the package's `RetrievalEngine.search`
 * / `SearchResult` / `RetrievalPassage` shapes — so `@recoder/retrieval`'s engine
 * is structurally assignable and brain gains no new workspace dependency. The
 * composition root (docker-backend, which already depends on both engines) injects
 * the concrete engine, exactly as the mem0 / context7 adapters take an injected
 * transport rather than importing the SDK.
 *
 * Fail-safe doctrine (brain's law): when the engine is `not_configured` (no
 * embedder / no `QDRANT_URL`) the adapter returns `[]`; if the injected engine
 * throws for any reason, the adapter degrades to `[]` too. It NEVER throws and
 * NEVER fabricates a passage. Absence only costs richness, never correctness.
 */

/** One passage as `@recoder/retrieval`'s engine emits it (untrusted-shape slice). */
export interface RetrievalPassageLike {
  readonly id: string | number;
  readonly text: string;
  readonly score: number;
  readonly source?: string;
  readonly docId?: string;
  readonly chunkIndex?: number;
  readonly payload?: Record<string, unknown>;
}

/** The result `@recoder/retrieval`'s `search` resolves to (structural slice). */
export interface RetrievalSearchResultLike {
  readonly status: "ok" | "not_configured";
  readonly passages: readonly RetrievalPassageLike[];
  readonly reason?: string;
}

/**
 * The minimal structural contract the adapter needs from the retrieval engine:
 * a by-text `search`. `@recoder/retrieval`'s `RetrievalEngine` satisfies this
 * structurally (its `search(query, topK?) => Promise<SearchResult>`), so the real
 * engine can be passed directly without importing the package.
 */
export interface RetrievalSearchPort {
  search(query: string, topK?: number): Promise<RetrievalSearchResultLike>;
}

export interface RetrievalVectorStoreOptions {
  /**
   * The retrieval engine to search against — normally `@recoder/retrieval`'s
   * `createRetrievalEngine(...)`, wired at the composition root.
   */
  readonly engine: RetrievalSearchPort;
}

/** Clamp a raw similarity/rerank score into the [0, 1] the port contracts. */
function clampSimilarity(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  if (score < 0) {
    return 0;
  }
  if (score > 1) {
    return 1;
  }
  return score;
}

/**
 * Map one retrieval passage onto brain's {@link BrainPassage} contract. Optional
 * fields are only ever set when the engine actually provides them (no fabricated
 * provenance), and the score is clamped to the [0, 1] similarity the port promises.
 */
function toBrainPassage(passage: RetrievalPassageLike): BrainPassage {
  return {
    text: typeof passage.text === "string" ? passage.text : "",
    similarity: clampSimilarity(passage.score),
    ...(passage.docId ? { documentKey: passage.docId } : {}),
    ...(passage.source ? { title: passage.source } : {}),
    ...(passage.payload ? { metadata: passage.payload } : {}),
  };
}

export class RetrievalVectorStore implements VectorStorePort {
  private readonly engine: RetrievalSearchPort;

  constructor(options: RetrievalVectorStoreOptions) {
    this.engine = options.engine;
  }

  async search(query: string, limit: number): Promise<BrainPassage[]> {
    // Empty / malformed query is a no-op, never a call — mirrors the engine.
    if (typeof query !== "string" || !query.trim()) {
      return [];
    }
    const topK = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 8;
    try {
      const result = await this.engine.search(query, topK);
      // Engine not provisioned (no embedder / no QDRANT_URL) ⇒ truthful empty.
      if (!result || result.status !== "ok" || !Array.isArray(result.passages)) {
        return [];
      }
      return result.passages.slice(0, topK).map(toBrainPassage);
    } catch {
      // The engine is degrade-safe by construction, but never trust that a
      // future/wrapped engine won't throw — absence must cost richness only.
      return [];
    }
  }
}

/**
 * Construct the retrieval-backed vector store port (opt-in). Wire the real
 * `@recoder/retrieval` engine at the composition root:
 *
 *   import { createRetrievalEngine } from "@recoder/retrieval";
 *   const vectorStore = createRetrievalVectorStore({
 *     engine: createRetrievalEngine({ embedder, store, reranker }),
 *   });
 *   const brain = createBrain({ ..., vectorStore });
 */
export function createRetrievalVectorStore(
  options: RetrievalVectorStoreOptions,
): VectorStorePort {
  return new RetrievalVectorStore(options);
}
