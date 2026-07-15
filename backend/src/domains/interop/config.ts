/**
 * `InteropConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * The foundational `AppConfig` (Phase 0) does not yet carry an `interop` slice,
 * so this accessor derives what it can from existing slices (`internal`,
 * `runtime`) and applies degrade-safe defaults for the rest:
 *   - no HMAC secret + production  -> unsigned ingress is REJECTED (fail closed).
 *   - `internalServiceKey` absent  -> `/internal/*` gate denies (fail closed).
 * `sliceInteropConfig(app, overrides)` lets bootstrap inject the not-yet-in-
 * AppConfig values (signing secret, rate-limit buckets, runtime enable flags)
 * without any domain code reading the environment.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

/** A single token-bucket / sliding-window rate-limit bucket. */
export const rateBucketSchema = z.object({
  /** Max requests per window. */
  maxRequests: z.number().int().positive(),
  /** Window size in milliseconds. */
  windowMs: z.number().int().positive(),
  /** Max concurrent in-flight requests (0 = unlimited). */
  maxConcurrent: z.number().int().min(0),
});
export type RateBucket = z.infer<typeof rateBucketSchema>;

/** How inbound A2A envelopes are verified at the edge. */
export const signingModeSchema = z.enum(['off', 'hmac', 'ed25519', 'required']);
export type SigningMode = z.infer<typeof signingModeSchema>;

export const interopConfigSchema = z.object({
  /** True when an `INTERNAL_SERVICE_KEY` is configured (gates `/internal/*`). */
  internalServiceKeyPresent: z.boolean(),
  /** The internal-service key value (in memory only; never logged). `null` -> gate denies. */
  internalServiceKey: z.string().nullable(),
  isProduction: z.boolean(),
  /** Reject unsigned inbound envelopes when true (forced on in production). */
  requireSignedIngress: z.boolean(),
  /** Shared secret for HMAC-SHA256 envelope verification; `null` -> HMAC ingress denied. */
  hmacSecret: z.string().nullable(),
  /** Allow unsigned ingress in local dev (never in production). */
  allowInsecureIngress: z.boolean(),
  signingMode: signingModeSchema,
  /** Per-surface rate-limit buckets. */
  rateLimit: z.object({
    edge: rateBucketSchema,
    mcp: rateBucketSchema,
    connector: rateBucketSchema,
  }),
  /** Runtime enable flags (`claude`/`codex`/`openfang`/…) for later groups. */
  runtimes: z.record(z.string(), z.boolean()),
  /** Max ms to wait for a runtime dispatch before marking it degraded. */
  dispatchTimeoutMs: z.number().int().positive(),
  /** Ms without a heartbeat before a runtime is marked `stale`. */
  heartbeatStaleMs: z.number().int().positive(),
});

export type InteropConfig = z.infer<typeof interopConfigSchema>;

const DEFAULT_EDGE_BUCKET: RateBucket = { maxRequests: 300, windowMs: 60_000, maxConcurrent: 40 };
const DEFAULT_MCP_BUCKET: RateBucket = { maxRequests: 120, windowMs: 60_000, maxConcurrent: 20 };
const DEFAULT_CONNECTOR_BUCKET: RateBucket = { maxRequests: 60, windowMs: 60_000, maxConcurrent: 8 };

/** The not-yet-in-AppConfig interop values bootstrap may inject. */
export interface InteropConfigOverrides {
  readonly requireSignedIngress?: boolean;
  readonly hmacSecret?: string | null;
  readonly allowInsecureIngress?: boolean;
  readonly signingMode?: SigningMode;
  readonly rateLimit?: Partial<{ edge: RateBucket; mcp: RateBucket; connector: RateBucket }>;
  readonly runtimes?: Readonly<Record<string, boolean>>;
  readonly dispatchTimeoutMs?: number;
  readonly heartbeatStaleMs?: number;
}

/**
 * Project the interop slice out of the whole config. Derives the values
 * `AppConfig` already carries (`internal.serviceKey*`, `runtime.isProduction`)
 * and defaults the rest degrade-safe. `overrides` is the seam bootstrap uses to
 * supply signing + rate-limit + runtime-enable config without any env reads.
 */
export function sliceInteropConfig(
  app: AppConfig,
  overrides: InteropConfigOverrides = {},
): InteropConfig {
  const isProduction = app.runtime.isProduction;
  const requireSignedIngress = overrides.requireSignedIngress ?? isProduction;
  const signingMode =
    overrides.signingMode ?? (requireSignedIngress ? 'required' : isProduction ? 'hmac' : 'off');
  return interopConfigSchema.parse({
    internalServiceKeyPresent: app.internal.serviceKeyPresent,
    internalServiceKey: app.internal.serviceKey,
    isProduction,
    requireSignedIngress,
    hmacSecret: overrides.hmacSecret ?? null,
    allowInsecureIngress: overrides.allowInsecureIngress ?? !isProduction,
    signingMode,
    rateLimit: {
      edge: overrides.rateLimit?.edge ?? DEFAULT_EDGE_BUCKET,
      mcp: overrides.rateLimit?.mcp ?? DEFAULT_MCP_BUCKET,
      connector: overrides.rateLimit?.connector ?? DEFAULT_CONNECTOR_BUCKET,
    },
    runtimes: overrides.runtimes ?? {},
    dispatchTimeoutMs: overrides.dispatchTimeoutMs ?? 120_000,
    heartbeatStaleMs: overrides.heartbeatStaleMs ?? 90_000,
  });
}
