/**
 * Memory composition-root seams — the small, PURE pieces of the bootstrap →
 * memory wiring, extracted so they are unit-testable without a full boot
 * (mirrors {@link ./billing-seams.ts} / {@link ./interop-wire-seams.ts}):
 *
 *   - {@link createMemoryEmbedFallback} — the memory domain's fallback
 *     {@link EmbeddingPort} over the inference delivery ladder (napi embedded
 *     gateway → loopback). Memory takes NO cross-domain import; the seam is
 *     injected here. Truthful: an unrouted/failed call yields `null` so memory
 *     degrades to keyword search (never a fabricated vector).
 *   - {@link createSquadIssueAdapter} — the agent-os squad-issue READ seam over the
 *     MEMORY-owned issue-graph facet, built at THIS composition root so agent-os
 *     never imports the memory domain. The facet's degrade law carries through
 *     unchanged (reads `[]`/`null`, truthful `health()`, nothing throws).
 *
 * Neither reads `process.env` or owns state.
 */
import type { EmbeddingPort } from '@recoder/retrieval';
import type { SquadIssuePort } from '../domains/agent-os/index.js';
import type { IssueGraphService } from '../domains/memory/ports/issue-graph.port.js';

/** The narrow inference-gateway embed surface the fallback consumes. */
export interface EmbedFallbackGateway {
  embed(req: { readonly model: string; readonly input: string[] }): Promise<{
    readonly routed: boolean;
    readonly embeddings: number[][] | null;
  }>;
}

/**
 * Build the memory fallback {@link EmbeddingPort} over the inference gateway. An
 * unrouted result (or any fault) yields `null` so memory degrades to keyword
 * search truthfully.
 */
export function createMemoryEmbedFallback(gateway: EmbedFallbackGateway): EmbeddingPort {
  return {
    provider: 'inference',
    async embed(texts: string[]): Promise<number[][] | null> {
      try {
        const result = await gateway.embed({ model: 'text-embedding-3-small', input: texts });
        return result.routed ? result.embeddings : null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Build the agent-os squad-issue read seam over the MEMORY-owned issue-graph
 * module facet — so agent-os never imports the memory domain. Pure delegation;
 * the facet's degrade law (reads `[]`/`null`, truthful `health()`) is unchanged.
 */
export function createSquadIssueAdapter(graph: IssueGraphService): SquadIssuePort {
  return {
    health: () => graph.health(),
    ready: () => graph.ready(),
    show: (id, opts) => graph.show(id, opts),
    stale: () => graph.stale(),
  };
}
