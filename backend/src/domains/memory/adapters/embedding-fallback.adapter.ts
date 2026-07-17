/**
 * embedding-fallback.adapter — compose the config-resolved HTTP embedder
 * (tensorzero/openai, `embedding.adapter.ts`) with an OPTIONAL bootstrap-injected
 * fallback `EmbeddingPort` (the inference domain's embed seam, e.g. the napi
 * embedded gateway). NO cross-domain import: the fallback arrives already shaped
 * as the domain `EmbeddingPort` via `MemoryModuleDeps.embedFallback`.
 *
 * Resolution order per call:
 *   1. primary (when its provider is configured) — a `null` result degrades on,
 *   2. fallback (when present and configured),
 *   3. `null` — the truthful degrade the callers already handle.
 *
 * DEGRADE CONTRACT: `embed` never throws; `[]` for empty input; `null` when no
 * rung can serve. `provider` truthfully reflects the first configured rung.
 */
import type { EmbeddingPort } from '../ports/embedding.port.js';

function providerOf(port: EmbeddingPort | null | undefined): string {
  if (!port) return 'none';
  return port.provider ?? 'none';
}

function isConfigured(port: EmbeddingPort | null | undefined): port is EmbeddingPort {
  return Boolean(port) && providerOf(port) !== 'none';
}

/**
 * Layer `fallback` under `primary`. Returns `primary` unchanged when there is no
 * usable fallback (no extra wrapper on the hot path).
 */
export function withEmbeddingFallback(
  primary: EmbeddingPort,
  fallback: EmbeddingPort | null | undefined,
): EmbeddingPort {
  if (!isConfigured(fallback)) return primary;

  const provider = isConfigured(primary) ? providerOf(primary) : providerOf(fallback);

  return {
    provider,
    async embed(texts: string[]): Promise<number[][] | null> {
      if (!Array.isArray(texts) || texts.length === 0) return [];
      if (isConfigured(primary)) {
        try {
          const vectors = await primary.embed(texts);
          if (vectors !== null) return vectors;
        } catch {
          // Contract says ports return null instead of throwing — belt and braces.
        }
      }
      try {
        return await fallback.embed(texts);
      } catch {
        return null;
      }
    },
  };
}
