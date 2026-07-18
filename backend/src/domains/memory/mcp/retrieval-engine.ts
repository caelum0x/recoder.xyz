/**
 * Retrieval MCP tools — the gated agent-facing RAG surface (mirrors the
 * `recoder_retrieval_search` / `recoder_retrieval_ingest` route names). Every call
 * passes the interop chain + governance gate at the host boundary; these handlers
 * stay thin and truthful over the `RetrievalPort`.
 *
 *  - `retrieval_search` — READ: semantic search + ColBERT rerank over an index.
 *  - `retrieval_ingest` — WRITE: chunk + embed + upsert documents into an index.
 *
 * DEGRADE CONTRACT surfaced: with no embedder OR no vector store, both return the
 * honest `status: 'not_configured'` — the agent learns retrieval is off rather
 * than receiving fabricated passages.
 *
 * TENANT ISOLATION (SECURITY): the `collection` arg is a DATA-SCOPE selector over
 * a SHARED vector store, and the store seam searches a collection by NAME with NO
 * per-tenant payload filter (`VectorStorePort.search(name, vector, topK)`). An
 * unbound `collection` would therefore let a caller read/write ANY collection in
 * the store by naming it — another tenant's RAG index, or the tenant-scoped mem0
 * memories collection (`recoder_mem0`) — a cross-tenant leak. So the effective
 * collection is BOUND to the host-authorized {@link McpToolCaller}: a NON-privileged
 * caller is confined to its OWN tenant namespace (any requested `collection` is a
 * sub-namespace UNDER the caller's subject — it can never name another tenant's or
 * a shared/global collection); an `admin`/`internal` caller may target a RAW
 * collection (a service acting on behalf of a tenant / the shared index). Absent a
 * caller these edge-exposed tools refuse (AUTH_REQUIRED) rather than guessing.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { RetrievalPort } from '../ports/retrieval.port.js';
import type { IngestDoc } from '../types.js';

/** The module surface the retrieval MCP tools bind to. */
export interface RetrievalMcpModule {
  retrieval(): RetrievalPort;
}

interface SearchInput {
  readonly query?: string;
  readonly topK?: number;
  readonly collection?: string;
}

interface IngestInput {
  readonly docs?: unknown;
  readonly collection?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Does the caller carry an elevated scope that may target a RAW/arbitrary collection? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** The caller's OWN tenant namespace (org scope wins over user), mirroring billing/cloud. */
function callerNamespace(caller: McpToolCaller): string {
  return str(caller.orgId) ?? caller.userId;
}

/**
 * Sanitize a collection segment to the store-safe charset. This is defence in
 * depth: the requested sub-collection is caller-controlled free text, so we strip
 * it to `[A-Za-z0-9_-]` (never a path/selector escape) and cap its length before
 * it becomes part of a physical collection name.
 */
function safeSegment(v: string): string {
  return v.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128) || 'default';
}

/**
 * Resolve the effective collection the handler reads/writes, BOUND to the
 * authorized caller. A non-privileged caller is confined to its OWN tenant
 * namespace: any requested `collection` becomes a sub-namespace *under* the
 * caller's subject (`rt__<subject>__<requested>`), so it can never name another
 * tenant's index, the shared default, or the tenant-scoped mem0 collection. An
 * `admin`/`internal` caller may target a RAW collection (service-on-behalf, incl.
 * the shared/global index). Absent a caller, refuse — these tools are edge-exposed
 * via the gated MCP host, so a missing identity is an unauthenticated call.
 *
 * Returns `undefined` only for a privileged caller that named no collection, so
 * the service falls back to its own default; a non-privileged caller ALWAYS gets a
 * concrete tenant-scoped name (at minimum `rt__<subject>__default`).
 */
function resolveCollection(
  requested: string | undefined,
  caller: McpToolCaller | undefined,
): string | undefined {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'retrieval: no authorized caller identity');
  }
  if (isPrivileged(caller)) {
    // Service-on-behalf: may target the shared/global index or any tenant's collection.
    return str(requested);
  }
  const ns = safeSegment(callerNamespace(caller));
  const sub = safeSegment(str(requested) ?? 'default');
  return `rt__${ns}__${sub}`;
}

/** Parse the `docs` array (each doc needs text OR path). */
function parseDocs(raw: unknown): readonly IngestDoc[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'docs must be a non-empty array');
  }
  return raw.map((entry, index) => {
    const doc = (entry ?? {}) as Record<string, unknown>;
    const text = typeof doc.text === 'string' && doc.text.trim() ? doc.text : undefined;
    const path = typeof doc.path === 'string' && doc.path.trim() ? doc.path : undefined;
    if (!text && !path) throw createError(ErrorCode.INVALID_INPUT, `docs[${index}] must have text or path`);
    return {
      ...(text ? { text } : {}),
      ...(path ? { path } : {}),
      ...(typeof doc.docId === 'string' && doc.docId ? { docId: doc.docId } : {}),
      ...(typeof doc.source === 'string' && doc.source ? { source: doc.source } : {}),
      ...(doc.metadata && typeof doc.metadata === 'object'
        ? { metadata: doc.metadata as Record<string, unknown> }
        : {}),
    } satisfies IngestDoc;
  });
}

export function buildRetrievalMcpTools(module: RetrievalMcpModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'retrieval_search',
      description:
        'Semantic document retrieval (embed → vector search → ColBERT rerank) over the CALLER\'s own tenant-scoped index. Returns ranked passages, or status "not_configured" when no embedder/vector store is wired.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as SearchInput;
        const query = input.query?.trim();
        if (!query) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'query is required');
        const collection = resolveCollection(input.collection, caller);
        const result = await module.retrieval().search(query, {
          ...(typeof input.topK === 'number' && input.topK > 0 ? { topK: Math.trunc(input.topK) } : {}),
          ...(collection ? { collection } : {}),
        });
        return result;
      },
    },
    {
      name: 'retrieval_ingest',
      description:
        'Ingest documents into the CALLER\'s own tenant-scoped retrieval index (chunk → embed → upsert). Returns per-doc results, or status "not_configured" when retrieval is off.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as IngestInput;
        const docs = parseDocs(input.docs);
        const collection = resolveCollection(input.collection, caller);
        const results = await module.retrieval().ingest(docs, collection ? { collection } : undefined);
        return { results };
      },
    },
  ];
}
