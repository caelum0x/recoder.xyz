/**
 * BrainPort — the prompt-enrichment seam.
 *
 * REUSE: re-exports the `@recoder/substrate` port verbatim. The conductor
 * `prompt-enrichment` service (beads recall + colbert rerank -> enriched prompt +
 * provenance) implements it; if no brain is wired the engine uses the raw prompt
 * unchanged. Truthful provenance is always returned so every enrichment is
 * auditable.
 */
export type {
  BrainPort,
  BrainEnrichInput,
  BrainEnrichResult,
  BrainProvenanceRef,
} from '@recoder/substrate';
