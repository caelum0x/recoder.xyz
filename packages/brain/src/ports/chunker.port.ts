/**
 * RAG chunking for document ingest, bound to the owned @recoder/rag chunker.
 *
 * Turns one document's preprocessed text into the overlapping, size-bounded
 * pieces RAG actually embeds and recalls over. The brain's ingest path
 * (preprocess -> chunk -> remember) hands each chunk to its memory port so a
 * later recall surfaces the precise passage instead of one giant blob.
 *
 * The signature is INTENTIONALLY identical to @recoder/rag's `ChunkerFunction`
 * (`(text: string) => string[]`), so a host can wire the real engine with zero
 * adaptation:
 *
 * ```ts
 * import { createDefaultChunker } from "@recoder/rag";
 * createBrain({ chunker: { chunk: createDefaultChunker() } });
 * ```
 *
 * The core depends only on this port, never the concrete chunker. Absence is
 * degrade-safe: with no chunker wired, ingest stores the whole document as a
 * single memory exactly as before (no behavior change, no signature change).
 */
export interface ChunkerPort {
  /**
   * Split normalized text into chunks for embedding/recall. A pure, synchronous
   * transform: same contract as @recoder/rag's `ChunkerFunction`.
   */
  chunk(text: string): string[];
}
