/**
 * @module search-proxy
 *
 * Meilisearch proxy for cross-platform content search.
 *
 * Indexes:
 *   - `threads`      recoder-agents threads (id, title, messages summary, projectId, userId)
 *   - `pm_features`  recoder-pm features/feedback (id, title, description, status)
 *   - `agency_items` recoder-agency clients and projects (id, name, brief, status)
 *   - `files`        active sandbox files (projectId, path, content snippet)
 *
 * Query results are cached in the A2A scratchpad (session-scoped TTL 1h).
 * Hybrid search: keyword (BM25) + semantic vector (if Meilisearch AI is enabled).
 */

import crypto from 'node:crypto';
import { logger } from '../logger.js';
import { scratchpadGet, scratchpadSet } from './scratchpad.js';

const MEILI_URL = process.env.MEILISEARCH_URL ?? 'http://localhost:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY ?? '';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type SearchSource = 'threads' | 'files' | 'pm_features' | 'agency_items';

export interface SearchResult {
  id: string;
  source: SearchSource;
  title: string;
  snippet: string;
  url?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

// ── Meilisearch REST helpers ──────────────────────────────────────────────────

async function meiliReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (MEILI_KEY) headers.Authorization = `Bearer ${MEILI_KEY}`;

  const res = await fetch(`${MEILI_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Meili ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function ensureIndex(uid: string, primaryKey = 'id'): Promise<void> {
  try {
    await meiliReq('GET', `/indexes/${uid}`);
  } catch {
    await meiliReq('POST', '/indexes', { uid, primaryKey });
    logger.info({ uid }, '[search-proxy] Created Meilisearch index');
  }
}

// ── Index operations ──────────────────────────────────────────────────────────

export async function indexThread(thread: {
  id: string;
  title?: string;
  messages?: Array<{ role: string; content: string }>;
  projectId?: string;
  userId?: string;
  createdAt?: string;
}): Promise<void> {
  await ensureIndex('threads');
  const messageSummary = (thread.messages ?? [])
    .slice(0, 10)
    .map((m) => `[${m.role}] ${String(m.content ?? '').slice(0, 200)}`)
    .join('\n');

  await meiliReq('PUT', '/indexes/threads/documents', [
    {
      id: thread.id,
      title: thread.title ?? `Thread ${thread.id.slice(0, 8)}`,
      messageSummary,
      projectId: thread.projectId ?? '',
      userId: thread.userId ?? '',
      createdAt: thread.createdAt ?? new Date().toISOString(),
    },
  ]);
}

export async function indexPmFeature(feature: {
  id: string;
  title: string;
  description?: string;
  status?: string;
  userId?: string;
}): Promise<void> {
  await ensureIndex('pm_features');
  await meiliReq('PUT', '/indexes/pm_features/documents', [
    {
      id: feature.id,
      title: feature.title,
      description: feature.description ?? '',
      status: feature.status ?? 'open',
      userId: feature.userId ?? '',
    },
  ]);
}

export async function indexAgencyItem(item: {
  id: string;
  name: string;
  brief?: string;
  status?: string;
  type?: 'client' | 'project';
}): Promise<void> {
  await ensureIndex('agency_items');
  await meiliReq('PUT', '/indexes/agency_items/documents', [
    {
      id: item.id,
      name: item.name,
      brief: item.brief ?? '',
      status: item.status ?? 'active',
      type: item.type ?? 'project',
    },
  ]);
}

export async function indexFile(params: {
  projectId: string;
  path: string;
  content: string;
}): Promise<void> {
  await ensureIndex('files');
  const snippet = params.content.slice(0, 2000);
  await meiliReq('PUT', '/indexes/files/documents', [
    {
      id: `${params.projectId}:${params.path}`,
      projectId: params.projectId,
      path: params.path,
      snippet,
    },
  ]);
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchIndex(
  indexUid: string,
  source: SearchSource,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  type MeiliHit = Record<string, unknown> & { id: string; _rankingScore?: number };
  type MeiliSearchResponse = { hits: MeiliHit[] };

  let resp: MeiliSearchResponse;
  try {
    resp = await meiliReq<MeiliSearchResponse>('POST', `/indexes/${indexUid}/search`, {
      q: query,
      limit,
      showRankingScore: true,
      attributesToHighlight: ['*'],
      highlightPreTag: '',
      highlightPostTag: '',
    });
  } catch {
    return []; // Index may not exist yet
  }

  return resp.hits.map((hit) => {
    let title = '';
    let snippet = '';

    if (source === 'threads') {
      title = String(hit.title ?? '');
      snippet = String(hit.messageSummary ?? '').slice(0, 300);
    } else if (source === 'pm_features') {
      title = String(hit.title ?? '');
      snippet = String(hit.description ?? '').slice(0, 300);
    } else if (source === 'agency_items') {
      title = String(hit.name ?? '');
      snippet = String(hit.brief ?? '').slice(0, 300);
    } else if (source === 'files') {
      title = String(hit.path ?? '');
      snippet = String(hit.snippet ?? '').slice(0, 300);
    }

    return {
      id: hit.id,
      source,
      title,
      snippet,
      score: hit._rankingScore,
      metadata: { ...hit },
    };
  });
}

const SOURCE_INDEX_MAP: Record<SearchSource, string> = {
  threads: 'threads',
  files: 'files',
  pm_features: 'pm_features',
  agency_items: 'agency_items',
};

/**
 * Search across multiple sources. Results are cached by (sessionId, queryHash).
 */
export async function searchAll(params: {
  query: string;
  sources?: SearchSource[];
  limit?: number;
  sessionId?: string;
}): Promise<SearchResult[]> {
  const { query, sources = ['threads', 'files', 'pm_features', 'agency_items'], limit = 10, sessionId } = params;

  // Cache lookup
  const cacheKey = `meili:${crypto.createHash('sha256').update(`${sources.join(',')}:${query}`).digest('hex').slice(0, 16)}`;
  if (sessionId) {
    const cached = scratchpadGet({ sessionId, key: cacheKey });
    if (cached) {
      const ts = (cached.value as { ts: number; results: SearchResult[] }).ts;
      if (Date.now() - ts < CACHE_TTL_MS) {
        return (cached.value as { ts: number; results: SearchResult[] }).results;
      }
    }
  }

  const perSource = Math.max(Math.ceil(limit / sources.length), 3);
  const allResults = (
    await Promise.all(
      sources.map((s) => searchIndex(SOURCE_INDEX_MAP[s], s, query, perSource)),
    )
  ).flat();

  // Sort by score desc, deduplicate by id
  const seen = new Set<string>();
  const deduped = allResults
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  // Cache result
  if (sessionId) {
    scratchpadSet({ sessionId, agentId: 'search-proxy', key: cacheKey, value: { ts: Date.now(), results: deduped } });
  }

  return deduped;
}
