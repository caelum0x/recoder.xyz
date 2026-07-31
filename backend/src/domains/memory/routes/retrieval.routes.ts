/**
 * Retrieval routes — the HTTP edges for the RAG ingest/search facade.
 *
 * Mount under `/api/agent-os` so paths resolve to:
 *   GET  /api/agent-os/retrieval/status   is retrieval configured (embedder+store)?
 *   POST /api/agent-os/retrieval/ingest   ingest documents into the index
 *   POST /api/agent-os/retrieval/search   semantic search + ColBERT rerank
 *
 * DEGRADE CONTRACT surfaced truthfully: when no embedder OR no vector store is
 * configured, ingest/search return `status: 'not_configured'` (a 200 with the
 * honest status, NOT a 500) — the caller learns retrieval is off, nothing faked.
 *
 * SECURITY POSTURE (two boundary invariants this edge enforces):
 *  1. NO FILESYSTEM READ FROM THE NETWORK — a caller-supplied `path` would flow
 *     to `readFile(path)` with no containment (arbitrary backend-file exfiltration
 *     via ingest→search). So this HTTP edge accepts INLINE `text` ONLY: any `path`
 *     is stripped, and a doc that carries no inline text is rejected (400) BEFORE
 *     it can reach the loader. Path-based ingest belongs to trusted internal call
 *     sites, not this authenticated-but-untrusted network surface.
 *  2. TENANT-BOUND COLLECTIONS — the store searches a collection by NAME with no
 *     per-tenant payload filter, so an unbound `collection` would let a caller
 *     read/write ANY index (another tenant's, or the shared `recoder_mem0`). The
 *     effective collection is therefore BOUND to `req.principal`, reusing the MCP
 *     retrieval-engine's `rt__<ns>__<sub>` scheme so HTTP + MCP agree: a
 *     non-privileged caller is confined UNDER its own subject; an `admin`/`internal`
 *     caller may target a RAW collection (service-on-behalf).
 */
import { Router } from 'express';
import { ErrorCode, createError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { RetrievalPort } from '../ports/retrieval.port.js';
import type { IngestDoc } from '../types.js';

export interface RetrievalRouterDeps {
  readonly retrieval: RetrievalPort;
  readonly middleware: AuthMiddleware;
}

/** Build the retrieval router (mount under `/api/agent-os`). */
export function buildRetrievalRouter(deps: RetrievalRouterDeps): Router {
  const router = Router();
  const { retrieval, middleware } = deps;

  router.get(
    '/retrieval/status',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { configured: retrieval.configured() });
    }),
  );

  router.post(
    '/retrieval/ingest',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const docs = parseDocs(body.docs);
      const collection = resolveCollection(optionalString(body, 'collection'), req.principal!);
      const results = await retrieval.ingest(docs, collection ? { collection } : undefined);
      sendSuccess(res, { results }, { statusCode: 201 });
    }),
  );

  router.post(
    '/retrieval/search',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const query = requireString(body, 'query');
      const topK = optionalNumber(body, 'topK');
      const collection = resolveCollection(optionalString(body, 'collection'), req.principal!);
      const result = await retrieval.search(query, {
        ...(topK != null ? { topK } : {}),
        ...(collection ? { collection } : {}),
      });
      sendSuccess(res, result);
    }),
  );

  return router;
}

// --- request parsing helpers -------------------------------------------------

function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, `"${field}" is required`);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value;
}

function optionalNumber(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw createError(ErrorCode.INVALID_INPUT, `"${field}" must be a positive number`);
  }
  return Math.trunc(n);
}

/**
 * Parse + validate the `docs` array. SECURITY: this NETWORK edge accepts INLINE
 * `text` ONLY. A caller-supplied filesystem `path` would flow to `readFile(path)`
 * with no containment (arbitrary backend-file exfiltration), so `path` is never
 * carried onto the `IngestDoc` — it is dropped, and a doc with no inline text is
 * rejected here, BEFORE anything can touch the filesystem. Path-based ingest is
 * reserved for trusted internal call sites, not this untrusted surface.
 */
function parseDocs(raw: unknown): readonly IngestDoc[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, '"docs" must be a non-empty array');
  }
  return raw.map((entry, index) => {
    const doc = asObject(entry);
    const text = optionalString(doc, 'text');
    if (!text) {
      throw createError(
        ErrorCode.INVALID_INPUT,
        `docs[${index}] must provide inline "text" (filesystem "path" ingest is not permitted on this endpoint)`,
      );
    }
    const docId = optionalString(doc, 'docId');
    const source = optionalString(doc, 'source');
    const out: IngestDoc = {
      text,
      ...(docId ? { docId } : {}),
      ...(source ? { source } : {}),
      ...(doc.metadata && typeof doc.metadata === 'object'
        ? { metadata: doc.metadata as Record<string, unknown> }
        : {}),
    };
    return out;
  });
}

// --- tenant-bound collection resolution (mirrors mcp/retrieval-engine.ts) -----

/** Max length of one collection name segment before it becomes a physical name. */
const COLLECTION_SEGMENT_MAX = 128;

/**
 * Sanitize a collection segment to the store-safe charset (defence in depth): the
 * requested sub-collection is caller-controlled free text, so strip it to
 * `[A-Za-z0-9_-]` (never a path/selector escape) and cap its length.
 */
function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, COLLECTION_SEGMENT_MAX) || 'default';
}

/** Does the principal carry an elevated scope that may target a RAW collection? */
function isPrivileged(principal: Principal): boolean {
  return principal.scopes.includes('admin') || principal.scopes.includes('internal');
}

/** The principal's OWN tenant namespace (org scope wins over user), mirroring the MCP tool. */
function callerNamespace(principal: Principal): string {
  const org = principal.orgId?.trim();
  return org ? org : principal.userId;
}

/**
 * Resolve the effective collection this request reads/writes, BOUND to the request
 * principal. A non-privileged caller is confined to its OWN tenant namespace: the
 * requested `collection` becomes a sub-namespace UNDER the caller's subject
 * (`rt__<subject>__<requested>`), so it can never name another tenant's index, the
 * shared default, or the tenant-scoped mem0 collection. An `admin`/`internal`
 * caller may target a RAW collection (service-on-behalf). Returns `undefined` only
 * for a privileged caller that named no collection (service falls back to its own
 * default); a non-privileged caller ALWAYS gets a concrete tenant-scoped name.
 *
 * Reuses the MCP retrieval-engine's `rt__<ns>__<sub>` scheme so the HTTP edge and
 * the gated MCP tool agree on tenant namespaces.
 */
function resolveCollection(requested: string | undefined, principal: Principal): string | undefined {
  if (isPrivileged(principal)) return requested?.trim() || undefined;
  const ns = safeSegment(callerNamespace(principal));
  const sub = safeSegment(requested?.trim() || 'default');
  return `rt__${ns}__${sub}`;
}
