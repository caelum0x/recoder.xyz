/**
 * colbert-search.client — the degrade-safe HTTP client behind `ColbertSearchPort`.
 * It talks to the SAME owned ColBERT daemon the rerank path uses
 * (`MemoryConfig.colbertRerankUrl`, NO `process.env` here), exercising the
 * index surface `rerank_server.py` exposes:
 *
 *   - `POST /collections/<name>/search {query, k}` — REAL PLAID late-interaction
 *     search over the built per-collection index → `{query, topk:[{text,pid,rank,
 *     score}]}`. This is the FIRST-STAGE retriever: it generates candidates from
 *     the index, not from a caller-supplied list.
 *   - `POST /collections {name, passages, overwrite}` — build/refresh the index
 *     (the conductor per-repo index-build path).
 *
 * DEGRADE CONTRACT: no URL → `configured:false`, every op returns a truthful
 * `available:false` / `built:false` with a reason. On a non-2xx (404 unbuilt
 * index, 503 torch/colbert absent, timeout, malformed body) the same truthful
 * skip is returned — NEVER a fabricated hit and NEVER a throw, so retrieval stays
 * on its other candidate generators (Qdrant) and a run is never blocked. Fetch is
 * injectable so tests touch no network.
 */
import type { MemoryConfig } from '../config.js';
import type {
  ColbertIndexBuildResult,
  ColbertSearchHit,
  ColbertSearchPort,
  ColbertSearchResult,
} from '../ports/colbert-search.port.js';
import type { ColbertFetch, ColbertHttpResponse } from './colbert-sidecar.client.js';

/** Search is bounded but late-interaction is CPU/GPU heavy — a generous budget. */
const SEARCH_TIMEOUT_MS = 15_000;
/** Building an index (encode + cluster + save) is heavy — a long, bounded budget. */
const BUILD_TIMEOUT_MS = 600_000;

function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    const ctor = (AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }).timeout;
    return typeof ctor === 'function' ? ctor(ms) : undefined;
  } catch {
    return undefined;
  }
}

/** Coerce the wire `topk` array into typed, best-first hits (drops junk rows). */
function parseHits(body: unknown): ColbertSearchHit[] {
  const topk = (body as { topk?: unknown })?.topk;
  if (!Array.isArray(topk)) return [];
  const hits: ColbertSearchHit[] = [];
  for (const row of topk) {
    const text = (row as { text?: unknown })?.text;
    const score = (row as { score?: unknown })?.score;
    if (typeof text !== 'string' || typeof score !== 'number' || !Number.isFinite(score)) {
      continue;
    }
    const pid = (row as { pid?: unknown })?.pid;
    const rank = (row as { rank?: unknown })?.rank;
    hits.push({
      text,
      score,
      ...(typeof pid === 'number' && Number.isInteger(pid) ? { pid } : {}),
      ...(typeof rank === 'number' && Number.isInteger(rank) ? { rank } : {}),
    });
  }
  return hits;
}

/**
 * Build the colbert search client. `colbertRerankUrl` doubles as the index-daemon
 * base (the one Flask process serves both `/rerank` and `/collections/*`). An
 * unset URL yields a client whose ops all report a truthful unconfigured skip.
 */
export function createColbertSearchClient(
  config: MemoryConfig,
  doFetch: ColbertFetch = fetch as unknown as ColbertFetch,
): ColbertSearchPort {
  const base = (config.colbertRerankUrl ?? '').trim().replace(/\/+$/, '');
  const hasFetch = typeof doFetch === 'function';

  async function post(path: string, payload: unknown, timeoutMs: number): Promise<
    { ok: true; body: unknown } | { ok: false; reason: string }
  > {
    let res: ColbertHttpResponse;
    try {
      res = await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: timeoutSignal(timeoutMs),
      });
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'colbert daemon unreachable' };
    }
    if (!res.ok) return { ok: false, reason: `colbert daemon HTTP ${res.status}` };
    try {
      return { ok: true, body: await res.json() };
    } catch {
      return { ok: false, reason: 'colbert daemon returned a malformed body' };
    }
  }

  return {
    configured(): boolean {
      return Boolean(base) && hasFetch;
    },

    async search(collection, query, k): Promise<ColbertSearchResult> {
      if (!base || !hasFetch) {
        return { available: false, hits: [], reason: 'COLBERT_RERANK_URL not set' };
      }
      const name = collection.trim();
      const q = typeof query === 'string' ? query.trim() : '';
      if (!name || !q) {
        return { available: false, hits: [], reason: 'empty collection or query' };
      }
      const topK = Number.isFinite(k) && k > 0 ? Math.floor(k) : 10;
      const result = await post(
        `/collections/${encodeURIComponent(name)}/search`,
        { query: q, k: topK },
        SEARCH_TIMEOUT_MS,
      );
      if (!result.ok) return { available: false, hits: [], reason: result.reason };
      return { available: true, hits: parseHits(result.body) };
    },

    async ensureIndex(collection, passages, opts): Promise<ColbertIndexBuildResult> {
      const name = collection.trim();
      const texts = (Array.isArray(passages) ? passages : []).filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0,
      );
      if (!base || !hasFetch) {
        return { built: false, collection: name, documents: texts.length, reason: 'COLBERT_RERANK_URL not set' };
      }
      if (!name) {
        return { built: false, collection: name, documents: 0, reason: 'empty collection name' };
      }
      if (texts.length === 0) {
        return { built: false, collection: name, documents: 0, reason: 'no passages to index' };
      }
      const result = await post(
        '/collections',
        { name, passages: texts, overwrite: opts?.overwrite === true },
        BUILD_TIMEOUT_MS,
      );
      if (!result.ok) {
        return { built: false, collection: name, documents: texts.length, reason: result.reason };
      }
      return { built: true, collection: name, documents: texts.length };
    },
  };
}
