import type { BrainPassage } from "../domain/passage.types";

/**
 * Passage-level semantic retrieval over the brain's ingested document corpus,
 * bound to the owned @recoder/rag vector store.
 *
 * This is the text-query seam the brain assembles over: given the task text, it
 * returns the most similar embedded passages from documents the brain has
 * ingested (preprocess -> chunk -> embed -> store). It is intentionally a
 * by-text contract (not raw embeddings) so the brain core stays decoupled from
 * the embedder and the concrete store: a host wires @recoder/rag's
 * `QueryService` (which embeds the query then searches the `VectorStore`) behind
 * this port with a thin adapter, mapping each `QueryResult` to a
 * {@link BrainPassage}.
 *
 * Like every brain source, this port is degrade-safe by construction: when no
 * store is wired the assemble simply omits passages (no entry, no failure), and
 * a wired store that is not provisioned (its backend unavailable) should resolve
 * to an empty result rather than throw. Absence only ever costs richness, never
 * correctness.
 */
export interface VectorStorePort {
  /**
   * Vector similarity search over the ingested corpus for the task text.
   *
   * @param query the task / free-text query to embed and search by
   * @param limit maximum number of passages to return
   * @returns the most similar passages (possibly empty), newest relevance-first
   */
  search(query: string, limit: number): Promise<BrainPassage[]>;
}
