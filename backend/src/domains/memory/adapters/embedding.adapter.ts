/**
 * embedding.adapter — adapts the shared embedding foundation
 * (`backend/src/agent-os/mcp/vector-store.ts::createEmbeddingPort`,
 * BYOK / tensorzero / openai) to the domain `EmbeddingPort`. The provider is
 * resolved from the injected `MemoryConfig` (NO `process.env` here) and folded
 * into the foundation's `VectorEnv`; `fetch` is injectable for tests.
 *
 * DEGRADE CONTRACT: no provider configured → `embed → null` (callers fall back
 * to keyword search). Nothing throws or fabricates vectors.
 */
import { createEmbeddingPort, type FetchLike, type VectorEnv } from '../../../agent-os/mcp/vector-store.js';
import type { EmbeddingPort } from '../ports/embedding.port.js';
import type { MemoryConfig } from '../config.js';

/** Build the `VectorEnv` the foundation consumes from the memory config slice. */
export function embeddingEnvFromConfig(config: MemoryConfig): VectorEnv {
  const env: VectorEnv = {};
  if (config.embedTensorzeroUrl) env.TENSORZERO_URL = config.embedTensorzeroUrl;
  if (config.embedTensorzeroApiKey) env.TENSORZERO_API_KEY = config.embedTensorzeroApiKey;
  if (config.embedOpenaiApiKey) env.OPENAI_API_KEY = config.embedOpenaiApiKey;
  if (config.embedOpenaiBaseUrl) env.OPENAI_BASE_URL = config.embedOpenaiBaseUrl;
  if (config.embedEndpoint) env.EMBED_ENDPOINT = config.embedEndpoint;
  env.EMBED_MODEL = config.embedModel;
  if (config.qdrantUrl) env.QDRANT_URL = config.qdrantUrl;
  if (config.qdrantApiKey) env.QDRANT_API_KEY = config.qdrantApiKey;
  return env;
}

/**
 * Build the embedding adapter. `fetchImpl` defaults to the global `fetch`; when
 * neither a tensorzero nor an openai key is present the returned port's
 * `provider` is `'none'` and `embed` returns `null` (truthful degrade).
 */
export function createEmbeddingAdapter(
  config: MemoryConfig,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): EmbeddingPort {
  return createEmbeddingPort({ fetch: fetchImpl, env: embeddingEnvFromConfig(config) });
}
