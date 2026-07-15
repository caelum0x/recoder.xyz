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
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
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
        'Semantic document retrieval (embed → vector search → ColBERT rerank). Returns ranked passages, or status "not_configured" when no embedder/vector store is wired.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as SearchInput;
        const query = input.query?.trim();
        if (!query) throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'query is required');
        const result = await module.retrieval().search(query, {
          ...(typeof input.topK === 'number' && input.topK > 0 ? { topK: Math.trunc(input.topK) } : {}),
          ...(input.collection ? { collection: input.collection } : {}),
        });
        return result;
      },
    },
    {
      name: 'retrieval_ingest',
      description:
        'Ingest documents into the retrieval index (chunk → embed → upsert). Returns per-doc results, or status "not_configured" when retrieval is off.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as IngestInput;
        const docs = parseDocs(input.docs);
        const results = await module.retrieval().ingest(docs, input.collection ? { collection: input.collection } : undefined);
        return { results };
      },
    },
  ];
}
