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
} from '../../colbert-daemon.js';
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

/** One item of a batch rerank: a query + its own candidate passages. */
export interface ColbertBatchRerankItem {
  readonly query: string;
  readonly passages: readonly string[];
}

/** A batch rerank request — score many `{query, passages}` items in one call. */
export interface ColbertBatchRerankRequest {
  readonly batch: readonly ColbertBatchRerankItem[];
}

/** Build (index) a collection of passages into a named ColBERT index. */
export interface ColbertCreateCollectionRequest {
  readonly name: string;
  readonly passages: readonly string[];
  /** Overwrite an existing collection of the same name (default false). */
  readonly overwrite?: boolean;
}

/** Address one built collection by name (drop / stats). */
export interface ColbertCollectionNameRequest {
  readonly name: string;
}

/** List built collections — no arguments. */
export interface ColbertListCollectionsRequest {
  readonly _list?: never;
}

export type ColbertRequest =
  | ColbertRerankRequest
  | ColbertSearchRequest
  | ColbertBatchRerankRequest
  | ColbertCreateCollectionRequest
  | ColbertCollectionNameRequest
  | ColbertListCollectionsRequest;

/** One collection's filesystem summary (documents/embeddings/size). */
export interface ColbertCollectionSummary {
  readonly name: string;
  readonly documents: number | null;
  readonly embeddings: number | null;
  readonly partitions: number | null;
  readonly chunks: number | null;
  readonly bytes: number;
}

/** The listing of built collections under the index root. */
export interface ColbertCollectionsList {
  readonly indexRoot: string | null;
  readonly collections: readonly ColbertCollectionSummary[];
  /** Truthful reason when the list is empty because the root is absent. */
  readonly reason?: string;
}

/** Per-query result inside a batch rerank (best-first, degrade-safe per item). */
export interface ColbertBatchRerankItemResult {
  readonly available: boolean;
  readonly passages: readonly string[];
  readonly order: readonly number[];
  readonly scores: readonly number[];
}

/** The batch rerank result — one entry per input item, in input order. */
export interface ColbertBatchRerankResult {
  readonly available: boolean;
  readonly results: readonly ColbertBatchRerankItemResult[];
  readonly reason?: string;
}

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
/** Batch rerank scores N queries in one call — a wider (but still bounded) budget. */
const BATCH_RERANK_TIMEOUT_MS = 60_000;
/** Filesystem inventory ops (list/drop/stats) are cheap — a short timeout. */
const INVENTORY_TIMEOUT_MS = 10_000;
/** Building an index is heavy (encode + cluster + save) — a long, bounded budget. */
const CREATE_TIMEOUT_MS = 600_000;

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
      case 'rerank.batch':
        return this.rerankBatch(bound.value, call.input as ColbertBatchRerankRequest, call.timeoutMs);
      case 'collections.list':
        return this.listCollections(bound.value, call.timeoutMs);
      case 'collections.create':
        return this.createCollection(
          bound.value,
          call.input as ColbertCreateCollectionRequest,
          call.timeoutMs,
        );
      case 'collections.drop':
        return this.dropCollection(
          bound.value,
          call.input as ColbertCollectionNameRequest,
          call.timeoutMs,
        );
      case 'collections.stats':
        return this.collectionStats(
          bound.value,
          call.input as ColbertCollectionNameRequest,
          call.timeoutMs,
        );
      default:
        return fail(
          `colbert: unknown op '${call.op}' (expected 'rerank' | 'search' | 'rerank.batch' | ` +
            `'collections.list' | 'collections.create' | 'collections.drop' | 'collections.stats')`,
          'unknown_op',
        );
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

  /**
   * `POST /rerank/batch` — score many `{query, passages}` items in one round-trip.
   * Each item is validated into its own permutation and degrades independently to
   * identity order on a malformed item; a whole-request non-2xx (503 deps absent)
   * degrades every item to identity order (`available:false`), mirroring `rerank`.
   */
  private async rerankBatch(
    baseUrl: string,
    input: ColbertBatchRerankRequest,
    timeoutMs?: number,
  ): Promise<InvokeResult<ColbertBatchRerankResult>> {
    const rawBatch = Array.isArray(input?.batch) ? input.batch : [];
    // Normalize each item to a safe `{query, passages[]}`; drop non-string passages.
    const items = rawBatch.map((item) => ({
      query: typeof item?.query === 'string' ? item.query : '',
      passages: Array.isArray(item?.passages)
        ? item.passages.filter((p: unknown): p is string => typeof p === 'string')
        : [],
    }));
    if (items.length === 0) {
      return ok({ available: true, results: [] });
    }
    if (items.some((item) => !item.query)) {
      return fail('colbert.rerank.batch: every item requires a `query` string', 'bad_input');
    }
    const res = await daemonFetch<{
      results?: { query_index: number; results: { index: number; score: number }[] }[];
    }>(`${baseUrl}/rerank/batch`, {
      method: 'POST',
      body: { batch: items },
      timeoutMs: timeoutMs ?? BATCH_RERANK_TIMEOUT_MS,
    });
    if (!res.ok) {
      // Deps absent / transport failure → identity order for every query.
      return ok({
        available: false,
        results: items.map((item) => identityRerank(item.passages)),
        reason: res.reason,
      });
    }
    // Index the returned per-query results by query_index so we can fold each
    // back onto its input item positionally (never trust array order alone).
    const byIndex = new Map<number, { index: number; score: number }[]>();
    for (const entry of res.value?.results ?? []) {
      if (Number.isInteger(entry?.query_index) && Array.isArray(entry.results)) {
        byIndex.set(entry.query_index, entry.results);
      }
    }
    const results = items.map((item, i) => {
      if (item.passages.length === 0) {
        return { available: true, passages: [], order: [], scores: [] };
      }
      const parsed = parsePermutation(byIndex.get(i), item.passages.length);
      if (!parsed) return identityRerank(item.passages, 'colbert batch returned a malformed item');
      return {
        available: true,
        passages: parsed.order.map((idx) => item.passages[idx]),
        order: parsed.order,
        scores: parsed.scores,
      };
    });
    return ok({ available: true, results });
  }

  /**
   * `GET /collections` — list built ColBERT indexes under the index root. Pure
   * filesystem on the sidecar (no torch), so this works even when rerank is
   * degraded; a truthful `reason` carries "index root does not exist".
   */
  private async listCollections(
    baseUrl: string,
    timeoutMs?: number,
  ): Promise<InvokeResult<ColbertCollectionsList>> {
    const res = await daemonFetch<{
      index_root?: string;
      collections?: RawSummary[];
      reason?: string | null;
    }>(`${baseUrl}/collections`, { timeoutMs: timeoutMs ?? INVENTORY_TIMEOUT_MS });
    if (!res.ok) return fail(`colbert.collections.list unavailable (${res.reason})`, res.code);
    return ok({
      indexRoot: typeof res.value?.index_root === 'string' ? res.value.index_root : null,
      collections: (res.value?.collections ?? []).map(normalizeSummary),
      ...(res.value?.reason ? { reason: res.value.reason } : {}),
    });
  }

  /**
   * `POST /collections` — build a named ColBERT index from the supplied passages
   * (the REAL indexer). Requires torch/colbert on the sidecar, so a 503 surfaces
   * truthfully (never a fabricated build). Validates input before the call.
   */
  private async createCollection(
    baseUrl: string,
    input: ColbertCreateCollectionRequest,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const passages = Array.isArray(input?.passages)
      ? input.passages.filter((p): p is string => typeof p === 'string')
      : [];
    if (!name) return fail('colbert.collections.create requires a `name` string', 'bad_input');
    if (passages.length === 0) {
      return fail('colbert.collections.create requires non-empty `passages`', 'bad_input');
    }
    const res = await daemonFetch(`${baseUrl}/collections`, {
      method: 'POST',
      body: { name, passages, overwrite: input?.overwrite === true },
      timeoutMs: timeoutMs ?? CREATE_TIMEOUT_MS,
    });
    if (!res.ok) {
      return fail(
        `colbert.collections.create unavailable (${res.reason}) — the sidecar needs torch + ` +
          `colbert to build an index`,
        res.code,
      );
    }
    return ok(res.value);
  }

  /** `DELETE /collections/:name` — drop a built index (filesystem op on the sidecar). */
  private async dropCollection(
    baseUrl: string,
    input: ColbertCollectionNameRequest,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) return fail('colbert.collections.drop requires a `name` string', 'bad_input');
    const res = await daemonFetch(`${baseUrl}/collections/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      timeoutMs: timeoutMs ?? INVENTORY_TIMEOUT_MS,
    });
    if (!res.ok) return fail(`colbert.collections.drop failed (${res.reason})`, res.code);
    return ok(res.value);
  }

  /** `GET /collections/:name/stats` — filesystem stats for one built index. */
  private async collectionStats(
    baseUrl: string,
    input: ColbertCollectionNameRequest,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) return fail('colbert.collections.stats requires a `name` string', 'bad_input');
    const res = await daemonFetch(`${baseUrl}/collections/${encodeURIComponent(name)}/stats`, {
      timeoutMs: timeoutMs ?? INVENTORY_TIMEOUT_MS,
    });
    if (!res.ok) return fail(`colbert.collections.stats failed (${res.reason})`, res.code);
    return ok(res.value);
  }
}

/** The raw per-collection summary shape the sidecar returns over the wire. */
interface RawSummary {
  readonly name?: unknown;
  readonly documents?: unknown;
  readonly embeddings?: unknown;
  readonly partitions?: unknown;
  readonly chunks?: unknown;
  readonly bytes?: unknown;
}

/** Coerce a wire summary into the typed `ColbertCollectionSummary` (never throws). */
function normalizeSummary(raw: RawSummary): ColbertCollectionSummary {
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    name: typeof raw?.name === 'string' ? raw.name : '',
    documents: num(raw?.documents),
    embeddings: num(raw?.embeddings),
    partitions: num(raw?.partitions),
    chunks: num(raw?.chunks),
    bytes: num(raw?.bytes) ?? 0,
  };
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
