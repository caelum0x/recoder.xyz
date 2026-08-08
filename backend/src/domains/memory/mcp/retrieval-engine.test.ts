/**
 * Retrieval MCP tools — tenant COLLECTION binding (cross-tenant read/write defence).
 *
 * The retrieval store seam searches a collection by NAME with NO per-tenant payload
 * filter (`VectorStorePort.search(name, vector, topK)`), so an unbound `collection`
 * arg would let a caller name ANY collection in the shared store — another tenant's
 * RAG index, or the tenant-scoped mem0 memories collection (`recoder_mem0`). These
 * tests prove the effective collection is BOUND to the host-authorized caller:
 *  - a missing caller throws AUTH_REQUIRED (never guesses an identity);
 *  - a non-privileged caller's spoofed `collection` (e.g. `recoder_mem0`, another
 *    tenant's index) is confined UNDER its own subject namespace — the victim
 *    collection name never reaches the store `search`/`ingest` seam;
 *  - an admin/internal caller MAY target a RAW collection (service-on-behalf).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRetrievalMcpTools, type RetrievalMcpModule } from './retrieval-engine.js';
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import type { RetrievalPort, SearchResult, IngestResult } from '../ports/retrieval.port.js';
import { ErrorCode } from '../../../shared/errors.js';

const owner: McpToolCaller = { userId: 'owner_1' };
const attacker: McpToolCaller = { userId: 'attacker_1' };

const searchResult: SearchResult = {
  status: 'ok',
  query: 'q',
  passages: [],
  reranker: 'identity',
};

const ingestResult: IngestResult = {
  status: 'ingested',
  collection: 'x',
  docId: 'd1',
  chunks: 1,
  upserted: 1,
};

const search = vi.fn(async (): Promise<SearchResult> => searchResult);
const ingest = vi.fn(async (): Promise<readonly IngestResult[]> => [ingestResult]);
const configured = vi.fn(() => true);

const retrieval = { search, ingest, configured } as unknown as RetrievalPort;
const module: RetrievalMcpModule = { retrieval: () => retrieval };

function toolMap(tools: readonly McpToolRegistration[]): Map<string, McpToolRegistration> {
  return new Map(tools.map((t) => [t.name, t]));
}
const tools = () => toolMap(buildRetrievalMcpTools(module));

beforeEach(() => vi.clearAllMocks());

describe('retrieval MCP — authenticated caller required', () => {
  it('retrieval_search throws AUTH_REQUIRED when no caller is authorized', async () => {
    await expect(tools().get('retrieval_search')!.handler({ query: 'hi' })).rejects.toMatchObject({
      code: ErrorCode.AUTH_REQUIRED,
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('retrieval_ingest throws AUTH_REQUIRED when no caller is authorized', async () => {
    await expect(
      tools().get('retrieval_ingest')!.handler({ docs: [{ text: 'hi' }] }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
    expect(ingest).not.toHaveBeenCalled();
  });
});

describe('retrieval MCP — args collection spoof is confined under the caller subject', () => {
  it('retrieval_search: a spoofed `recoder_mem0` never reaches the store as the raw name', async () => {
    await tools().get('retrieval_search')!.handler({ query: 'secrets', collection: 'recoder_mem0' }, owner);
    // The tenant-scoped mem0 collection name never reaches the (filter-less) search seam.
    expect(search).toHaveBeenCalledTimes(1);
    const opts = search.mock.calls[0]![1] as { collection?: string };
    expect(opts.collection).toBe('rt__owner_1__recoder_mem0');
    expect(opts.collection).not.toBe('recoder_mem0');
  });

  it('retrieval_search: another tenant\'s index name is bound under the caller, not reached', async () => {
    await tools().get('retrieval_search')!.handler({ query: 'q', collection: 'rt__owner_1__default' }, attacker);
    const opts = search.mock.calls[0]![1] as { collection?: string };
    // The attacker cannot reach owner's `rt__owner_1__default`; it is re-namespaced under attacker.
    expect(opts.collection).toBe('rt__attacker_1__rt__owner_1__default');
    expect(opts.collection).not.toBe('rt__owner_1__default');
  });

  it('retrieval_search: no collection still confines the caller to its own namespace', async () => {
    await tools().get('retrieval_search')!.handler({ query: 'q' }, owner);
    const opts = search.mock.calls[0]![1] as { collection?: string };
    expect(opts.collection).toBe('rt__owner_1__default');
  });

  it('retrieval_ingest: a spoofed collection never writes into the raw shared name', async () => {
    await tools().get('retrieval_ingest')!.handler(
      { docs: [{ text: 'poison' }], collection: 'recoder_retrieval' },
      owner,
    );
    expect(ingest).toHaveBeenCalledTimes(1);
    const opts = ingest.mock.calls[0]![1] as { collection?: string } | undefined;
    expect(opts?.collection).toBe('rt__owner_1__recoder_retrieval');
    expect(opts?.collection).not.toBe('recoder_retrieval');
  });

  it('org scope wins over user in the bound namespace', async () => {
    const orgCaller: McpToolCaller = { userId: 'owner_1', orgId: 'org_9' };
    await tools().get('retrieval_search')!.handler({ query: 'q' }, orgCaller);
    const opts = search.mock.calls[0]![1] as { collection?: string };
    expect(opts.collection).toBe('rt__org_9__default');
  });
});

describe('retrieval MCP — privileged callers may target a RAW collection', () => {
  it('admin/internal caller reaches the raw args-named collection (service-on-behalf)', async () => {
    const ops: McpToolCaller = { userId: 'ops_1', scopes: ['internal'] };
    await tools().get('retrieval_search')!.handler({ query: 'q', collection: 'recoder_mem0' }, ops);
    const opts = search.mock.calls[0]![1] as { collection?: string };
    expect(opts.collection).toBe('recoder_mem0');
  });

  it('admin/internal caller with no collection falls back to the service default', async () => {
    const ops: McpToolCaller = { userId: 'ops_1', scopes: ['admin'] };
    await tools().get('retrieval_search')!.handler({ query: 'q' }, ops);
    const opts = search.mock.calls[0]![1] as { collection?: string };
    // No collection passed → the service uses its own default (`recoder_retrieval`).
    expect(opts.collection).toBeUndefined();
  });
});

describe('retrieval_ingest — file-path docs require a privileged caller (recoder-wf0c)', () => {
  it('rejects a non-privileged caller ingesting a file `path` (no arbitrary server read) and never ingests', async () => {
    ingest.mockClear();
    await expect(
      tools().get('retrieval_ingest')!.handler({ docs: [{ path: '/etc/passwd' }] }, { userId: 'owner_1' }),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('allows a non-privileged caller ingesting inline text', async () => {
    ingest.mockClear();
    await tools().get('retrieval_ingest')!.handler({ docs: [{ text: 'hello' }] }, { userId: 'owner_1' });
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it('allows a privileged (internal) caller to ingest a file path (service-on-behalf)', async () => {
    ingest.mockClear();
    await tools().get('retrieval_ingest')!.handler({ docs: [{ path: '/srv/data/notes.md' }] }, { userId: 'ops_1', scopes: ['internal'] });
    expect(ingest).toHaveBeenCalledTimes(1);
  });
});
