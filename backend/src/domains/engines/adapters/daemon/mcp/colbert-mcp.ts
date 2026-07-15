/**
 * `colbert` in-proc MCP server — the agent-callable skin over the ColBERT
 * late-interaction adapter. Two tools:
 *   - `colbert.rerank` — reorder candidate passages by late-interaction score.
 *   - `colbert.search` — search a prebuilt ColBERT index (degrades truthfully
 *     when the supervised process is the rerank-only server).
 *
 * Both are READ-ONLY scorers (no state mutation) — always safe. The composer
 * seeds `colbertMcpServer` into the gated registry and binds these handlers.
 */
import type { McpToolRegistration } from '../../../../../shared/module-base.js';
import type { ColbertRequest } from '../colbert-loopback.adapter.js';
import { asRecord, readInt, readString, runOp, type Invoker } from './daemon-mcp-shared.js';

export const COLBERT_MCP_SERVER_ID = 'colbert';

export const colbertMcpServer = {
  serverId: COLBERT_MCP_SERVER_ID,
  kind: 'engines',
  displayName: 'ColBERT (late-interaction rerank + index search)',
  transport: 'in-proc' as const,
  enabled: true,
  toolNames: ['colbert.rerank', 'colbert.search'] as readonly string[],
  metadata: { external: false, engine: 'colbert' },
};

export function buildColbertMcpTools(engine: Invoker<ColbertRequest>): readonly McpToolRegistration[] {
  return [
    {
      name: 'colbert.rerank',
      description:
        'Reorder candidate passages by ColBERT late-interaction (MaxSim) score for a query. ' +
        'Returns passages best-first with the original-index permutation; degrades to the ' +
        'original order when the rerank engine is unavailable.',
      handler: async (raw: unknown) => {
        const args = asRecord(raw);
        const query = readString(args.query);
        const passages = Array.isArray(args.passages)
          ? args.passages.filter((p): p is string => typeof p === 'string')
          : [];
        if (!query) return { error: 'query (string) is required' };
        return runOp<ColbertRequest>(engine, 'rerank', { query, passages });
      },
    },
    {
      name: 'colbert.search',
      description:
        'Search a prebuilt ColBERT index for the top-k passages matching a query ' +
        '(late-interaction search). Truthfully unavailable when the supervised process ' +
        'only serves rerank.',
      handler: async (raw: unknown) => {
        const args = asRecord(raw);
        const query = readString(args.query);
        if (!query) return { error: 'query (string) is required' };
        const k = readInt(args.k);
        return runOp<ColbertRequest>(engine, 'search', k !== undefined ? { query, k } : { query });
      },
    },
  ];
}
