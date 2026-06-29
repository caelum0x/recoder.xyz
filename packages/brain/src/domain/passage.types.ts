/**
 * A passage-level retrieval hit from the owned RAG vector store (@recoder/rag).
 *
 * Where {@link BrainMemory} carries mem0's semantic recall and {@link BrainDoc}
 * carries context7's external library docs, a {@link BrainPassage} is one chunk
 * of an ingested document surfaced by vector similarity search over its
 * embeddings — the precise passage, with its source document and a truthful
 * similarity score. It is the on-path read for the document corpus the brain
 * ingests via {@link Brain.ingestDocument}.
 *
 * The shape is intentionally a structural superset of what @recoder/rag's
 * `QueryResult` yields (chunk text + similarity + opaque metadata), so the real
 * `QueryService` wires into the {@link VectorStorePort} with a thin adapter and
 * zero coupling of the brain core to the concrete RAG engine.
 */
export interface BrainPassage {
  /** The passage text (one embedded chunk of an ingested document). */
  text: string;
  /** Cosine similarity to the query in [0, 1] — truthful, never fabricated. */
  similarity: number;
  /**
   * The logical document this passage came from, when the store records it
   * (RAG's `documentKey`). Lets a caller group passages by source document.
   */
  documentKey?: string;
  /** Human-readable title of the source document, when known. */
  title?: string;
  /** Opaque, round-tripped metadata from the vector store (never interpreted). */
  metadata?: Record<string, unknown>;
}
