/**
 * `ModelCatalogRepository` — the durable model registry the inference domain
 * routes, prices, and generates gateway config from. Degrade-safe: without a
 * pool, writes no-op and reads return empty (the caller falls back to the
 * config-supplied default model).
 */
import type { ModelCatalogEntry } from '../types.js';

/** The fields an upsert supplies (pricing defaults to 0 = unpriced). */
export interface ModelCatalogUpsert {
  readonly modelId: string;
  readonly provider: string;
  readonly displayName: string;
  readonly contextWindow?: number;
  readonly inputMicroUsdPerMTok?: number;
  readonly outputMicroUsdPerMTok?: number;
  readonly supportsStreaming?: boolean;
  readonly enabled?: boolean;
}

export interface ModelCatalogRepository {
  /** Every catalog entry (optionally only enabled ones). */
  list(options?: { readonly enabledOnly?: boolean }): Promise<readonly ModelCatalogEntry[]>;
  /** One entry by model id (null when absent). */
  get(modelId: string): Promise<ModelCatalogEntry | null>;
  /** Upsert a catalog entry. */
  upsert(entry: ModelCatalogUpsert): Promise<ModelCatalogEntry | null>;
  /** Enable/disable a model (true when a row changed). */
  setEnabled(modelId: string, enabled: boolean): Promise<boolean>;
  /** True when the durable backing is available. */
  isDurable(): boolean;
}
