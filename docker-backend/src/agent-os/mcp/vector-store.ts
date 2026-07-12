/**
 * vector-store — the shared vector + embedding foundation (RECODER-ENGINES §18
 * ports: `EmbeddingPort`, `VectorStorePort`). Two later engines share this seam:
 * Code-Intelligence (E1 semantic index) and Retrieval/RAG (E2). Kept small,
 * typed, immutable, and — above all — DEGRADE-SAFE.
 *
 * DEGRADE CONTRACT (the hard rule):
 *   - `EmbeddingPort.embed → null` when no provider is configured (no
 *     TENSORZERO_URL, no OPENAI_API_KEY). Callers fall back to keyword search.
 *   - `VectorStorePort` is a truthful no-op when QDRANT_URL is unset:
 *     `ensureCollection → false`, `upsert → false`, `search → []`.
 *   - EVERY method catches its own network/parse errors and returns the safe
 *     fallback. Nothing here throws, and nothing fakes success.
 *
 * INJECTABLE BY CONSTRUCTION: both factories take `{ fetch, env }` so unit tests
 * drive them with a fake embedder + a fake Qdrant and touch no network. The
 * production wiring passes `globalThis.fetch` + `process.env`.
 *
 * NO HARDCODED KEYS: the embeddings key is read from env only; the Qdrant api-key
 * header is sent only when QDRANT_API_KEY is present.
 */

/** Minimal response shape we consume — lets tests fake without building Response. */
export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface HttpRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/** Injectable fetch seam (structurally satisfied by the global `fetch`). */
export type FetchLike = (url: string, init?: HttpRequestInit) => Promise<HttpResponseLike>;

/** The subset of env this module reads. Passed in so tests need no globals. */
export interface VectorEnv {
  /** LLM gateway base URL (tensorzero/pi-ai). Preferred embeddings provider. */
  TENSORZERO_URL?: string;
  /** Optional bearer for the gateway's OpenAI-compatible endpoint. */
  TENSORZERO_API_KEY?: string;
  /** Direct OpenAI-compatible embeddings key (fallback provider). */
  OPENAI_API_KEY?: string;
  /** Override the OpenAI-compatible base (e.g. a proxy). Defaults to OpenAI. */
  OPENAI_BASE_URL?: string;
  /** Fully-qualified embeddings endpoint override (wins over provider defaults). */
  EMBED_ENDPOINT?: string;
  /** Embedding model id. Defaults to text-embedding-3-small. */
  EMBED_MODEL?: string;
  /** Qdrant REST base URL. Unset ⇒ vector store is a truthful no-op. */
  QDRANT_URL?: string;
  /** Optional Qdrant api-key (sent as the `api-key` header when present). */
  QDRANT_API_KEY?: string;
}

export interface VectorStoreDeps {
  fetch: FetchLike;
  env: VectorEnv;
  /** Per-request timeout (ms). Default 15_000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';

function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Best-effort abort signal — used only when the platform supports it. Absent in
 * some runtimes, so we guard it; a fake fetch simply ignores the signal.
 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    const ctor = (AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }).timeout;
    return typeof ctor === 'function' ? ctor(ms) : undefined;
  } catch {
    return undefined;
  }
}

// ── Embedding port ───────────────────────────────────────────────────────────

export type EmbeddingProvider = 'tensorzero' | 'openai' | 'none';

export interface EmbeddingPort {
  /** Which provider (if any) is wired — surfaced for truthful health. */
  readonly provider: EmbeddingProvider;
  /**
   * Embed `texts` into vectors. Returns `null` when no provider is configured or
   * any error occurs (the caller then degrades to keyword search). An empty
   * input returns `[]` (a no-op, not a degrade).
   */
  embed(texts: string[]): Promise<number[][] | null>;
}

interface EmbedTarget {
  provider: EmbeddingProvider;
  endpoint: string;
  headers: Record<string, string>;
}

/** Resolve the embeddings endpoint + auth from env, or `none` when unconfigured. */
function resolveEmbedTarget(env: VectorEnv): EmbedTarget {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const tensor = str(env.TENSORZERO_URL);
  if (tensor) {
    const bearer = str(env.TENSORZERO_API_KEY);
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    return {
      provider: 'tensorzero',
      endpoint: str(env.EMBED_ENDPOINT) ?? `${trimBase(tensor)}/openai/v1/embeddings`,
      headers,
    };
  }
  const key = str(env.OPENAI_API_KEY);
  if (key) {
    headers.authorization = `Bearer ${key}`;
    const base = trimBase(str(env.OPENAI_BASE_URL) ?? 'https://api.openai.com');
    return { provider: 'openai', endpoint: str(env.EMBED_ENDPOINT) ?? `${base}/v1/embeddings`, headers };
  }
  return { provider: 'none', endpoint: '', headers };
}

/** Parse an OpenAI-compatible embeddings response into ordered vectors, or null. */
function parseEmbeddings(body: unknown, expected: number): number[][] | null {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data) || data.length !== expected) return null;
  const out: number[][] = [];
  // Respect the `index` field when present so ordering is provider-independent.
  const ordered = [...data].sort((a, b) => {
    const ai = typeof (a as { index?: number })?.index === 'number' ? (a as { index: number }).index : 0;
    const bi = typeof (b as { index?: number })?.index === 'number' ? (b as { index: number }).index : 0;
    return ai - bi;
  });
  for (const row of ordered) {
    const vec = (row as { embedding?: unknown })?.embedding;
    if (!Array.isArray(vec) || vec.some((n) => typeof n !== 'number')) return null;
    out.push(vec as number[]);
  }
  return out;
}

export function createEmbeddingPort(deps: VectorStoreDeps): EmbeddingPort {
  const { fetch: doFetch, env } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const target = resolveEmbedTarget(env);
  const model = str(env.EMBED_MODEL) ?? DEFAULT_EMBED_MODEL;

  return {
    provider: target.provider,
    async embed(texts: string[]): Promise<number[][] | null> {
      if (target.provider === 'none') return null;
      if (!Array.isArray(texts) || texts.length === 0) return [];
      try {
        const res = await doFetch(target.endpoint, {
          method: 'POST',
          headers: target.headers,
          body: JSON.stringify({ model, input: texts }),
          signal: timeoutSignal(timeoutMs),
        });
        if (!res.ok) return null;
        return parseEmbeddings(await res.json(), texts.length);
      } catch {
        // Truthful degrade — the caller falls back to keyword search.
        return null;
      }
    },
  };
}

// ── Vector store port (Qdrant REST) ──────────────────────────────────────────

export type VectorDistance = 'Cosine' | 'Dot' | 'Euclid';

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

export interface VectorStorePort {
  /** True when QDRANT_URL is wired; false ⇒ every method is a truthful no-op. */
  readonly configured: boolean;
  /** Idempotently ensure a collection of `dim` exists. No-op ⇒ false. */
  ensureCollection(name: string, dim: number, distance?: VectorDistance): Promise<boolean>;
  /** Upsert points. No-op / failure ⇒ false. */
  upsert(name: string, points: VectorPoint[]): Promise<boolean>;
  /** Nearest-neighbour search. No-op / failure ⇒ []. */
  search(name: string, vector: number[], topK: number): Promise<VectorMatch[]>;
}

function parseMatches(body: unknown): VectorMatch[] {
  const result = (body as { result?: unknown })?.result;
  if (!Array.isArray(result)) return [];
  const out: VectorMatch[] = [];
  for (const row of result) {
    const id = (row as { id?: unknown })?.id;
    const score = (row as { score?: unknown })?.score;
    if ((typeof id !== 'string' && typeof id !== 'number') || typeof score !== 'number') continue;
    const payload = (row as { payload?: unknown })?.payload;
    out.push({
      id,
      score,
      payload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined,
    });
  }
  return out;
}

export function createVectorStore(deps: VectorStoreDeps): VectorStorePort {
  const { fetch: doFetch, env } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = str(env.QDRANT_URL) ? trimBase(str(env.QDRANT_URL) as string) : undefined;

  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    const key = str(env.QDRANT_API_KEY);
    if (key) h['api-key'] = key;
    return h;
  }

  async function req(path: string, method: string, body?: unknown): Promise<HttpResponseLike | null> {
    if (!base) return null;
    try {
      return await doFetch(`${base}${path}`, {
        method,
        headers: headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeoutSignal(timeoutMs),
      });
    } catch {
      return null;
    }
  }

  return {
    configured: Boolean(base),

    async ensureCollection(name: string, dim: number, distance: VectorDistance = 'Cosine'): Promise<boolean> {
      if (!base) return false;
      // Idempotent: if the collection already exists, don't recreate it.
      const existing = await req(`/collections/${encodeURIComponent(name)}`, 'GET');
      if (existing?.ok) return true;
      const created = await req(`/collections/${encodeURIComponent(name)}`, 'PUT', {
        vectors: { size: dim, distance },
      });
      return Boolean(created?.ok);
    },

    async upsert(name: string, points: VectorPoint[]): Promise<boolean> {
      if (!base) return false;
      if (!Array.isArray(points) || points.length === 0) return true;
      const res = await req(`/collections/${encodeURIComponent(name)}/points?wait=true`, 'PUT', { points });
      return Boolean(res?.ok);
    },

    async search(name: string, vector: number[], topK: number): Promise<VectorMatch[]> {
      if (!base) return [];
      if (!Array.isArray(vector) || vector.length === 0) return [];
      const res = await req(`/collections/${encodeURIComponent(name)}/points/search`, 'POST', {
        vector,
        limit: topK > 0 ? topK : 10,
        with_payload: true,
      });
      if (!res?.ok) return [];
      try {
        return parseMatches(await res.json());
      } catch {
        return [];
      }
    },
  };
}

// ── Small helpers (used by tests + callers doing in-memory fallback ranking) ──

/**
 * Cosine similarity of two equal-length vectors. Returns 0 for a length mismatch
 * or a zero-norm vector (never throws, never NaN).
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
