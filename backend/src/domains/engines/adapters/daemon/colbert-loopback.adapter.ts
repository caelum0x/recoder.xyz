/**
 * `ColbertLoopbackAdapter` — the DEEP `EngineClientPort` over the vendored
 * ColBERT late-interaction service (`backend/engines/py/colbert`), supervised as
 * an app-owned loopback Flask subprocess through the ONE `DaemonSupervisor`.
 *
 * DEEPENS (does not shallow-wrap) the proven seam in
 * `conductor/colbert-daemon.ts` (spawn/health/backoff) + `conductor/colbert-rerank.ts`
 * (the `/rerank` wire contract): it REUSES the vendored `resolveColbertPython` /
 * `resolveColbertEntrypoint` binding resolvers, and exercises the REAL endpoints
 * the Python server exposes:
 *
 *   - `rerank` → `POST /rerank {query, passages}` — the late-interaction MaxSim
 *     scorer (`rerank_server.py`). Returns the passages reordered best-first with
 *     the validated permutation; degrade-safe identity order on any failure.
 *   - `search` → `GET /api/search?query&k` — the index-search surface
 *     (`server.py`, a prebuilt-index late-interaction searcher). Truthfully
 *     degrades when the supervised process only serves `/rerank` (404).
 *
 * DEGRADE-SAFE: python/entrypoint absent → `binPath:null` → supervisor degrades
 * to `down`; the daemon's own `/health` reports `rerank_available:false` when
 * torch/colbert deps are missing, which the shared prober classifies as
 * `degraded` (never a faked `up`). No dep is ever installed here.
 */
import {
  resolveColbertPython,
  resolveColbertEntrypoint,
} from '../../../../conductor/colbert-daemon.js';
import type { Logger } from '../../../../shared/logger.js';
import { fail, ok, type EngineId, type InvokeResult } from '../../types.js';
import type { EngineCall } from '../../ports/engine-client.port.js';
import type { DaemonSupervisorPort } from '../../ports/daemon-supervisor.port.js';
import {
  DaemonEngineAdapter,
  daemonFetch,
  type DaemonAdapterConfig,
  type ResolvedBinding,
} from './daemon-adapter-base.js';

const COLBERT_ID: EngineId = 'colbert';

/** A rerank request: order `passages` by ColBERT late-interaction score to `query`. */
export interface ColbertRerankRequest {
  readonly query: string;
  readonly passages: readonly string[];
}

/** A search request against a prebuilt ColBERT index (`server.py`). */
export interface ColbertSearchRequest {
  readonly query: string;
  /** Top-k passages to return (default 10). */
  readonly k?: number;
}

export type ColbertRequest = ColbertRerankRequest | ColbertSearchRequest;

/** The reranked result — best-first passages + the original-index permutation. */
export interface ColbertRerankResult {
  readonly available: boolean;
  readonly passages: readonly string[];
  /** `order[0]` is the input index of the best passage. */
  readonly order: readonly number[];
  /** Late-interaction scores aligned to `order` (best-first). */
  readonly scores: readonly number[];
  /** Why rerank was skipped/failed (only set when `available` is false). */
  readonly reason?: string;
}

/** Default rerank timeout — late-interaction scoring is CPU/GPU bound but bounded. */
const RERANK_TIMEOUT_MS = 15_000;
const SEARCH_TIMEOUT_MS = 15_000;

export class ColbertLoopbackAdapter extends DaemonEngineAdapter<ColbertRequest, unknown> {
  constructor(supervisor: DaemonSupervisorPort, config: DaemonAdapterConfig, log: Logger) {
    super(COLBERT_ID, supervisor, config, log);
  }

  protected resolveBinding(): ResolvedBinding {
    // REUSE the vendored resolvers (repo-root walk → project venv → PATH python3).
    const python = this.config.binOverride ?? resolveColbertPython() ?? null;
    const entrypoint = resolveColbertEntrypoint() ?? null;
    if (!python || !entrypoint) {
      return { binPath: null, args: [] };
    }
    const [host, portStr] = this.listenAddr().split(':');
    return {
      binPath: python,
      args: [entrypoint],
      cwd: dirOf(entrypoint),
      // MINIMAL env: rerank_server.py reads RERANK_HOST + PORT (+ composer keys).
      env: {
        RERANK_HOST: host || '127.0.0.1',
        PORT: portStr || '8893',
        ...(this.config.childEnv ?? {}),
      },
    };
  }

  async invoke(call: EngineCall<ColbertRequest>): Promise<InvokeResult<unknown>> {
    const bound = await this.resolveBaseUrl();
    if (!bound.ok) return bound;
    switch (call.op) {
      case 'rerank':
        return this.rerank(bound.value, call.input as ColbertRerankRequest, call.timeoutMs);
      case 'search':
        return this.search(bound.value, call.input as ColbertSearchRequest, call.timeoutMs);
      default:
        return fail(`colbert: unknown op '${call.op}' (expected 'rerank' | 'search')`, 'unknown_op');
    }
  }

  /**
   * `POST /rerank` — the real late-interaction scorer. Validates the
   * `{results:[{index,score}]}` body into a full permutation of `[0,n)` (the
   * exact `colbert-rerank.ts` contract) and reorders best-first; a malformed or
   * partial body degrades to identity order rather than trusting a partial sort.
   */
  private async rerank(
    baseUrl: string,
    input: ColbertRerankRequest,
    timeoutMs?: number,
  ): Promise<InvokeResult<ColbertRerankResult>> {
    const query = typeof input?.query === 'string' ? input.query : '';
    const passages = Array.isArray(input?.passages) ? [...input.passages] : [];
    if (!query) return fail('colbert.rerank requires a `query` string', 'bad_input');
    if (passages.length === 0) {
      return ok({ available: true, passages: [], order: [], scores: [] });
    }
    const res = await daemonFetch<{ results?: { index: number; score: number }[] }>(
      `${baseUrl}/rerank`,
      { method: 'POST', body: { query, passages }, timeoutMs: timeoutMs ?? RERANK_TIMEOUT_MS },
    );
    if (!res.ok) {
      // 503 = deps absent; any non-2xx → truthful identity order (available:false).
      return ok(identityRerank(passages, res.reason));
    }
    const parsed = parsePermutation(res.value?.results, passages.length);
    if (!parsed) return ok(identityRerank(passages, 'colbert rerank returned a malformed body'));
    return ok({
      available: true,
      passages: parsed.order.map((i) => passages[i]),
      order: parsed.order,
      scores: parsed.scores,
    });
  }

  /**
   * `GET /api/search?query&k` — the prebuilt-index searcher (`server.py`). When
   * the supervised process is the rerank-only server, this 404s and we degrade
   * truthfully (never fabricate hits).
   */
  private async search(
    baseUrl: string,
    input: ColbertSearchRequest,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    const query = typeof input?.query === 'string' ? input.query : '';
    if (!query) return fail('colbert.search requires a `query` string', 'bad_input');
    const k = Number.isInteger(input?.k) && (input.k as number) > 0 ? (input.k as number) : 10;
    const qs = `?query=${encodeURIComponent(query)}&k=${k}`;
    const res = await daemonFetch(`${baseUrl}/api/search${qs}`, {
      timeoutMs: timeoutMs ?? SEARCH_TIMEOUT_MS,
    });
    if (!res.ok) {
      return fail(
        `colbert.search unavailable (${res.reason}) — the supervised process may be the ` +
          `rerank-only server; point COLBERT at server.py for index search`,
        res.code,
      );
    }
    return ok(res.value);
  }
}

/** Identity (original-order) rerank result used on every degrade path. */
function identityRerank(passages: readonly string[], reason?: string): ColbertRerankResult {
  return {
    available: false,
    passages,
    order: passages.map((_, i) => i),
    scores: passages.map(() => 0),
    ...(reason ? { reason } : {}),
  };
}

/**
 * Validate `{index,score}[]` into a full permutation of `[0,length)`. Returns
 * `null` on any shape mismatch (missing, wrong length, out-of-range/duplicate
 * index) so the caller degrades to the original order.
 */
function parsePermutation(
  results: { index: number; score: number }[] | undefined,
  length: number,
): { order: number[]; scores: number[] } | null {
  if (!Array.isArray(results) || results.length !== length) return null;
  const seen = new Set<number>();
  const order: number[] = [];
  const scores: number[] = [];
  for (const r of results) {
    const idx = r?.index;
    if (!Number.isInteger(idx) || idx < 0 || idx >= length || seen.has(idx)) return null;
    seen.add(idx);
    order.push(idx);
    scores.push(typeof r?.score === 'number' && Number.isFinite(r.score) ? r.score : 0);
  }
  return { order, scores };
}

/** Directory of a file path without pulling in node:path at the type layer. */
function dirOf(filePath: string): string {
  const i = filePath.lastIndexOf('/');
  return i > 0 ? filePath.slice(0, i) : filePath;
}
