/**
 * `InteropWireConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * The foundational `AppConfig` does not yet carry an `interop-wire` slice, so
 * this accessor derives what it can (production posture) and applies degrade-safe
 * defaults for the rest. `sliceInteropWireConfig(app, overrides)` is the seam
 * bootstrap uses to inject the not-yet-in-AppConfig values (signing secret,
 * agent-card identity, heartbeat/dispatch windows) without any env reads.
 *
 * Fail-closed by construction: no HMAC secret + production ⇒ unsigned ingress is
 * REJECTED; the agent-card is served with an empty capability set rather than a
 * fabricated one until bootstrap supplies the real identity.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

/** How inbound A2A envelopes are verified at the wire edge. */
export const wireSigningModeSchema = z.enum(['off', 'hmac', 'required']);
export type WireSigningMode = z.infer<typeof wireSigningModeSchema>;

export const interopWireConfigSchema = z.object({
  isProduction: z.boolean(),
  /** Reject unsigned inbound envelopes when true (forced on in production). */
  requireSignedIngress: z.boolean(),
  /** Shared secret for HMAC-SHA256 envelope verification; `null` ⇒ HMAC denied. */
  hmacSecret: z.string().nullable(),
  /** Key id this instance signs outbound envelopes with. */
  signingKeyId: z.string(),
  /** Allow unsigned ingress in local dev only (never in production). */
  allowInsecureIngress: z.boolean(),
  signingMode: wireSigningModeSchema,
  /** Max ms of clock skew tolerated on a signed envelope's `signed_at`. */
  maxFutureSkewMs: z.number().int().positive(),
  /** Ms without a heartbeat before a registered agent is marked `stale`/`down`. */
  heartbeatStaleMs: z.number().int().positive(),
  /** Local agent-card identity served at `/.well-known/agent.json`. */
  localCard: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    url: z.string().optional(),
    capabilities: z.array(z.string()),
    publicKey: z.string().optional(),
    version: z.string().optional(),
  }),
});

export type InteropWireConfig = z.infer<typeof interopWireConfigSchema>;

/** The not-yet-in-AppConfig interop-wire values bootstrap may inject. */
export interface InteropWireConfigOverrides {
  readonly requireSignedIngress?: boolean;
  readonly hmacSecret?: string | null;
  readonly signingKeyId?: string;
  readonly allowInsecureIngress?: boolean;
  readonly signingMode?: WireSigningMode;
  readonly maxFutureSkewMs?: number;
  readonly heartbeatStaleMs?: number;
  readonly localCard?: Partial<InteropWireConfig['localCard']>;
}

const DEFAULT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_HEARTBEAT_STALE_MS = 90_000;

/**
 * Project the interop-wire slice out of the whole config. Derives the production
 * posture `AppConfig` already carries (`runtime.isProduction`) and defaults the
 * rest degrade-safe. `overrides` is how bootstrap supplies signing + agent-card
 * identity without any env reads.
 */
export function sliceInteropWireConfig(
  app: AppConfig,
  overrides: InteropWireConfigOverrides = {},
): InteropWireConfig {
  const isProduction = app.runtime.isProduction;
  const requireSignedIngress = overrides.requireSignedIngress ?? isProduction;
  const signingMode =
    overrides.signingMode ?? (requireSignedIngress ? 'required' : isProduction ? 'hmac' : 'off');
  const serviceName = app.runtime.serviceName;
  return interopWireConfigSchema.parse({
    isProduction,
    requireSignedIngress,
    hmacSecret: overrides.hmacSecret ?? null,
    signingKeyId: overrides.signingKeyId ?? `${serviceName}-a2a`,
    allowInsecureIngress: overrides.allowInsecureIngress ?? !isProduction,
    signingMode,
    maxFutureSkewMs: overrides.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS,
    heartbeatStaleMs: overrides.heartbeatStaleMs ?? DEFAULT_HEARTBEAT_STALE_MS,
    localCard: {
      id: overrides.localCard?.id ?? `${serviceName}:${app.runtime.instanceId}`,
      name: overrides.localCard?.name ?? serviceName,
      description: overrides.localCard?.description,
      url: overrides.localCard?.url,
      capabilities: overrides.localCard?.capabilities ?? [],
      publicKey: overrides.localCard?.publicKey,
      version: overrides.localCard?.version,
    },
  });
}
