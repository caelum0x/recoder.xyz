import type {
  BrainPreprocessedDocument,
  BrainRawDocument,
} from "../domain/document.types";

/**
 * Document preprocessing for RAG/context ingest, bound to the owned
 * @recoder/document-preprocessor package. Turns a raw document's bytes (plain
 * text, markdown, or PDF) into clean, normalized text the brain can hand to its
 * memory port for embedding + later recall.
 *
 * This is the seam where the brain ingests external documents into shared
 * memory. The core depends only on this port, never the concrete extractor.
 */
export interface DocumentPreprocessorPort {
  /** Preprocess one raw document into normalized, embeddable text. */
  preprocess(doc: BrainRawDocument): Promise<BrainPreprocessedDocument>;
}
