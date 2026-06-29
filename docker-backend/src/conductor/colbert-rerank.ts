/**
 * ColBERT late-interaction rerank client — the connect seam to the optional
 * `py/colbert` rerank service (`POST /rerank`).
 *
 * The detector/scorer lives in Python (`py/colbert/rerank_server.py`); this is
 * the Node-side `RerankerPort` the conductor/bundle path calls to reorder a set
 * of candidate passages by ColBERT late-interaction score before they are fed
 * into a prompt. It connects ONLY when `COLBERT_RERANK_URL` is set.
 *
 * DEGRADE-SAFE end to end (mirrors the py server's own soft-fail contract):
 *  - `COLBERT_RERANK_URL` unset                 → `{ available:false }`, original order.
 *  - server down / non-2xx (e.g. 503 unavail.)  → original order, `reason` set.
 *  - malformed response                         → original order, `reason` set.
 * It NEVER throws into a caller and NEVER fabricates a ranking — on any failure
 * the input passages are returned in their original order.
 */
import { createLogger } from '../logger.js';

const logger = createLogger('conductor:colbert-rerank');

/** Default request timeout (ms). ColBERT scoring is CPU/GPU-bound but bounded. */
const RERANK_TIMEOUT_MS = 15_000;

/**
 * The configured rerank base URL, or undefined when the seam is off. Trimmed;
 * trailing slash stripped so we can append `/rerank` cleanly.
 */
export function colbertRerankUrl(): string | undefined {
  const raw = process.env.COLBERT_RERANK_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '');
}

export interface RerankResult {
  /** True when the rerank service was actually reached and returned an order. */
  readonly available: boolean;
  /** Passages in rerank order (best first). Original order on any failure. */
  readonly passages: string[];
  /**
   * The original indices in rerank order — `order[0]` is the input index of the
   * best passage. Identity order ([0,1,2,…]) when unavailable.
   */
  readonly order: number[];
  /** Why the rerank was skipped/failed (only set when `available` is false). */
  readonly reason?: string;
}

/** Identity (original-order) result used on every degrade path. */
function identity(passages: string[], reason?: string): RerankResult {
  const result: RerankResult = {
    available: false,
    passages,
    order: passages.map((_, i) => i),
  };
  return reason ? { ...result, reason } : result;
}

/**
 * Truthful availability of the colbert rerank seam: is `COLBERT_RERANK_URL` set?
 * (A live `GET /health` probe is intentionally NOT done here — availability is
 * "configured to connect"; a real call degrades per-request if the server is
 * down, so we never block on a probe.)
 */
export function colbertRerankAvailability(): { available: boolean; url?: string } {
  const url = colbertRerankUrl();
  return url ? { available: true, url } : { available: false };
}

/**
 * Rerank `passages` against `query` via the py colbert `/rerank` endpoint.
 *
 * Returns the passages reordered best-first when the service is reachable and
 * returns a valid `{ results: [{index, score}] }` body; otherwise returns the
 * original order with a `reason` (degrade-safe, never throws).
 */
export async function colbertRerank(
  query: string,
  passages: string[],
): Promise<RerankResult> {
  const url = colbertRerankUrl();
  if (!url) return identity(passages, 'COLBERT_RERANK_URL not set');
  if (passages.length === 0) return { available: true, passages: [], order: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/rerank`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, passages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // 503 = py server reports rerank deps absent; any non-2xx → original order.
      const reason = `colbert rerank HTTP ${res.status}`;
      logger.warn({ status: res.status }, 'colbert rerank non-2xx — original order');
      return identity(passages, reason);
    }

    const body = (await res.json()) as { results?: { index: number; score: number }[] };
    const order = parseOrder(body, passages.length);
    if (!order) {
      return identity(passages, 'colbert rerank returned a malformed body');
    }

    return {
      available: true,
      passages: order.map((i) => passages[i]),
      order,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'colbert rerank failed';
    logger.warn({ reason }, 'colbert rerank failed — original order');
    return identity(passages, reason);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate the `{ results: [{index, score}] }` body into a permutation of
 * `[0, length)`. Returns null on any shape mismatch (missing results, bad
 * indices, or an incomplete/duplicated permutation) so the caller degrades to
 * the original order rather than trusting a partial reorder.
 */
function parseOrder(
  body: { results?: { index: number; score: number }[] },
  length: number,
): number[] | null {
  const results = body?.results;
  if (!Array.isArray(results) || results.length !== length) return null;
  const seen = new Set<number>();
  const order: number[] = [];
  for (const r of results) {
    const idx = r?.index;
    if (!Number.isInteger(idx) || idx < 0 || idx >= length || seen.has(idx)) {
      return null;
    }
    seen.add(idx);
    order.push(idx);
  }
  return order;
}
