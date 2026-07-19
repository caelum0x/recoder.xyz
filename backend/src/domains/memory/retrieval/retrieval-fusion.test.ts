/**
 * retrieval-fusion tests — prove ColBERT is promoted from rerank-only to a
 * FIRST-STAGE candidate generator: a late-interaction hit that Qdrant's
 * single-vector top-K MISSED enters the union and can be reranked into results.
 */
import { describe, it, expect } from 'vitest';
import { createIdentityReranker, type RerankCandidate, type RerankerPort } from '@recoder/retrieval';
import type { RetrievalPassage } from '../ports/retrieval.port.js';
import type { ColbertSearchHit } from '../ports/colbert-search.port.js';
import { fuseRetrievalCandidates } from './retrieval-fusion.js';

const qdrant: RetrievalPassage[] = [
  { id: 'q1', text: 'qdrant passage about deploys', score: 0.9, source: 'qdrant' },
  { id: 'q2', text: 'qdrant passage about nginx', score: 0.7, source: 'qdrant' },
];

/** A reranker that orders candidates by score DESC (proves rerank drives order). */
function scoreReranker(): RerankerPort {
  return {
    kind: 'colbert',
    async rerank(_q, candidates: RerankCandidate[]) {
      return [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    },
  };
}

describe('fuseRetrievalCandidates (ColBERT as a first-stage retriever)', () => {
  it('includes a ColBERT hit that Qdrant missed in the union', async () => {
    const colbertHits: ColbertSearchHit[] = [
      { text: 'colbert-only passage about vault secrets', score: 25.0, pid: 5 },
    ];
    const result = await fuseRetrievalCandidates({
      query: 'vault secrets',
      topK: 8,
      qdrantPassages: qdrant,
      colbertHits,
      reranker: createIdentityReranker(),
    });

    expect(result.colbertContributed).toBe(1);
    const texts = result.passages.map((p) => p.text);
    expect(texts).toContain('colbert-only passage about vault secrets');
    // The contributed passage is tagged with the colbert source.
    const colbertPassage = result.passages.find((p) => p.text.startsWith('colbert-only'));
    expect(colbertPassage?.source).toBe('colbert');
  });

  it('a high-MaxSim ColBERT-only hit wins a top slot Qdrant would have dropped', async () => {
    // topK=2 with 2 qdrant + 1 colbert; the colbert hit outscores a qdrant hit and
    // must displace it after the union rerank.
    const colbertHits: ColbertSearchHit[] = [
      { text: 'the ci runner is buildkite', score: 40.0, pid: 9 },
    ];
    const result = await fuseRetrievalCandidates({
      query: 'ci runner',
      topK: 2,
      qdrantPassages: [
        { id: 'q1', text: 'qdrant deploys', score: 30.0, source: 'qdrant' },
        { id: 'q2', text: 'qdrant nginx', score: 10.0, source: 'qdrant' },
      ],
      colbertHits,
      reranker: scoreReranker(),
    });

    expect(result.passages).toHaveLength(2);
    // Best-first: colbert hit (40) then the top qdrant hit (30); the weakest
    // qdrant hit (10) is dropped — a slot ColBERT won.
    expect(result.passages[0]?.text).toBe('the ci runner is buildkite');
    expect(result.passages[1]?.text).toBe('qdrant deploys');
    expect(result.passages.map((p) => p.text)).not.toContain('qdrant nginx');
  });

  it('dedupes a ColBERT hit that duplicates a Qdrant passage (no double count)', async () => {
    const colbertHits: ColbertSearchHit[] = [
      { text: 'Qdrant Passage About Deploys', score: 50.0, pid: 1 }, // same text, different case/space
    ];
    const result = await fuseRetrievalCandidates({
      query: 'deploys',
      topK: 8,
      qdrantPassages: qdrant,
      colbertHits,
      reranker: createIdentityReranker(),
    });

    expect(result.colbertContributed).toBe(0);
    // Only the two original qdrant passages survive (the dup collapsed).
    expect(result.passages).toHaveLength(2);
  });

  it('no ColBERT hits → the Qdrant order passes through unchanged (identity fusion)', async () => {
    const result = await fuseRetrievalCandidates({
      query: 'deploys',
      topK: 8,
      qdrantPassages: qdrant,
      colbertHits: [],
      reranker: createIdentityReranker(),
    });
    expect(result.colbertContributed).toBe(0);
    expect(result.passages.map((p) => p.id)).toEqual(['q1', 'q2']);
  });
});
