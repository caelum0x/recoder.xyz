/**
 * `MemoryConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: NO `process.env` in domain code).
 *
 * The foundational `AppConfig` does not yet carry a `memory` slice, so this
 * accessor derives what it can (`isProduction`, the internal-service key) and
 * applies degrade-safe defaults for the rest. The scattered env reads
 * (`QDRANT_URL`, `QDRANT_API_KEY`, `COLBERT_RERANK_URL`, `MEM0_BASE_URL`,
 * `TENSORZERO_URL`, `OPENAI_API_KEY`, `EMBED_*`, collection names, TTLs) are
 * folded into `MemoryConfigOverrides` by `bootstrap/config.ts` so NO memory
 * domain code reads the environment.
 *
 * SECURITY: api-key values travel in-memory only (`*ApiKey`), NEVER into health
 * output or a response body; the `*ApiKeyPresent` booleans are the surfaced
 * gates. Fail-safe until wired: no QDRANT_URL / no embedder / no colbert / no
 * mem0 → the corresponding source reports `down` and recall drops it. Nothing is
 * faked.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

/** Default Qdrant collection mem0 writes its distilled memories into. */
export const DEFAULT_MEM0_COLLECTION = 'recoder_mem0';
/** Default Qdrant collection the retrieval/RAG engine ingests into. */
export const DEFAULT_RETRIEVAL_COLLECTION = 'recoder_retrieval';
/** Default embedding model when a provider is wired but no model is set. */
export const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';

const nullableUrl = z.string().url().nullable();

export const memoryConfigSchema = z.object({
  isProduction: z.boolean(),

  /** `INTERNAL_SERVICE_KEY` presence (gates `/internal/agent-os/memory/harvest`). */
  internalServiceKeyPresent: z.boolean(),
  internalServiceKey: z.string().nullable(),

  // — Vector store (Qdrant) —
  /** Qdrant REST base URL; `null` → vector store is a truthful no-op. */
  qdrantUrl: nullableUrl,
  qdrantApiKeyPresent: z.boolean(),
  /** In-memory only; never logged, never surfaced. */
  qdrantApiKey: z.string().nullable(),

  // — Embedded vector store (Lance napi) — the no-server default when Qdrant is absent —
  /** Local Lance data dir (`LANCE_DATA_DIR`); `null` → embedded store is a truthful no-op. */
  lanceDataDir: z.string().nullable().default(null),
  /** Dir holding `lance_npm_bindings.node` (`LANCE_NATIVE_DIR` / `RECODER_NATIVE_DIR`). */
  lanceNativeDir: z.string().nullable().default(null),

  // — Collections —
  mem0Collection: z.string().min(1),
  retrievalCollection: z.string().min(1),

  // — Rerank (ColBERT) —
  /** `COLBERT_RERANK_URL`; `null` → identity order (original ranking). */
  colbertRerankUrl: nullableUrl,

  // — mem0 self-hosted sidecar —
  /** `MEM0_BASE_URL` pointing the platform client at `engines/py/mem0`. */
  mem0SidecarUrl: nullableUrl,

  // — Embeddings (BYOK / gateway) — provider resolution mirrors vector-store.ts —
  /** `TENSORZERO_URL` (preferred embeddings provider); `null` → try OpenAI. */
  embedTensorzeroUrl: nullableUrl,
  embedTensorzeroApiKeyPresent: z.boolean(),
  embedTensorzeroApiKey: z.string().nullable(),
  /** `OPENAI_API_KEY` (fallback embeddings provider). In-memory only. */
  embedOpenaiApiKeyPresent: z.boolean(),
  embedOpenaiApiKey: z.string().nullable(),
  embedOpenaiBaseUrl: nullableUrl,
  /** Fully-qualified embeddings endpoint override (wins over provider defaults). */
  embedEndpoint: nullableUrl,
  embedModel: z.string().min(1),

  // — Governance write allowlist —
  /**
   * The scopes an actor may WRITE memory into (candidate propose / harvest).
   * EMPTY → every scope is allowed (degrade-safe default that preserves the
   * open behavior); a NON-EMPTY list denies any write to a scope not present.
   */
  writeScopeAllowlist: z.array(z.string()).default([]),

  // — Fusion knobs —
  /** Near-duplicate collapse threshold (cosine/jaccard), `[0,1]`. */
  dedupeThreshold: z.number().min(0).max(1),
  /** Default recall fan-in limit per source before fusion. */
  recallLimit: z.number().int().positive(),
  /** TTL (days) applied to ephemeral candidate wisps. */
  candidateTtlDays: z.number().int().positive(),
});

export type MemoryConfig = z.infer<typeof memoryConfigSchema>;

/** The not-yet-in-AppConfig memory values bootstrap injects (all env reads there). */
export interface MemoryConfigOverrides {
  readonly qdrantUrl?: string | null;
  readonly qdrantApiKey?: string | null;
  readonly lanceDataDir?: string | null;
  readonly lanceNativeDir?: string | null;
  readonly mem0Collection?: string;
  readonly retrievalCollection?: string;
  readonly colbertRerankUrl?: string | null;
  readonly mem0SidecarUrl?: string | null;
  readonly embedTensorzeroUrl?: string | null;
  readonly embedTensorzeroApiKey?: string | null;
  readonly embedOpenaiApiKey?: string | null;
  readonly embedOpenaiBaseUrl?: string | null;
  readonly embedEndpoint?: string | null;
  readonly embedModel?: string;
  readonly writeScopeAllowlist?: readonly string[];
  readonly dedupeThreshold?: number;
  readonly recallLimit?: number;
  readonly candidateTtlDays?: number;
}

/** Normalize an allowlist override: trim, drop blanks, de-duplicate. */
function normStringList(list: readonly string[] | undefined): string[] {
  if (!list) return [];
  const seen = new Set<string>();
  for (const raw of list) {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (t) seen.add(t);
  }
  return [...seen];
}

/** Trim + strip a trailing slash off a URL override, or `null` when blank. */
function normUrl(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t.replace(/\/+$/, '') : null;
}

/** Trim a secret override to a value or `null` (never a blank string). */
function normSecret(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Trim a filesystem-path override to a value or `null` (paths are not URLs). */
function normPath(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * Project the memory slice out of the whole config. Derives `isProduction` + the
 * internal-service key `AppConfig` already carries and defaults the rest
 * degrade-safe. `overrides` is the seam bootstrap uses to supply Qdrant/embedder/
 * colbert/mem0 config with NO env reads in domain code.
 */
export function sliceMemoryConfig(
  app: AppConfig,
  overrides: MemoryConfigOverrides = {},
): MemoryConfig {
  const qdrantApiKey = normSecret(overrides.qdrantApiKey);
  const tensorzeroApiKey = normSecret(overrides.embedTensorzeroApiKey);
  const openaiApiKey = normSecret(overrides.embedOpenaiApiKey);
  return memoryConfigSchema.parse({
    isProduction: app.runtime.isProduction,
    internalServiceKeyPresent: app.internal.serviceKeyPresent,
    internalServiceKey: app.internal.serviceKey,

    qdrantUrl: normUrl(overrides.qdrantUrl),
    qdrantApiKeyPresent: qdrantApiKey !== null,
    qdrantApiKey,

    lanceDataDir: normPath(overrides.lanceDataDir),
    lanceNativeDir: normPath(overrides.lanceNativeDir),

    mem0Collection: overrides.mem0Collection?.trim() || DEFAULT_MEM0_COLLECTION,
    retrievalCollection: overrides.retrievalCollection?.trim() || DEFAULT_RETRIEVAL_COLLECTION,

    colbertRerankUrl: normUrl(overrides.colbertRerankUrl),
    mem0SidecarUrl: normUrl(overrides.mem0SidecarUrl),

    embedTensorzeroUrl: normUrl(overrides.embedTensorzeroUrl),
    embedTensorzeroApiKeyPresent: tensorzeroApiKey !== null,
    embedTensorzeroApiKey: tensorzeroApiKey,
    embedOpenaiApiKeyPresent: openaiApiKey !== null,
    embedOpenaiApiKey: openaiApiKey,
    embedOpenaiBaseUrl: normUrl(overrides.embedOpenaiBaseUrl),
    embedEndpoint: normUrl(overrides.embedEndpoint),
    embedModel: overrides.embedModel?.trim() || DEFAULT_EMBED_MODEL,

    writeScopeAllowlist: normStringList(overrides.writeScopeAllowlist),

    dedupeThreshold: overrides.dedupeThreshold ?? 0.9,
    recallLimit: overrides.recallLimit ?? 8,
    candidateTtlDays: overrides.candidateTtlDays ?? 30,
  });
}
