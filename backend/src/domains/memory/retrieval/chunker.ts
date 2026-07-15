/**
 * chunker — document chunking for retrieval ingest. Reuses the dependency-free,
 * degrade-safe splitter from `@recoder/retrieval` (blank-line paragraphs, long
 * paragraphs hard-split by a character budget; unreadable path / empty content →
 * `[]`). This module only adds domain conveniences: mapping an `IngestDoc` to the
 * package `ChunkInput`, and a stable chunk id derived from `(docId, index)`.
 */
import { chunkDocument, chunkText, type Chunk, type ChunkOptions } from '@recoder/retrieval';
import type { IngestDoc } from '../types.js';

export type { Chunk, ChunkOptions } from '@recoder/retrieval';
export { chunkText };

/** Map an `IngestDoc` to the package `ChunkInput` (text wins over path). */
export function ingestDocToChunkInput(doc: IngestDoc): { text?: string; path?: string } {
  if (typeof doc.text === 'string' && doc.text.length > 0) return { text: doc.text };
  if (doc.path) return { path: doc.path };
  return {};
}

/**
 * Chunk an `IngestDoc` into ordered passages. Never throws: any load failure
 * resolves to `[]` (the caller reports an `empty` ingest truthfully).
 */
export function chunkIngestDoc(doc: IngestDoc, options?: ChunkOptions): Promise<Chunk[]> {
  return chunkDocument(ingestDocToChunkInput(doc), options);
}

/**
 * A stable, human-traceable chunk id `<docId>#<index>`. Qdrant point ids must be
 * uint/UUID (the engine generates those), so this is a payload/dedup key — stable
 * across re-ingests of the same document so an update supersedes, not duplicates.
 */
export function stableChunkId(docId: string, index: number): string {
  return `${docId}#${index}`;
}
