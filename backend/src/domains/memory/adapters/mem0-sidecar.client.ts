/**
 * mem0-sidecar.client — a thin, degrade-safe HTTP client to the self-hosted
 * `backend/engines/py/mem0` FastAPI server (`/search`, `/memories`, `/health`).
 *
 * This is the "self-hosted" transport used when `MEM0_BASE_URL` points at a
 * loopback mem0 sidecar instead of the SaaS default or the in-lib OSS client.
 * Fetch is injectable so unit tests touch no network.
 *
 * DEGRADE CONTRACT: no base URL, server down / non-2xx, or a malformed body →
 * `search` returns `[]`, `add` returns `{ ok:false }`, `health` returns
 * `available:false` with a truthful reason. Nothing here throws or fabricates.
 */
import type { Mem0Message, Mem0Result, Mem0Scope } from '../ports/mem0.port.js';

/** Minimal response shape — lets tests fake without building a Response. */
export interface Mem0HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type Mem0Fetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<Mem0HttpResponse>;

export interface Mem0SidecarClient {
  readonly baseUrl: string;
  search(
    query: string,
    scope: Mem0Scope,
    limit: number
  ): Promise<readonly Mem0Result[]>;
  add(
    messages: readonly Mem0Message[],
    scope: Mem0Scope
  ): Promise<{ ok: boolean; reason?: string }>;
  /** Drive the sidecar's batch consolidation/decay pass. `{ ok:false }` when unreachable/absent. */
  consolidate(scope?: Mem0Scope): Promise<{ ok: boolean; reason?: string }>;
  health(): Promise<{ available: boolean; reason?: string }>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Best-effort abort signal; absent in some runtimes, so guard it. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    const ctor = (
      AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }
    ).timeout;
    return typeof ctor === 'function' ? ctor(ms) : undefined;
  } catch {
    return undefined;
  }
}

function filtersFor(scope: Mem0Scope): Record<string, unknown> {
  const filters: Record<string, unknown> = { user_id: scope.userId };
  if (scope.agentId) filters.agent_id = scope.agentId;
  if (scope.runId) filters.run_id = scope.runId;
  return filters;
}

function parseResults(body: unknown): Mem0Result[] {
  const rows = Array.isArray((body as { results?: unknown })?.results)
    ? (body as { results: unknown[] }).results
    : Array.isArray(body)
      ? (body as unknown[])
      : [];
  const out: Mem0Result[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const memory =
      typeof r.memory === 'string'
        ? r.memory
        : typeof r.text === 'string'
          ? r.text
          : '';
    if (!id || !memory) continue;
    out.push(
      typeof r.score === 'number'
        ? { id, memory, score: r.score }
        : { id, memory }
    );
  }
  return out;
}

/**
 * Build a mem0 sidecar client. `baseUrl` is normalized (trailing slash stripped);
 * an empty base yields a client whose every method degrades truthfully.
 */
export function createMem0SidecarClient(
  baseUrl: string,
  doFetch: Mem0Fetch = fetch as unknown as Mem0Fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Mem0SidecarClient {
  const base = baseUrl.trim().replace(/\/+$/, '');

  async function req(
    path: string,
    body: unknown
  ): Promise<Mem0HttpResponse | null> {
    if (!base || typeof doFetch !== 'function') return null;
    try {
      return await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeoutSignal(timeoutMs),
      });
    } catch {
      return null;
    }
  }

  return {
    baseUrl: base,

    async search(query, scope, limit) {
      const res = await req('/search', {
        query,
        filters: filtersFor(scope),
        topK: limit,
      });
      if (!res?.ok) return [];
      try {
        return parseResults(await res.json());
      } catch {
        return [];
      }
    },

    async add(messages, scope) {
      const res = await req('/memories', { messages, ...filtersFor(scope) });
      if (res === null)
        return {
          ok: false,
          reason: 'mem0 sidecar unreachable or unconfigured',
        };
      return res.ok
        ? { ok: true }
        : { ok: false, reason: `mem0 sidecar HTTP ${res.status}` };
    },

    async consolidate(scope) {
      const res = await req('/consolidate', scope ? filtersFor(scope) : {});
      if (res === null)
        return {
          ok: false,
          reason: 'mem0 sidecar unreachable or unconfigured',
        };
      return res.ok
        ? { ok: true }
        : { ok: false, reason: `mem0 sidecar HTTP ${res.status}` };
    },

    async health() {
      if (!base || typeof doFetch !== 'function') {
        return { available: false, reason: 'mem0 sidecar not configured' };
      }
      try {
        const res = await doFetch(`${base}/health`, {
          method: 'GET',
          headers: { 'content-type': 'application/json' },
          signal: timeoutSignal(timeoutMs),
        });
        return res.ok
          ? { available: true }
          : { available: false, reason: `mem0 sidecar HTTP ${res.status}` };
      } catch (err) {
        return {
          available: false,
          reason:
            err instanceof Error ? err.message : 'mem0 sidecar health failed',
        };
      }
    },
  };
}
