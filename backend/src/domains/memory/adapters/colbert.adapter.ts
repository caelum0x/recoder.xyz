/**
 * colbert.adapter — the ColBERT late-interaction `RerankerPort` for recall
 * fusion + retrieval. It supersedes the env-reading legacy path
 * (`backend/src/conductor/colbert-rerank.ts`) with a config-driven transport:
 * the URL comes from `MemoryConfig.colbertRerankUrl` (NO `process.env` here),
 * and the actual HTTP call runs through the injectable `ColbertSidecarClient`.
 *
 * DEGRADE CONTRACT: no `colbertRerankUrl` → an identity reranker (`kind:
 * 'identity'`, original order). On any request/parse failure the sidecar client
 * returns identity order, so this port never throws and never fabricates a rank.
 *
 * The domain also exposes `rerankPassages` for plain-string passage lists (the
 * shape recall fusion's `rank.ts` uses), returning the full `RerankResult`.
 */
import { createIdentityReranker, type RerankCandidate, type RerankerPort } from '@recoder/retrieval';
import type { RerankResult } from '../ports/reranker.port.js';
import type { MemoryConfig } from '../config.js';
import { createColbertSidecarClient, type ColbertFetch, type ColbertSidecarClient } from './colbert-sidecar.client.js';

export interface ColbertAdapter {
  /** The `RerankerPort` the retrieval engine consumes (candidate objects). */
  readonly reranker: RerankerPort;
  /** Rerank a plain passage list; returns order + availability (fusion path). */
  rerankPassages(query: string, passages: readonly string[]): Promise<RerankResult>;
}

/**
 * Build the colbert adapter. When `config.colbertRerankUrl` is unset the reranker
 * is identity order and `rerankPassages` reports `available:false`; otherwise both
 * route through the sidecar client (degrade-safe on any failure).
 */
export function createColbertAdapter(
  config: MemoryConfig,
  fetchImpl?: ColbertFetch,
): ColbertAdapter {
  const url = config.colbertRerankUrl;

  if (!url) {
    const identity = createIdentityReranker();
    return {
      reranker: identity,
      async rerankPassages(_query, passages): Promise<RerankResult> {
        return {
          available: false,
          passages: [...passages],
          order: passages.map((_, i) => i),
          reason: 'COLBERT_RERANK_URL not set',
        };
      },
    };
  }

  const client: ColbertSidecarClient = createColbertSidecarClient(url, fetchImpl);

  const reranker: RerankerPort = {
    kind: 'colbert',
    async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankCandidate[]> {
      if (candidates.length === 0) return [];
      const result = await client.rerank(query, candidates.map((c) => c.text));
      // Reorder by ColBERT order AND carry the REAL MaxSim score onto each
      // candidate so retrieval passages reflect late-interaction relevance (not
      // just vector similarity). On degrade the client returns identity order with
      // NO scores — candidates keep their original vector score (never fabricated).
      return result.order.map((originalIndex, rank) => {
        const base = candidates[originalIndex];
        const maxSim = result.scores?.[rank];
        return typeof maxSim === 'number' ? { ...base, score: maxSim } : base;
      });
    },
  };

  return {
    reranker,
    rerankPassages(query, passages): Promise<RerankResult> {
      return client.rerank(query, passages);
    },
  };
}
