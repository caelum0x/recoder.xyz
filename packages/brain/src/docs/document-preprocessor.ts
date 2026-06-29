import {
  extractText,
  extractPdfText,
} from "@recoder/document-preprocessor";
import type { DocumentPreprocessorPort } from "../ports/document-preprocessor.port";
import type {
  BrainPreprocessedDocument,
  BrainRawDocument,
} from "../domain/document.types";

/**
 * REAL {@link DocumentPreprocessorPort}, backed by the owned
 * @recoder/document-preprocessor package. This is the brain's RAG/context
 * ingest seam: it turns a raw document's bytes into clean, normalized text the
 * brain can hand to its memory port for embedding + later recall.
 *
 * The package is consumed GENUINELY — `extractText` for plain-text/markdown
 * (the primary ingest path, zero extra IO), and `extractPdfText` for PDFs when
 * a pdfium wasm binary is provided.
 *
 * Fail-safe doctrine (brain's law): a thrown extractor, an unsupported PDF with
 * no wasm binary, or an empty document NEVER throws — it degrades to empty text.
 * Missing/partial preprocessing can only cost richness, never correctness.
 */

/**
 * Supply the pdfium wasm binary on demand (only loaded when a PDF is ingested).
 * Returns null when PDF support is not available, in which case PDF ingest
 * degrades to empty text rather than failing the read.
 */
export type PdfiumWasmLoader = () =>
  | Promise<ArrayBuffer | ArrayBufferView | null>
  | ArrayBuffer
  | ArrayBufferView
  | null;

export interface RecoderDocumentPreprocessorOptions {
  /**
   * Loads the pdfium wasm binary required to extract text from PDFs. Optional:
   * when absent, PDF documents degrade to empty text (text/markdown never need
   * it). Injectable so tests stay hermetic.
   */
  loadPdfiumWasm?: PdfiumWasmLoader;
  /** AbortSignal threaded into the underlying extractors. */
  signal?: AbortSignal;
}

/** Coerce a raw document body into the binary shape the extractor accepts. */
function toBinary(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

const EMPTY = (title: string): BrainPreprocessedDocument => ({
  title,
  text: "",
  pageCount: 0,
});

export class RecoderDocumentPreprocessor implements DocumentPreprocessorPort {
  private readonly loadPdfiumWasm?: PdfiumWasmLoader;
  private readonly signal?: AbortSignal;

  constructor(options: RecoderDocumentPreprocessorOptions = {}) {
    this.loadPdfiumWasm = options.loadPdfiumWasm;
    this.signal = options.signal;
  }

  async preprocess(
    doc: BrainRawDocument,
  ): Promise<BrainPreprocessedDocument> {
    const format = doc.format ?? "text";
    try {
      if (format === "pdf") {
        return await this.preprocessPdf(doc);
      }
      // text + markdown share the package's text extraction path.
      const { text } = extractText(toBinary(doc.data), {
        signal: this.signal,
      });
      return { title: doc.title, text, pageCount: text ? 1 : 0 };
    } catch {
      // Extractor threw / aborted — degrade to empty, never crash the read.
      return EMPTY(doc.title);
    }
  }

  /** PDF path: needs a wasm binary; degrade to empty text when unavailable. */
  private async preprocessPdf(
    doc: BrainRawDocument,
  ): Promise<BrainPreprocessedDocument> {
    if (!this.loadPdfiumWasm) {
      return EMPTY(doc.title);
    }
    const wasm = await this.loadPdfiumWasm();
    if (!wasm) {
      return EMPTY(doc.title);
    }
    const result = await extractPdfText(toBinary(doc.data), {
      pdfiumWasmBinary: wasm,
      signal: this.signal,
    });
    const text = result.pages.map((page) => page.text).join("\n\n").trim();
    return { title: doc.title, text, pageCount: result.totalPages };
  }
}

/** Construct the real document-preprocessor-backed adapter (opt-in). */
export function createDocumentPreprocessor(
  options?: RecoderDocumentPreprocessorOptions,
): DocumentPreprocessorPort {
  return new RecoderDocumentPreprocessor(options);
}
