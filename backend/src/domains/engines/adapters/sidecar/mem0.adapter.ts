/**
 * `Mem0Adapter` — the DEEP `EngineClientPort` over the OWNED mem0 engine
 * (`@recoder/mem0` + Qdrant), the "agent memory" pillar. It exposes the FULL
 * memory API — `add`, `search`, `getAll`, `get`, `history`, `update`, `delete` —
 * as one typed engine surface a capability domain (the memory domain) consumes
 * without loading the vector store itself (conflict #8: engines own the transport).
 *
 * It REUSES `backend/src/engines/mem0-client.ts` for the in-process OSS path
 * (LLM-fact-extraction over Qdrant): `mem0Add` / `mem0Search` / `mem0GetAll` /
 * `mem0Delete` / `mem0Health`. The three methods that in-proc client does not
 * expose — single-`get`, `history`, `update` — are served over the self-hosted
 * mem0 FastAPI sidecar (`MEM0_BASE_URL` / an externally-managed `externalUrls.mem0`
 * / a supervised loopback-http process): `GET /memories/{id}`,
 * `GET /memories/{id}/history`, `PUT /memories/{id}`. So BOTH real surfaces are
 * exercised: the in-proc OSS store and the REST sidecar.
 *
 * The DEEPER insight ops — `recall` (filtered recall by scope/time/metadata),
 * `relations` (an entity co-occurrence graph read), and `stats` (aggregate
 * counts) — are served ONLY by the mem0 FastAPI sidecar's `/insights/*` surface
 * (`POST /insights/recall`, `GET /insights/graph`, `GET /insights/stats`) since
 * they aggregate over the whole store and the in-proc client does not expose
 * them. With no sidecar configured they degrade truthfully to `unavailable`.
 *
 * DEGRADE-SAFE LAW: no `MEM0_API_KEY` + no self-hostable LLM/embedder and no
 * sidecar URL ⇒ `health()` is a truthful `down` and every `invoke` returns
 * `{ ok:false, reason }`. It NEVER fabricates a memory and NEVER throws the seam.
 */
import {
  mem0Add,
  mem0Search,
  mem0GetAll,
  mem0Delete,
  mem0Health,
  type Mem0Health,
  type Mem0Message,
  type Mem0Scope,
  type Mem0MemoryRecord,
} from '../../mem0-client.js';
import { join } from 'node:path';
import type { Logger } from '../../../../shared/logger.js';
import type { EnginesConfig } from '../../config.js';
import { isEngineEnabled, sidecarEnvFor } from '../../config.js';
import { DEFAULT_LOOPBACK } from '../../constants.js';
import { resolveEnginesPyRoot, resolveVenvPython } from './sidecar-paths.js';
import { EngineClientBase } from '../../ports/engine-client.port.js';
import type { EngineCall } from '../../ports/engine-client.port.js';
import type { SidecarSpec, SidecarSupervisorPort } from '../../ports/sidecar-supervisor.port.js';
import { down, fail, ok, up, type EngineHealth, type InvokeResult } from '../../types.js';

/** The mem0 engine ops the adapter maps onto the real surfaces. */
export type Mem0Op =
  | 'add'
  | 'search'
  | 'getAll'
  | 'get'
  | 'history'
  | 'update'
  | 'delete'
  | 'health'
  // --- deep insight ops (served by the mem0 FastAPI `/insights/*` surface) ---
  | 'recall'
  | 'relations'
  | 'stats';

/** The bound in-proc mem0-client functions (injectable so tests need no Qdrant). */
export interface Mem0ClientFns {
  add: typeof mem0Add;
  search: typeof mem0Search;
  getAll: typeof mem0GetAll;
  delete: typeof mem0Delete;
  health: typeof mem0Health;
}

const DEFAULT_MEM0_FNS: Mem0ClientFns = {
  add: mem0Add,
  search: mem0Search,
  getAll: mem0GetAll,
  delete: mem0Delete,
  health: mem0Health,
};

/** Minimal fetch surface (Node global fetch) — injectable for the REST sidecar. */
export type Mem0Fetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface Mem0AdapterDeps {
  readonly supervisor: SidecarSupervisorPort;
  readonly config: EnginesConfig;
  readonly log: Logger;
  /** Override the in-proc mem0-client functions (defaults to the real module). */
  readonly client?: Mem0ClientFns;
  /** Override fetch for the REST sidecar path (defaults to Node global fetch). */
  readonly fetch?: Mem0Fetch;
  /** Resolve the mem0 REST base URL (defaults to config + `MEM0_BASE_URL`). */
  readonly baseUrl?: () => string | null;
}

const REST_TIMEOUT_MS = 4_000;

export class Mem0Adapter extends EngineClientBase<unknown, unknown> {
  private readonly deps: Mem0AdapterDeps;
  private readonly client: Mem0ClientFns;
  private readonly doFetch: Mem0Fetch | null;

  constructor(deps: Mem0AdapterDeps) {
    super('mem0', 'sidecar');
    this.deps = deps;
    this.client = deps.client ?? DEFAULT_MEM0_FNS;
    this.doFetch = deps.fetch ?? (typeof fetch === 'function' ? (fetch as unknown as Mem0Fetch) : null);
  }

  /** Idempotent, degrade-safe: bring up the loopback-http sidecar when configured. */
  override async start(): Promise<void> {
    if (!isEngineEnabled(this.deps.config, 'mem0')) return;
    const spec = this.spec();
    if (!spec) return;
    try {
      await this.deps.supervisor.ensureStarted(spec);
    } catch (err) {
      this.deps.log.warn({ err: message(err) }, 'mem0 sidecar ensureStarted failed — in-proc path only');
    }
  }

  override async stop(): Promise<void> {
    try {
      await this.deps.supervisor.stop('mem0');
    } catch {
      // idempotent, degrade-safe
    }
  }

  async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
    if (!isEngineEnabled(this.deps.config, 'mem0')) {
      return fail('mem0 engine disabled by config', 'disabled');
    }
    const op = call.op as Mem0Op;
    const input = (call.input ?? {}) as Record<string, unknown>;
    try {
      switch (op) {
        case 'add':
          return await this.opAdd(input);
        case 'search':
          return await this.opSearch(input);
        case 'getAll':
          return await this.opGetAll(input);
        case 'delete':
          return await this.opDelete(input);
        case 'get':
          return await this.opRestGet(input);
        case 'history':
          return await this.opRestHistory(input);
        case 'update':
          return await this.opRestUpdate(input);
        case 'recall':
          return await this.opRestRecall(input);
        case 'relations':
          return await this.opRestRelations(input);
        case 'stats':
          return await this.opRestStats(input);
        case 'health': {
          const h = await this.client.health();
          return ok(h);
        }
        default:
          return fail(`unknown mem0 op '${call.op}'`, 'bad_op');
      }
    } catch (err) {
      return fail(`mem0 ${op} failed: ${message(err)}`);
    }
  }

  async health(): Promise<EngineHealth> {
    if (!isEngineEnabled(this.deps.config, 'mem0')) {
      return down('mem0', 'sidecar', 'mem0 engine disabled by config');
    }
    // Primary truth: the in-proc OSS/platform client availability.
    let inProc: Mem0Health | null = null;
    try {
      inProc = await this.client.health();
    } catch (err) {
      inProc = { available: false, mode: 'none', reason: message(err) };
    }
    if (inProc?.available) {
      return up('mem0', 'sidecar', {
        bindingPath: inProc.vectorStore ?? 'mem0',
        version: inProc.mode,
      });
    }
    // Secondary: a supervised / externally-managed REST sidecar may still serve.
    const spec = this.spec();
    if (spec) {
      const sidecar = await this.deps.supervisor.health(spec).catch(() => null);
      if (sidecar && sidecar.status === 'up') return sidecar;
    }
    return down('mem0', 'sidecar', inProc?.reason ?? 'mem0 unavailable (no LLM/embedder/API key and no sidecar)');
  }

  // --- in-proc OSS ops (reuse mem0-client) ---

  private async opAdd(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const messages = normalizeMessages(input.messages);
    const scope = normalizeScope(input);
    if (!scope) return fail('mem0 add requires a userId', 'bad_input');
    if (messages.length === 0) return fail('mem0 add requires non-empty messages', 'bad_input');
    const res = await this.client.add(messages, scope);
    if (!res.available) return fail(res.reason ?? 'mem0 unavailable', 'unavailable');
    return ok({ memories: res.memories ?? [], reason: res.reason });
  }

  private async opSearch(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const query = typeof input.query === 'string' ? input.query : '';
    const scope = normalizeScope(input);
    if (!scope) return fail('mem0 search requires a userId', 'bad_input');
    if (!query.trim()) return fail('mem0 search requires a query', 'bad_input');
    const limit = numberOr(input.limit, 10);
    const res = await this.client.search(query, scope, limit);
    if (!res.available) return fail(res.reason ?? 'mem0 unavailable', 'unavailable');
    return ok({ results: res.results, reason: res.reason });
  }

  private async opGetAll(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const scope = normalizeScope(input);
    if (!scope) return fail('mem0 getAll requires a userId', 'bad_input');
    const res = await this.client.getAll(scope);
    if (!res.available) return fail(res.reason ?? 'mem0 unavailable', 'unavailable');
    return ok({ results: res.results, reason: res.reason });
  }

  private async opDelete(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const id = typeof input.memoryId === 'string' ? input.memoryId : '';
    if (!id.trim()) return fail('mem0 delete requires a memoryId', 'bad_input');
    const res = await this.client.delete(id);
    if (!res.available) return fail(res.reason ?? 'mem0 unavailable', 'unavailable');
    return ok({ deleted: res.deleted, reason: res.reason });
  }

  // --- REST sidecar ops (get / history / update — not in the in-proc client) ---

  private async opRestGet(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const id = typeof input.memoryId === 'string' ? input.memoryId : '';
    if (!id.trim()) return fail('mem0 get requires a memoryId', 'bad_input');
    return this.rest('GET', `/memories/${encodeURIComponent(id)}`);
  }

  private async opRestHistory(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const id = typeof input.memoryId === 'string' ? input.memoryId : '';
    if (!id.trim()) return fail('mem0 history requires a memoryId', 'bad_input');
    return this.rest('GET', `/memories/${encodeURIComponent(id)}/history`);
  }

  private async opRestUpdate(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const id = typeof input.memoryId === 'string' ? input.memoryId : '';
    if (!id.trim()) return fail('mem0 update requires a memoryId', 'bad_input');
    const text = typeof input.text === 'string' ? input.text : typeof input.memory === 'string' ? input.memory : null;
    if (text === null) return fail('mem0 update requires a text/memory field', 'bad_input');
    return this.rest('PUT', `/memories/${encodeURIComponent(id)}`, { text });
  }

  // --- deep insight ops (mem0 FastAPI `/insights/*` — aggregate/filter surface) ---

  /**
   * Filtered recall by scope (`userId`/`agentId`/`runId`), an optional created_at
   * window (`createdAfter`/`createdBefore`), metadata equality filters, and an
   * optional semantic `query`. Requires at least one entity id (the store rejects
   * an unscoped list). Maps to `POST /insights/recall`.
   */
  private async opRestRecall(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const body: Record<string, unknown> = {};
    const userId = trimStr(input.userId);
    const agentId = trimStr(input.agentId);
    const runId = trimStr(input.runId);
    if (userId) body.user_id = userId;
    if (agentId) body.agent_id = agentId;
    if (runId) body.run_id = runId;
    if (!userId && !agentId && !runId) {
      return fail('mem0 recall requires at least one of userId/agentId/runId', 'bad_input');
    }
    const query = trimStr(input.query);
    if (query) body.query = query;
    const createdAfter = trimStr(input.createdAfter);
    const createdBefore = trimStr(input.createdBefore);
    if (createdAfter) body.created_after = createdAfter;
    if (createdBefore) body.created_before = createdBefore;
    if (input.metadata && typeof input.metadata === 'object') body.metadata = input.metadata;
    if (input.limit !== undefined) body.limit = numberOr(input.limit, 50);
    return this.rest('POST', '/insights/recall', body);
  }

  /**
   * Entity co-occurrence relations graph. Optional scope (`userId`/`agentId`/
   * `runId`) restricts aggregation; `focus`/`entityType` center a neighborhood.
   * Maps to `GET /insights/graph`.
   */
  private async opRestRelations(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const params = new URLSearchParams();
    appendIf(params, 'user_id', trimStr(input.userId));
    appendIf(params, 'agent_id', trimStr(input.agentId));
    appendIf(params, 'run_id', trimStr(input.runId));
    appendIf(params, 'focus', trimStr(input.focus));
    const entityType = trimStr(input.entityType);
    if (entityType === 'user' || entityType === 'agent' || entityType === 'run') {
      params.set('entity_type', entityType);
    }
    if (input.limit !== undefined) params.set('limit', String(numberOr(input.limit, 10000, 10000)));
    return this.rest('GET', withQuery('/insights/graph', params));
  }

  /**
   * Aggregate memory stats (totals, per-entity-type counts, created_at span).
   * Optional scope (`userId`/`agentId`/`runId`) restricts the aggregation to one
   * tenant. Maps to `GET /insights/stats`.
   */
  private async opRestStats(input: Record<string, unknown>): Promise<InvokeResult<unknown>> {
    const params = new URLSearchParams();
    appendIf(params, 'user_id', trimStr(input.userId));
    appendIf(params, 'agent_id', trimStr(input.agentId));
    appendIf(params, 'run_id', trimStr(input.runId));
    return this.rest('GET', withQuery('/insights/stats', params));
  }

  private async resolveRestBase(): Promise<string | null> {
    const override = this.deps.baseUrl?.();
    if (override) return trimSlash(override);
    const external = this.deps.config.externalUrls.mem0;
    if (external) return trimSlash(external);
    // A supervised loopback-http sidecar exposes a baseUrl once started.
    const spec = this.spec();
    if (spec) {
      const handle = this.deps.supervisor.handle('mem0') ?? (await this.deps.supervisor.ensureStarted(spec));
      if (handle?.baseUrl) return trimSlash(handle.baseUrl);
    }
    return null;
  }

  private async rest(method: string, path: string, body?: unknown): Promise<InvokeResult<unknown>> {
    if (!this.doFetch) return fail('no fetch available for mem0 REST sidecar', 'unavailable');
    const base = await this.resolveRestBase();
    if (!base) {
      return fail('mem0 REST sidecar not configured (set MEM0_BASE_URL or externalUrls.mem0)', 'unavailable');
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REST_TIMEOUT_MS) : null;
    try {
      const res = await this.doFetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(controller ? ({ signal: controller.signal } as never) : {}),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 200);
        return fail(`mem0 REST ${method} ${path} → ${res.status}${detail ? `: ${detail}` : ''}`, 'rest_error');
      }
      const json = await res.json().catch(() => null);
      return ok(json);
    } catch (err) {
      return fail(`mem0 REST ${method} ${path} failed: ${message(err)}`, 'rest_error');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Build the mem0 sidecar spec, or null when no sidecar is possible.
   *
   * When `externalUrls.mem0` is set we do NOT spawn (pythonPath null → the
   * adapter reaches the operator instance over REST). Otherwise we resolve the
   * venv python by convention (`engines/py/mem0/.venv`) and run the FastAPI app
   * in MODULE mode (`python -m uvicorn main:app`, cwd `engines/py/mem0/server`)
   * because `main.py`'s dev runner forces `reload=True`. Health is `/api/health`.
   */
  private spec(): SidecarSpec | null {
    const external = this.deps.config.externalUrls.mem0;
    const pyRoot = resolveEnginesPyRoot(this.deps.config.repoRoot);
    const engineDir = pyRoot ? join(pyRoot, 'mem0') : null;
    const serverDir = engineDir ? join(engineDir, 'server') : undefined;
    // External URL → skip-spawn (REST path); else resolve the local venv python.
    const python = external
      ? null
      : this.deps.config.sidecarPython.mem0 ?? (engineDir ? resolveVenvPython(engineDir) : null);
    // A real venv OR an external URL makes a sidecar meaningful.
    if (!python && !external) return null;
    const port = DEFAULT_LOOPBACK.mem0.split(':')[1] ?? '8896';
    const env: Record<string, string> = {
      AUTH_DISABLED: 'true',
      ...(external ? { MEM0_BASE_URL: external } : {}),
      ...sidecarEnvFor(this.deps.config, 'mem0'),
    };
    return {
      engineId: 'mem0',
      transport: 'loopback-http',
      pythonPath: python,
      entrypoint: null, // module mode — the args + cwd carry the target
      args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', port],
      ...(serverDir ? { cwd: serverDir } : {}),
      listenAddr: DEFAULT_LOOPBACK.mem0,
      healthPath: '/api/health',
      env,
    };
  }
}

// --- pure input normalizers (typed at the boundary) ---

function normalizeMessages(raw: unknown): Mem0Message[] {
  if (typeof raw === 'string') return [{ role: 'user', content: raw }];
  if (!Array.isArray(raw)) return [];
  const out: Mem0Message[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const content = typeof m.content === 'string' ? m.content : undefined;
    if (!content) continue;
    const role = m.role === 'assistant' || m.role === 'system' ? m.role : 'user';
    out.push({ role, content });
  }
  return out;
}

function normalizeScope(input: Record<string, unknown>): Mem0Scope | null {
  const userId = typeof input.userId === 'string' && input.userId.trim() ? input.userId : null;
  if (!userId) return null;
  const scope: Mem0Scope = { userId };
  if (typeof input.agentId === 'string') scope.agentId = input.agentId;
  if (typeof input.runId === 'string') scope.runId = input.runId;
  if (input.metadata && typeof input.metadata === 'object') {
    scope.metadata = input.metadata as Record<string, unknown>;
  }
  return scope;
}

function numberOr(value: unknown, fallback: number, max = 100): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}

/** Trim a value to a non-empty string, or null. */
function trimStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Set a query param only when the value is a non-empty string. */
function appendIf(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
}

/** Append an encoded query string to a path (no `?` when empty). */
function withQuery(path: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type { Mem0MemoryRecord };
