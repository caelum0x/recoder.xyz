/**
 * `InferenceConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * The foundational `AppConfig` does not yet carry an `inference` slice, so this
 * accessor derives what it can (`isProduction`, the internal-service key) and
 * applies degrade-safe defaults for the rest. The gateway endpoint + optional
 * bearer key + wire paths + streaming toggle are the scattered `TENSORZERO_URL`
 * / `TENSORZERO_GATEWAY_API_KEY` env reads; `bootstrap/config.ts` folds them into
 * `InferenceConfigOverrides` so NO inference domain code reads the environment.
 *
 * SECURITY: the bearer key travels in-memory only (`gatewayApiKey`), NEVER into
 * health output or a response body; `gatewayApiKeyPresent` is the surfaced gate.
 * Fail-safe until wired: no endpoint → the loopback tier is unconfigured and the
 * ladder falls to the napi embedded gateway or reports a truthful degrade.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

/** Default OpenAI-compatible wire paths the TensorZero gateway exposes. */
export const DEFAULT_COMPLETE_PATH = '/openai/v1/chat/completions';
export const DEFAULT_EMBED_PATH = '/openai/v1/embeddings';

const nullableUrl = z.string().url().nullable();

export const inferenceConfigSchema = z.object({
  isProduction: z.boolean(),

  /** `INTERNAL_SERVICE_KEY` presence (gates `/internal/inference/*`). */
  internalServiceKeyPresent: z.boolean(),
  internalServiceKey: z.string().nullable(),

  /**
   * Solo/desktop mode (bootstrap-injected from `RECODER_SOLO_MODE`): the single
   * local owner. Fails the cross-tenant feedback ownership guard OPEN so the
   * embedded desktop user is never locked out.
   */
  soloMode: z.boolean(),

  /** Base URL of the loopback/external TensorZero gateway; `null` → unconfigured. */
  gatewayEndpoint: nullableUrl,
  /** Whether a bearer key is configured (surfaced); the value stays in-memory only. */
  gatewayApiKeyPresent: z.boolean(),
  /** The bearer key value, held only in memory; never logged, never surfaced. */
  gatewayApiKey: z.string().nullable(),

  /** OpenAI-compatible completion + embedding wire paths (override for parity). */
  completePath: z.string().min(1),
  embedPath: z.string().min(1),

  /** Prefer the in-process napi embedded gateway before the loopback HTTP tier. */
  napiFirst: z.boolean(),
  /** Whether real per-token SSE streaming is enabled (loopback tier). */
  streamingEnabled: z.boolean(),

  /** The default model when a caller omits one. */
  defaultModel: z.string().min(1),
  /** Per-completion deadline (ms). */
  requestTimeoutMs: z.number().int().positive(),
});

export type InferenceConfig = z.infer<typeof inferenceConfigSchema>;

/** The not-yet-in-AppConfig inference values bootstrap injects (all env reads there). */
export interface InferenceConfigOverrides {
  readonly gatewayEndpoint?: string | null;
  readonly gatewayApiKey?: string | null;
  readonly completePath?: string;
  readonly embedPath?: string;
  readonly napiFirst?: boolean;
  readonly streamingEnabled?: boolean;
  readonly defaultModel?: string;
  readonly requestTimeoutMs?: number;
}

/**
 * Project the inference slice out of the whole config. Derives `isProduction` +
 * the internal-service key `AppConfig` already carries and defaults the rest
 * degrade-safe. `overrides` is the seam bootstrap uses to supply the gateway
 * endpoint/key/paths with no env reads in domain code.
 */
export function sliceInferenceConfig(
  app: AppConfig,
  overrides: InferenceConfigOverrides = {},
): InferenceConfig {
  const endpoint = overrides.gatewayEndpoint?.trim() ? overrides.gatewayEndpoint.trim().replace(/\/+$/, '') : null;
  const apiKey = overrides.gatewayApiKey?.trim() || null;
  return inferenceConfigSchema.parse({
    isProduction: app.runtime.isProduction,
    internalServiceKeyPresent: app.internal.serviceKeyPresent,
    internalServiceKey: app.internal.serviceKey,
    soloMode: app.runtime.soloMode === true,
    gatewayEndpoint: endpoint,
    gatewayApiKeyPresent: apiKey !== null,
    gatewayApiKey: apiKey,
    completePath: overrides.completePath ?? DEFAULT_COMPLETE_PATH,
    embedPath: overrides.embedPath ?? DEFAULT_EMBED_PATH,
    napiFirst: overrides.napiFirst ?? true,
    streamingEnabled: overrides.streamingEnabled ?? true,
    defaultModel: overrides.defaultModel ?? 'openai/gpt-4o-mini',
    requestTimeoutMs: overrides.requestTimeoutMs ?? 60_000,
  });
}
