/**
 * `EmbeddingPort` — the text→vector seam, re-exported from `@recoder/retrieval`
 * so the retrieval engine, vector foundation, and the mem0/qdrant adapters all
 * bind to ONE structural contract.
 *
 * DEGRADE CONTRACT: `embed` returns `null` when no provider is configured or on
 * any failure (the caller then falls back to keyword search); `[]` for empty
 * input. Nothing here throws or fabricates vectors.
 */
export type { EmbeddingPort } from '@recoder/retrieval';
