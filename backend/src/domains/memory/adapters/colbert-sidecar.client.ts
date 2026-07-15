/**
 * colbert-sidecar.client — a thin, degrade-safe HTTP client to the optional
 * `backend/engines/py/colbert` rerank server (`POST /rerank`).
 *
 * The py server scores query↔passage late-interaction relevance and returns
 * `{ results: [{ index, score }] }`. This client posts the passages and parses
 * the returned permutation. Fetch is injectable so tests touch no network.
 *
 * DEGRADE CONTRACT: no URL, server down / non-2xx, or a malformed/incomplete
 * permutation → the original order is returned with `available:false` and a
 * truthful reason. Never throws, never fabricates a ranking.
 */
import type { RerankResult } from '../ports/reranker.port.js';

export interface ColbertHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type ColbertFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<ColbertHttpResponse>;

export interface ColbertSidecarClient {
  readonly url: string;
  rerank(query: string, passages: readonly string[]): Promise<RerankResult>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    const ctor = (AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }).timeout;
    return typeof ctor === 'function' ? ctor(ms) : undefined;
  } catch {
    return undefined;
  }
}

/** Identity (original-order) result used on every degrade path. */
function identity(passages: readonly string[], reason?: string): RerankResult {
  const order = passages.map((_, i) => i);
  return reason ? { available: false, passages: [...passages], order, reason } : { available: false, passages: [...passages], order };
}

/**
 * Validate the `{ results: [{index, score}] }` body into a full permutation of
 * `[0, length)`. Returns null on any shape mismatch so the caller degrades to
 * original order rather than trusting a partial reorder.
 */
function parseOrder(body: unknown, length: number): number[] | null {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length !== length) return null;
  const seen = new Set<number>();
  const order: number[] = [];
  for (const r of results) {
    const idx = (r as { index?: unknown })?.index;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= length || seen.has(idx)) {
      return null;
    }
    seen.add(idx);
    order.push(idx);
  }
  return order;
}

/**
 * Build a colbert sidecar client. `url` is normalized (trailing slash stripped);
 * an empty url yields a client whose `rerank` always returns identity order.
 */
export function createColbertSidecarClient(
  url: string,
  doFetch: ColbertFetch = fetch as unknown as ColbertFetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): ColbertSidecarClient {
  const base = url.trim().replace(/\/+$/, '');

  return {
    url: base,
    async rerank(query, passages): Promise<RerankResult> {
      if (!base || typeof doFetch !== 'function') return identity(passages, 'COLBERT_RERANK_URL not set');
      if (passages.length === 0) return { available: true, passages: [], order: [] };
      try {
        const res = await doFetch(`${base}/rerank`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query, passages }),
          signal: timeoutSignal(timeoutMs),
        });
        if (!res.ok) return identity(passages, `colbert rerank HTTP ${res.status}`);
        const order = parseOrder(await res.json(), passages.length);
        if (!order) return identity(passages, 'colbert rerank returned a malformed body');
        return { available: true, passages: order.map((i) => passages[i]), order };
      } catch (err) {
        return identity(passages, err instanceof Error ? err.message : 'colbert rerank failed');
      }
    },
  };
}
