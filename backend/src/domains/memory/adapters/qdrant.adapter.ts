/**
 * qdrant.adapter — adapts the shared Qdrant-REST vector store
 * (`backend/src/agent-os/mcp/vector-store.ts::createVectorStore`) to the domain
 * `VectorStorePort`. The URL + optional api-key come from the injected
 * `MemoryConfig` (NO `process.env` here); `fetch` is injectable for tests.
 *
 * DEGRADE CONTRACT: no `QDRANT_URL` → `configured === false` and every method is
 * a truthful no-op (`ensureCollection`/`upsert` → false, `search` → []).
 */
import { createVectorStore, type FetchLike, type VectorEnv } from '../../../agent-os/mcp/vector-store.js';
import type { VectorStorePort } from '../ports/vector-store.port.js';
import type { MemoryConfig } from '../config.js';

/** Build the vector-store slice of `VectorEnv` from the memory config. */
export function vectorEnvFromConfig(config: MemoryConfig): VectorEnv {
  const env: VectorEnv = {};
  if (config.qdrantUrl) env.QDRANT_URL = config.qdrantUrl;
  if (config.qdrantApiKey) env.QDRANT_API_KEY = config.qdrantApiKey;
  return env;
}

/**
 * Build the Qdrant adapter. `fetchImpl` defaults to the global `fetch`; an unset
 * `QDRANT_URL` yields a truthful no-op store (`configured === false`).
 */
export function createQdrantAdapter(
  config: MemoryConfig,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): VectorStorePort {
  return createVectorStore({ fetch: fetchImpl, env: vectorEnvFromConfig(config) });
}
