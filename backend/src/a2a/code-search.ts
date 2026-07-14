/**
 * @module code-search
 *
 * Semantic code search backed by Qdrant.
 *
 * Indexes project files into per-project Qdrant collections and provides
 * semantic search so agents can find code by intent rather than exact match.
 *
 * Collection name: `code-<projectId>` (max 63 chars, sanitized)
 * Chunk size: 60 lines (~1500 tokens) with 10-line overlap
 * Embedding: text-embedding-ada-002 via OpenRouter (1536 dims)
 * Re-index: debounced per project, 5s delay
 */

import crypto from 'node:crypto';
import { logger } from '../logger.js';
import { getOpenRouterByokKey } from './byok.js';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const EMBED_MODEL = 'openai/text-embedding-ada-002';
const VECTOR_SIZE = 1536;
const CHUNK_LINES = 60;
const CHUNK_OVERLAP = 10;
const DEBOUNCE_MS = 5_000;

export interface CodeChunk {
  id: string;
  projectId: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  score?: number;
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function qdrantReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function codeCollection(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  return `code-${safe}`;
}

async function ensureCodeCollection(name: string): Promise<void> {
  try {
    await qdrantReq('GET', `/collections/${name}`);
  } catch {
    await qdrantReq('PUT', `/collections/${name}`, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      quantization_config: { scalar: { type: 'int8', always_ram: true } },
    });
    logger.info({ name }, '[code-search] Created code collection');
  }
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embed(text: string, userId?: string): Promise<number[]> {
  const openRouterKey = await getOpenRouterByokKey(userId);
  if (!openRouterKey) throw new Error('No BYOK OpenRouter key available for code search embeddings');
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Embed error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function chunkFile(filePath: string, content: string): Array<{ lineStart: number; lineEnd: number; text: string }> {
  const lines = content.split('\n');
  const chunks: Array<{ lineStart: number; lineEnd: number; text: string }> = [];
  let i = 0;
  while (i < lines.length) {
    const lineStart = i + 1; // 1-indexed
    const lineEnd = Math.min(i + CHUNK_LINES, lines.length);
    const text = `// ${filePath} lines ${lineStart}-${lineEnd}\n${lines.slice(i, lineEnd).join('\n')}`;
    chunks.push({ lineStart, lineEnd, text });
    i += CHUNK_LINES - CHUNK_OVERLAP;
    if (i >= lines.length) break;
  }
  return chunks;
}

// ── Debounce registry ─────────────────────────────────────────────────────────

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Index a single file into the project's code collection.
 * If `debounce` is true (default), the upsert is deferred 5s to batch writes.
 */
export async function indexFile(params: {
  projectId: string;
  filePath: string;
  content: string;
  debounce?: boolean;
  userId?: string;
}): Promise<void> {
  const { projectId, filePath, content, debounce = true, userId } = params;

  const key = `${projectId}:${filePath}`;
  if (debounce) {
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(key, setTimeout(() => {
      debounceTimers.delete(key);
      indexFile({ projectId, filePath, content, debounce: false, userId }).catch((err) => {
        logger.warn({ err, projectId, filePath }, '[code-search] Debounced index failed');
      });
    }, DEBOUNCE_MS));
    return;
  }

  // Skip binary / very large files
  if (content.length > 500_000 || /[\x00-\x08\x0e-\x1f]/.test(content.slice(0, 512))) return;

  const collection = codeCollection(projectId);
  await ensureCodeCollection(collection);

  const chunks = chunkFile(filePath, content);

  // Delete existing chunks for this file before re-indexing
  try {
    await qdrantReq('POST', `/collections/${collection}/points/delete`, {
      filter: { must: [{ key: 'filePath', match: { value: filePath } }] },
    });
  } catch {
    // OK if none existed
  }

  if (!chunks.length) return;

  // Embed and upsert in batches of 5 to avoid rate limits
  const BATCH = 5;
  for (let b = 0; b < chunks.length; b += BATCH) {
    const batch = chunks.slice(b, b + BATCH);
    const points = await Promise.all(batch.map(async (c) => ({
      id: crypto.randomUUID(),
      vector: await embed(c.text, userId),
      payload: {
        projectId,
        filePath,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        content: c.text,
      },
    })));
    await qdrantReq('PUT', `/collections/${collection}/points`, { points });
  }

  logger.debug({ projectId, filePath, chunks: chunks.length }, '[code-search] Indexed file');
}

/**
 * Semantic search across a project's code index.
 */
export async function searchCode(params: {
  projectId: string;
  query: string;
  limit?: number;
  userId?: string;
}): Promise<CodeChunk[]> {
  const { projectId, query, limit = 10, userId } = params;
  const collection = codeCollection(projectId);

  try {
    await qdrantReq('GET', `/collections/${collection}`);
  } catch {
    return []; // Not indexed yet
  }

  const vector = await embed(query, userId);

  const result = (await qdrantReq('POST', `/collections/${collection}/points/search`, {
    vector,
    limit,
    with_payload: true,
    score_threshold: 0.4,
  })) as { result: Array<{ id: string; score: number; payload: Record<string, unknown> }> };

  return result.result.map((r) => ({
    id: r.id as string,
    projectId: r.payload.projectId as string,
    filePath: r.payload.filePath as string,
    lineStart: r.payload.lineStart as number,
    lineEnd: r.payload.lineEnd as number,
    content: r.payload.content as string,
    score: r.score,
  }));
}

/**
 * Remove all indexed chunks for a project (e.g. when sandbox is destroyed).
 */
export async function dropProjectIndex(projectId: string): Promise<void> {
  const collection = codeCollection(projectId);
  try {
    await qdrantReq('DELETE', `/collections/${collection}`);
    logger.info({ projectId }, '[code-search] Dropped project index');
  } catch {
    // Already gone
  }
}
