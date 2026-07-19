/**
 * `colbert-index` in-proc MCP server — the agent-callable skin over the ColBERT
 * adapter's index-management + batch surfaces. Five tools:
 *   - `colbert.rerank_batch`      — rerank many `{query, passages}` items at once.
 *   - `colbert.collections.list`  — list built ColBERT indexes (filesystem only).
 *   - `colbert.collections.stats` — index stats for one collection.
 *   - `colbert.collections.create`— BUILD a named index from passages (real indexer).
 *   - `colbert.collections.drop`  — drop a built index (remove its directory).
 *
 * IDENTITY POSTURE (keep the cross-tenant class closed): `create` and `drop`
 * MUTATE the shared on-host index store, so their handlers REFUSE to run for an
 * anonymous caller — the host threads the authorized {@link McpToolCaller}
 * (`callerFromInput`) as the second handler argument and we require a `userId`
 * before mutating, so every build/drop is attributable to an authorized
 * principal rather than to free-form model output. The read tools
 * (`rerank_batch` / `list` / `stats`) carry no subject and do not gate on it.
 *
 * Every call still traverses interop's `authorize → risk → execute → audit` gate
 * at the host boundary; these handlers stay thin (validate, invoke, surface the
 * truthful `InvokeResult`). The adapter degrades safely when torch/venv is
 * absent (503 → truthful error), never faking a result.
 */
import type { McpToolRegistration, McpToolCaller } from '../../../../../shared/module-base.js';
import type { ColbertRequest } from '../colbert-loopback.adapter.js';
import { asRecord, readBool, readString, runOp, type Invoker } from './daemon-mcp-shared.js';

export const COLBERT_INDEX_MCP_SERVER_ID = 'colbert-index';

export const colbertIndexMcpServer = {
  serverId: COLBERT_INDEX_MCP_SERVER_ID,
  kind: 'engines',
  displayName: 'ColBERT index management + batch rerank',
  transport: 'in-proc' as const,
  enabled: true,
  toolNames: [
    'colbert.rerank_batch',
    'colbert.collections.list',
    'colbert.collections.stats',
    'colbert.collections.create',
    'colbert.collections.drop',
  ] as readonly string[],
  metadata: { external: false, engine: 'colbert' },
};

/** Parse `args.batch` into a clean `[{query, passages[]}]`, dropping bad shapes. */
function readBatch(value: unknown): { query: string; passages: string[] }[] {
  if (!Array.isArray(value)) return [];
  const items: { query: string; passages: string[] }[] = [];
  for (const raw of value) {
    const item = asRecord(raw);
    const query = readString(item.query);
    if (!query) continue;
    const passages = Array.isArray(item.passages)
      ? item.passages.filter((p): p is string => typeof p === 'string')
      : [];
    items.push({ query, passages });
  }
  return items;
}

export function buildColbertIndexMcpTools(
  engine: Invoker<ColbertRequest>,
): readonly McpToolRegistration[] {
  return [
    {
      name: 'colbert.rerank_batch',
      description:
        'Rerank several {query, passages} items in a single call by ColBERT late-interaction ' +
        '(MaxSim) score. Returns one best-first result per input item (in input order); each ' +
        'item degrades to its original order when the rerank engine is unavailable.',
      handler: async (raw: unknown) => {
        const args = asRecord(raw);
        const batch = readBatch(args.batch);
        if (batch.length === 0) {
          return { error: 'batch (array of {query, passages}) is required and must be non-empty' };
        }
        return runOp<ColbertRequest>(engine, 'rerank.batch', { batch });
      },
    },
    {
      name: 'colbert.collections.list',
      description:
        'List the built ColBERT indexes under the index root (name, documents, embeddings, ' +
        'partitions, on-disk bytes). Filesystem-only — works even when rerank is degraded; ' +
        'truthfully empty with a reason when the index root does not exist.',
      handler: async () => runOp<ColbertRequest>(engine, 'collections.list', {}),
    },
    {
      name: 'colbert.collections.stats',
      description:
        'Return index stats (documents, embeddings, partitions, chunks, on-disk bytes) for one ' +
        'built ColBERT collection by name. Truthfully unavailable when the collection is absent.',
      handler: async (raw: unknown) => {
        const args = asRecord(raw);
        const name = readString(args.name);
        if (!name) return { error: 'name (string) is required' };
        return runOp<ColbertRequest>(engine, 'collections.stats', { name });
      },
    },
    {
      name: 'colbert.collections.create',
      description:
        'Build a named ColBERT index from the supplied passages (real late-interaction indexer). ' +
        'Requires the sidecar to have torch + colbert; truthfully unavailable otherwise. Refuses ' +
        'to overwrite an existing collection unless overwrite=true. Requires an authorized caller.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const identity = requireCaller(caller);
        if ('error' in identity) return identity;
        const args = asRecord(raw);
        const name = readString(args.name);
        if (!name) return { error: 'name (string) is required' };
        const passages = Array.isArray(args.passages)
          ? args.passages.filter((p): p is string => typeof p === 'string')
          : [];
        if (passages.length === 0) return { error: 'passages (non-empty string array) is required' };
        const overwrite = readBool(args.overwrite) ?? false;
        return runOp<ColbertRequest>(engine, 'collections.create', { name, passages, overwrite });
      },
    },
    {
      name: 'colbert.collections.drop',
      description:
        'Drop a built ColBERT index by name (removes its directory). Requires an authorized ' +
        'caller. Truthfully reports when the collection does not exist.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const identity = requireCaller(caller);
        if ('error' in identity) return identity;
        const args = asRecord(raw);
        const name = readString(args.name);
        if (!name) return { error: 'name (string) is required' };
        return runOp<ColbertRequest>(engine, 'collections.drop', { name });
      },
    },
  ];
}

/**
 * Gate a MUTATING collection op on an authorized caller identity. The host binds
 * `callerFromInput(input)` as the second handler argument; an absent `userId`
 * means the call could not be attributed to an authenticated principal, so we
 * refuse rather than mutate the shared index store anonymously.
 */
function requireCaller(caller?: McpToolCaller): { error: string } | { ok: true } {
  const userId = typeof caller?.userId === 'string' ? caller.userId.trim() : '';
  if (!userId) {
    return { error: 'an authorized caller identity is required to mutate ColBERT collections' };
  }
  return { ok: true };
}
