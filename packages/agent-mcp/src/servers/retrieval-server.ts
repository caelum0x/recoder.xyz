import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

/**
 * `recoder.retrieval` — the MCP skin over the Retrieval/RAG engine (E2). Two
 * tools: `retrieval.ingest` (chunk → embed → store a document) and
 * `retrieval.search` (embed the query → vector search → ColBERT rerank → passages).
 *
 * The package stays runtime-agnostic: it owns NO engine logic and assumes no
 * backing service. The host (docker-backend) injects a concrete `RetrievalPort`
 * built over the shared vector foundation (`vector-store.ts`) + `@recoder/retrieval`.
 * Every handler degrades truthfully — the engine returns a `not_configured` status
 * (never throws, never fabricates) when no embedder/vector store is present.
 */
export const retrievalMcpServer: McpServerRegistration = {
  serverId: 'recoder.retrieval',
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: 'custom',
  displayName: 'Recoder Retrieval',
  transport: 'http',
  enabled: true,
  toolNames: ['retrieval.ingest', 'retrieval.search'],
  metadata: { engine: 'retrieval' },
};

/**
 * The host-injected retrieval engine. Structurally satisfied by
 * `@recoder/retrieval`'s `RetrievalEngine`; typed loosely (`unknown` results) so
 * this package needs no dependency on the engine implementation.
 */
export type RetrievalPort = {
  ingest(input: {
    text?: string;
    path?: string;
    docId?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
  search(query: string, topK?: number): Promise<unknown>;
};

export function registerRetrievalMcpTools(router: McpToolRouter, port: RetrievalPort): void {
  router.register(retrievalMcpServer, 'retrieval.ingest', async (input) => {
    const text = readString(input.args.text);
    const path = readString(input.args.path);
    if (!text && !path) {
      throw new Error('retrieval.ingest requires `text` or `path`');
    }
    const result = await port.ingest({
      text,
      path,
      docId: readString(input.args.docId),
      source: readString(input.args.source),
      metadata: readRecord(input.args.metadata),
    });
    return { content: result, metadata: { engine: 'retrieval' } };
  });

  router.register(retrievalMcpServer, 'retrieval.search', async (input) => {
    const query = readRequiredString(input.args.query, 'query');
    const topK = readNumber(input.args.topK);
    const result = await port.search(query, topK);
    return { content: result, metadata: { engine: 'retrieval' } };
  });
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
