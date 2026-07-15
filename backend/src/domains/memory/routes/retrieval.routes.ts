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
 */
import { Router } from 'express';
import { ErrorCode, createError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
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
      const collection = optionalString(body, 'collection');
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
      const collection = optionalString(body, 'collection');
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

/** Parse + validate the `docs` array (each doc needs text OR path). */
function parseDocs(raw: unknown): readonly IngestDoc[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, '"docs" must be a non-empty array');
  }
  return raw.map((entry, index) => {
    const doc = asObject(entry);
    const text = optionalString(doc, 'text');
    const path = optionalString(doc, 'path');
    if (!text && !path) {
      throw createError(ErrorCode.INVALID_INPUT, `docs[${index}] must have "text" or "path"`);
    }
    const out: IngestDoc = {
      ...(text ? { text } : {}),
      ...(path ? { path } : {}),
      ...(optionalString(doc, 'docId') ? { docId: optionalString(doc, 'docId')! } : {}),
      ...(optionalString(doc, 'source') ? { source: optionalString(doc, 'source')! } : {}),
      ...(doc.metadata && typeof doc.metadata === 'object'
        ? { metadata: doc.metadata as Record<string, unknown> }
        : {}),
    };
    return out;
  });
}
