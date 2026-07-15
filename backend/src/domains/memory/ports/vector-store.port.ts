/**
 * `VectorStorePort` — the Qdrant-REST vector seam, re-exported from
 * `@recoder/retrieval`. The concrete store lives in the shared vector foundation
 * (`adapters/qdrant.adapter.ts` wrapping `agent-os/mcp/vector-store.ts`).
 *
 * DEGRADE CONTRACT: when the store is not configured (`configured === false`)
 * every method is a truthful no-op — `ensureCollection`/`upsert` → `false`,
 * `search` → `[]`. Nothing throws.
 */
export type {
  VectorStorePort,
  VectorPoint,
  VectorMatch,
  VectorDistance,
} from '@recoder/retrieval';
