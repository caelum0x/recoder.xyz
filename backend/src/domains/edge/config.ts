/**
 * `EdgeConfig` — the typed slice the edge consumes, derived from the injected
 * {@link AppConfig} (ARCHITECTURE §10.8: no `process.env` in domain code). The
 * edge reads ONLY this slice: CORS origins, body limits, the three HTTP
 * rate-limit tiers, WS heartbeat/timeouts, and the `/internal/*` key.
 *
 * `AppConfig` (Phase 0) already carries `cors`, `server`, and `internal`; the
 * rate-limit tiers + WS tuning are not yet foundational slices, so
 * `sliceEdgeConfig(app, overrides)` derives what it can and applies degrade-safe
 * defaults for the rest. `overrides` is the seam bootstrap uses to inject
 * not-yet-in-AppConfig values without any env read.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

/** A single HTTP rate-limit tier (shape-compatible with the shared limiter). */
export const rateTierSchema = z.object({
  /** Max requests per window. */
  maxRequests: z.number().int().positive(),
  /** Window size in milliseconds. */
  windowMs: z.number().int().positive(),
  /** Max concurrent in-flight requests (0 = unlimited). */
  maxConcurrent: z.number().int().min(0),
});
export type RateTierConfig = z.infer<typeof rateTierSchema>;

/** The CORS slice the edge cors middleware enforces. */
export const edgeCorsSchema = z.object({
  /** Allowlist entries; a leading `.` (e.g. `.recoder.xyz`) matches any subdomain. */
  origins: z.array(z.string()).readonly(),
  /** Emit `Access-Control-Allow-Credentials: true` (never with a `*` origin). */
  allowCredentials: z.boolean(),
});
export type EdgeCorsConfig = z.infer<typeof edgeCorsSchema>;

export const edgeConfigSchema = z.object({
  cors: edgeCorsSchema,
  /** JSON body size limit passed to `express.json({ limit })`. */
  bodyLimit: z.string(),
  /** The three HTTP rate-limit tiers keyed by `RateTier`. */
  rateLimit: z.object({
    api: rateTierSchema,
    heavy: rateTierSchema,
    auth: rateTierSchema,
  }),
  /** WS tuning: heartbeat + idle/backpressure timeouts + per-connection budget. */
  ws: z.object({
    heartbeatMs: z.number().int().positive(),
    idleTimeoutMs: z.number().int().positive(),
    /** Max inbound frames per window per connection. */
    maxFramesPerWindow: z.number().int().positive(),
    frameWindowMs: z.number().int().positive(),
  }),
  /** True when an `INTERNAL_SERVICE_KEY` is configured (gates `/internal/*`). */
  internalKeyPresent: z.boolean(),
  /** The internal-service key value (in memory only; never logged). `null` ⇒ gate denies. */
  internalServiceKey: z.string().nullable(),
  isProduction: z.boolean(),
  /** Graceful drain window (ms) before the server force-closes on shutdown. */
  shutdownDrainMs: z.number().int().min(0),
});

export type EdgeConfig = z.infer<typeof edgeConfigSchema>;

const DEFAULT_API_TIER: RateTierConfig = { maxRequests: 300, windowMs: 60_000, maxConcurrent: 60 };
const DEFAULT_HEAVY_TIER: RateTierConfig = { maxRequests: 30, windowMs: 60_000, maxConcurrent: 8 };
const DEFAULT_AUTH_TIER: RateTierConfig = { maxRequests: 20, windowMs: 60_000, maxConcurrent: 10 };

const DEFAULT_WS = {
  heartbeatMs: 30_000,
  idleTimeoutMs: 120_000,
  maxFramesPerWindow: 240,
  frameWindowMs: 10_000,
} as const;

/** The not-yet-in-AppConfig edge values bootstrap may inject. */
export interface EdgeConfigOverrides {
  readonly rateLimit?: Partial<{ api: RateTierConfig; heavy: RateTierConfig; auth: RateTierConfig }>;
  readonly ws?: Partial<z.infer<typeof edgeConfigSchema>['ws']>;
}

/**
 * Project the edge slice out of the whole config. Derives `cors`, `bodyLimit`,
 * `internal.*`, `isProduction`, and `shutdownDrainMs` from `AppConfig` and
 * defaults the rate-limit tiers + WS tuning degrade-safe. `overrides` injects the
 * not-yet-foundational values with no env read.
 */
export function sliceEdgeConfig(app: AppConfig, overrides: EdgeConfigOverrides = {}): EdgeConfig {
  return edgeConfigSchema.parse({
    cors: {
      origins: app.cors.origins,
      allowCredentials: app.cors.allowCredentials,
    },
    bodyLimit: app.server.bodyLimit,
    rateLimit: {
      api: overrides.rateLimit?.api ?? DEFAULT_API_TIER,
      heavy: overrides.rateLimit?.heavy ?? DEFAULT_HEAVY_TIER,
      auth: overrides.rateLimit?.auth ?? DEFAULT_AUTH_TIER,
    },
    ws: { ...DEFAULT_WS, ...(overrides.ws ?? {}) },
    internalKeyPresent: app.internal.serviceKeyPresent,
    internalServiceKey: app.internal.serviceKey,
    isProduction: app.runtime.isProduction,
    shutdownDrainMs: app.server.shutdownDrainMs,
  });
}
