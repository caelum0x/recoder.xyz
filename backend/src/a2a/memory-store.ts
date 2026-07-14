/**
 * Agent Memory Store — Qdrant-backed persistent memory for A2A agents.
 *
 * Provides semantic memory that survives process restarts and is searchable
 * across sessions. Each user gets their own Qdrant collection.
 *
 * Embedding model: text-embedding-ada-002 via OpenRouter (1536 dims).
 */

import crypto from 'node:crypto';
import { logger } from '../logger.js';
import { getOpenRouterByokKey } from './byok.js';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const EMBED_MODEL = 'openai/text-embedding-ada-002';
const VECTOR_SIZE = 1536;

export interface MemoryEntry {
  id: string;
  content: string;
  type: string;       // e.g. 'preference', 'fact', 'task', 'code'
  tags: string[];
  agentId: string;
  userId: string;
  createdAt: string;
  score?: number;     // populated by recall queries
}

// ── Qdrant REST helpers ──────────────────────────────────────────────────────

async function qdrantRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function ensureCollection(collectionName: string): Promise<void> {
  try {
    await qdrantRequest('GET', `/collections/${collectionName}`);
  } catch {
    // Collection doesn't exist — create it with scalar quantization
    await qdrantRequest('PUT', `/collections/${collectionName}`, {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
      quantization_config: {
        scalar: {
          type: 'int8',
          always_ram: true,
        },
      },
    });
    logger.info({ collectionName }, '[memory] Created Qdrant collection');
  }
}

function collectionFor(userId: string): string {
  // Sanitize userId for use as collection name
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `agent-memory-${safe}`;
}

// ── Embedding ────────────────────────────────────────────────────────────────

async function embed(text: string, userId: string): Promise<number[]> {
  const openRouterKey = await getOpenRouterByokKey(userId);
  if (!openRouterKey) {
    throw new Error('No BYOK OpenRouter key available — cannot embed memory');
  }
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Embed API error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function rememberEntry(params: {
  content: string;
  type: string;
  tags: string[];
  agentId: string;
  userId: string;
}): Promise<MemoryEntry> {
  const { content, type, tags, agentId, userId } = params;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const vector = await embed(content, userId);
  const collection = collectionFor(userId);
  await ensureCollection(collection);

  await qdrantRequest('PUT', `/collections/${collection}/points`, {
    points: [
      {
        id,
        vector,
        payload: { content, type, tags, agentId, userId, createdAt },
      },
    ],
  });

  logger.debug({ id, type, agentId }, '[memory] Stored memory entry');
  return { id, content, type, tags, agentId, userId, createdAt };
}

export async function recallEntries(params: {
  query: string;
  userId: string;
  limit?: number;
  type?: string;
}): Promise<MemoryEntry[]> {
  const { query, userId, limit = 10, type } = params;

  const collection = collectionFor(userId);
  try {
    await qdrantRequest('GET', `/collections/${collection}`);
  } catch {
    return []; // Collection doesn't exist yet
  }

  const vector = await embed(query, userId);

  const filter = type
    ? { must: [{ key: 'type', match: { value: type } }] }
    : undefined;

  const result = (await qdrantRequest('POST', `/collections/${collection}/points/search`, {
    vector,
    limit,
    with_payload: true,
    score_threshold: 0.5,
    ...(filter ? { filter } : {}),
  })) as { result: Array<{ id: string; score: number; payload: Record<string, unknown> }> };

  return result.result.map((r) => ({
    id: r.id as string,
    content: r.payload.content as string,
    type: r.payload.type as string,
    tags: (r.payload.tags as string[]) ?? [],
    agentId: r.payload.agentId as string,
    userId: r.payload.userId as string,
    createdAt: r.payload.createdAt as string,
    score: r.score,
  }));
}

export async function forgetEntry(params: {
  id: string;
  userId: string;
}): Promise<boolean> {
  const { id, userId } = params;
  const collection = collectionFor(userId);
  try {
    await qdrantRequest('POST', `/collections/${collection}/points/delete`, {
      points: [id],
    });
    logger.debug({ id }, '[memory] Deleted memory entry');
    return true;
  } catch (err) {
    logger.warn({ err, id }, '[memory] Failed to delete memory entry');
    return false;
  }
}

/**
 * Fetch the most recent memories for a user to inject as agent context.
 * Called by the bridge when sending a task payload to an agent.
 */
export async function getRecentContext(params: {
  query: string;
  userId: string;
  limit?: number;
}): Promise<MemoryEntry[]> {
  try {
    return await recallEntries({ ...params, limit: params.limit ?? 10 });
  } catch (err) {
    logger.warn({ err }, '[memory] getRecentContext failed — skipping context injection');
    return [];
  }
}
