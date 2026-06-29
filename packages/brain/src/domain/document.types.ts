/**
 * A raw document handed to the brain for RAG/context ingest, and the clean,
 * normalized result of preprocessing it (bound to @recoder/document-preprocessor).
 */

/** Which preprocessing pipeline a raw document should run through. */
export type BrainDocumentFormat = "text" | "markdown" | "pdf";

/** A raw document to preprocess: its bytes, a logical title, and its format. */
export interface BrainRawDocument {
  /** Logical name/title used as the memory's provenance (e.g. "README.md"). */
  title: string;
  /** The document's raw bytes. */
  data: Uint8Array | ArrayBuffer;
  /**
   * Format hint. Defaults to "text" (plain/markdown share the same text path).
   * "pdf" routes through the pdfium text extractor.
   */
  format?: BrainDocumentFormat;
}

/** The clean, normalized text a document yields after preprocessing. */
export interface BrainPreprocessedDocument {
  /** The source document's title (carried through for provenance). */
  title: string;
  /** Extracted, normalized text ready for embedding/recall. */
  text: string;
  /** Page count when the source was paginated (PDF); 1 for flat text. */
  pageCount: number;
}
