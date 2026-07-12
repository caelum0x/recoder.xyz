/**
 * semantic-index — turns a RecoderGit repo scan into a real semantic code index.
 *
 * Given the source files discovered by {@link scanRepo}, this chunks each file
 * into line windows, embeds the chunks through an injected {@link EmbeddingPort},
 * and upserts them into a per-repo collection through an injected
 * {@link VectorStorePort}. `semanticSearch(query, topK)` then embeds the query and
 * returns the nearest `file:line` hits.
 *
 * DEGRADE CONTRACT (the hard rule):
 *   - No embedder configured (`embed → null`) ⇒ indexing is a truthful no-op and
 *     `semanticSearch → []`. The caller falls back to keyword search.
 *   - No vector store configured (`search → []`) ⇒ `semanticSearch → []`.
 *   - EVERY method catches its own errors and returns the safe fallback. Nothing
 *     here throws, and nothing fabricates a hit.
 *
 * INJECTABLE BY CONSTRUCTION: the embedder + store are passed in, so unit tests
 * drive this with in-memory fakes and touch no network. The production wiring
 * passes the shared `createEmbeddingPort` / `createVectorStore` ports.
 *
 * The port interfaces below are declared locally (structurally compatible with
 * the shared vector foundation) so this package stays free of any runtime
 * dependency on the backend or a specific vector adapter.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scanRepo, type ScanOptions } from './repo-scan';

// ── Injected ports (structurally match the shared vector foundation) ─────────

/** Embeds text into vectors. Returns `null` when unconfigured or on any error. */
export interface EmbeddingPort {
  /** Optional provider label, surfaced for truthful health. */
  readonly provider?: string;
  embed(texts: string[]): Promise<number[][] | null>;
}

export interface VectorPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

export interface VectorMatch {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
}

/** Nearest-neighbour store. Every method is a truthful no-op when unconfigured. */
export interface VectorStorePort {
  /** True when the store is wired; false ⇒ every method no-ops truthfully. */
  readonly configured?: boolean;
  ensureCollection(name: string, dim: number): Promise<boolean>;
  upsert(name: string, points: VectorPoint[]): Promise<boolean>;
  search(name: string, vector: number[], topK: number): Promise<VectorMatch[]>;
}

// ── Public shapes ────────────────────────────────────────────────────────────

/** A single indexed chunk: a line window of one source file. */
export interface CodeChunk {
  /** Repo-relative POSIX path of the source file. */
  path: string;
  /** 1-based first line of the window. */
  startLine: number;
  /** 1-based last line of the window. */
  endLine: number;
  /** The chunk text (the joined window lines). */
  text: string;
}

/** A semantic search hit pointing at a `path` + line window. */
export interface SemanticHit {
  path: string;
  startLine: number;
  endLine: number;
  /** Similarity score from the vector store (higher is nearer). */
  score: number;
  /** A short preview of the matched chunk. */
  preview: string;
}

/** Truthful outcome of an index build — never implies success it didn't achieve. */
export interface IndexResult {
  /** True only when both an embedder and a store were available for this build. */
  configured: boolean;
  /** Source files considered. */
  files: number;
  /** Chunks produced from those files. */
  chunks: number;
  /** True when points were actually upserted into the store. */
  upserted: boolean;
  /** Embedding dimensionality used (0 when nothing was embedded). */
  dim: number;
}

export interface SemanticIndexOptions {
  embedder: EmbeddingPort;
  store: VectorStorePort;
  /** Per-repo collection name (caller derives it, e.g. from the repo root). */
  collection: string;
  /** Lines per chunk window. Default 40. */
  chunkLines?: number;
  /** Max chunks embedded per request to the embedder. Default 64. */
  batchSize?: number;
  /** Preview length cap (chars). Default 240. */
  previewChars?: number;
}

export interface SemanticIndex {
  /** The collection this index reads/writes. */
  readonly collection: string;
  /** Chunk + embed + upsert an explicit set of `{ path, content }` files. */
  indexFiles(files: ReadonlyArray<{ path: string; content: string }>): Promise<IndexResult>;
  /** Scan a repo on disk, then index the source files it finds. */
  indexRepo(repoRoot: string, options?: ScanOptions): Promise<IndexResult>;
  /** Embed the query and return the nearest `path:line` hits (`[]` on degrade). */
  semanticSearch(query: string, topK?: number): Promise<SemanticHit[]>;
}

const DEFAULT_CHUNK_LINES = 40;
const DEFAULT_BATCH_SIZE = 64;
const DEFAULT_PREVIEW_CHARS = 240;
const DEFAULT_TOP_K = 10;

/** FNV-1a 32-bit hash → non-negative integer id (stable per `path:startLine`). */
function chunkId(pathRel: string, startLine: number): number {
  const key = `${pathRel}:${startLine}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    // 32-bit FNV prime multiply, staying in unsigned range.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Split a file's content into non-empty line-window chunks. Windows are fixed
 * size with no overlap; a window that is entirely whitespace is dropped so we
 * never embed blank regions. Exported for direct unit testing.
 */
export function chunkFile(
  pathRel: string,
  content: string,
  chunkLines = DEFAULT_CHUNK_LINES,
  previewChars = DEFAULT_PREVIEW_CHARS,
): CodeChunk[] {
  const window = chunkLines > 0 ? chunkLines : DEFAULT_CHUNK_LINES;
  if (typeof content !== 'string' || content.length === 0) return [];
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];
  for (let i = 0; i < lines.length; i += window) {
    const slice = lines.slice(i, i + window);
    const text = slice.join('\n');
    if (text.trim().length === 0) continue;
    chunks.push({
      path: pathRel,
      startLine: i + 1,
      endLine: Math.min(i + slice.length, lines.length),
      text: text.length > previewChars * 8 ? text.slice(0, previewChars * 8) : text,
    });
  }
  return chunks;
}

function preview(text: string, cap: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > cap ? `${oneLine.slice(0, cap)}…` : oneLine;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Create a semantic code index over a per-repo collection. Both ports are
 * injected, so this is fully unit-testable with fakes and degrade-safe by
 * construction.
 */
export function createSemanticIndex(options: SemanticIndexOptions): SemanticIndex {
  const { embedder, store, collection } = options;
  const chunkLines = options.chunkLines ?? DEFAULT_CHUNK_LINES;
  const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : DEFAULT_BATCH_SIZE;
  const previewChars = options.previewChars ?? DEFAULT_PREVIEW_CHARS;

  /** Embed all chunk texts in batches. Returns null if the embedder degrades. */
  async function embedChunks(chunks: CodeChunk[]): Promise<number[][] | null> {
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize).map((c) => c.text);
      let out: number[][] | null;
      try {
        out = await embedder.embed(batch);
      } catch {
        return null;
      }
      // `null` ⇒ no provider / failure: degrade the whole build truthfully.
      if (out === null) return null;
      if (out.length !== batch.length) return null;
      vectors.push(...out);
    }
    return vectors;
  }

  async function indexFiles(
    files: ReadonlyArray<{ path: string; content: string }>,
  ): Promise<IndexResult> {
    const chunks: CodeChunk[] = [];
    for (const file of files) {
      const p = str(file?.path);
      if (!p) continue;
      chunks.push(...chunkFile(p, file.content ?? '', chunkLines, previewChars));
    }
    if (chunks.length === 0) {
      return { configured: false, files: files.length, chunks: 0, upserted: false, dim: 0 };
    }

    const vectors = await embedChunks(chunks);
    if (vectors === null || vectors.length === 0) {
      // Embedder unavailable — truthful no-op, caller degrades to keyword.
      return { configured: false, files: files.length, chunks: chunks.length, upserted: false, dim: 0 };
    }

    const dim = vectors[0]?.length ?? 0;
    if (dim === 0) {
      return { configured: false, files: files.length, chunks: chunks.length, upserted: false, dim: 0 };
    }

    let upserted = false;
    try {
      await store.ensureCollection(collection, dim);
      const points: VectorPoint[] = chunks.map((c, idx) => ({
        id: chunkId(c.path, c.startLine),
        vector: vectors[idx] ?? [],
        payload: {
          path: c.path,
          startLine: c.startLine,
          endLine: c.endLine,
          preview: preview(c.text, previewChars),
        },
      }));
      upserted = await store.upsert(collection, points);
    } catch {
      upserted = false;
    }

    return { configured: true, files: files.length, chunks: chunks.length, upserted, dim };
  }

  async function indexRepo(repoRoot: string, scanOptions?: ScanOptions): Promise<IndexResult> {
    let relativeFiles: string[] = [];
    try {
      const scan = await scanRepo(repoRoot, scanOptions);
      relativeFiles = scan.files;
    } catch {
      return { configured: false, files: 0, chunks: 0, upserted: false, dim: 0 };
    }
    const files: Array<{ path: string; content: string }> = [];
    for (const rel of relativeFiles) {
      try {
        const content = await fs.readFile(path.join(repoRoot, rel), 'utf8');
        files.push({ path: rel, content });
      } catch {
        // Unreadable file — skip rather than fail the whole build.
      }
    }
    return indexFiles(files);
  }

  async function semanticSearch(query: string, topK = DEFAULT_TOP_K): Promise<SemanticHit[]> {
    const q = str(query)?.trim();
    if (!q) return [];
    const limit = topK > 0 ? topK : DEFAULT_TOP_K;

    let vectors: number[][] | null;
    try {
      vectors = await embedder.embed([q]);
    } catch {
      return [];
    }
    if (!vectors || vectors.length === 0 || !Array.isArray(vectors[0]) || vectors[0].length === 0) {
      return [];
    }

    let matches: VectorMatch[];
    try {
      matches = await store.search(collection, vectors[0], limit);
    } catch {
      return [];
    }
    if (!Array.isArray(matches)) return [];

    const hits: SemanticHit[] = [];
    for (const m of matches) {
      const payload = m?.payload ?? {};
      const p = str((payload as { path?: unknown }).path);
      if (!p) continue;
      const startLine = num((payload as { startLine?: unknown }).startLine, 1);
      hits.push({
        path: p,
        startLine,
        endLine: num((payload as { endLine?: unknown }).endLine, startLine),
        score: num(m.score, 0),
        preview: str((payload as { preview?: unknown }).preview) ?? '',
      });
    }
    return hits;
  }

  return { collection, indexFiles, indexRepo, semanticSearch };
}
