/**
 * `ObservabilityConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * The foundational `AppConfig` does not carry an observability slice, so
 * `sliceObservabilityConfig(app, overrides)` derives what it can from `runtime`/
 * `internal`/`logging` and takes the OTLP endpoint, metrics-auth token, sample
 * ratio, redaction keys, and ops-recorder URL through the `overrides` seam
 * bootstrap injects (the same governance/billing-config pattern). Fail-safe
 * defaults: no localhost in production; absent OTLP ⇒ tracing degrades to no
 * export; absent metrics token in production ⇒ `/metrics` fails safe (503).
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

/** Redaction keys applied to structured logs + access logs (never logged raw). */
const DEFAULT_REDACT_KEYS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
];

export const observabilityConfigSchema = z.object({
  /** OTLP-HTTP trace collector endpoint; `null` ⇒ no-op exporter (degraded). */
  otlpEndpoint: z.string().nullable(),
  /** True when a trace collector is configured (drives tracer degraded flag). */
  tracingExportEnabled: z.boolean(),
  /** Head sampling ratio [0,1]. */
  sampleRatio: z.number().min(0).max(1),
  /** The `/metrics` scrape auth token (also the `INTERNAL_SERVICE_KEY`); null ⇒ gate denies. */
  metricsAuthToken: z.string().nullable(),
  /** True when a metrics token is present (safe to log). */
  metricsAuthPresent: z.boolean(),
  /** Structured-log redaction keys (case-insensitive header/field match). */
  redactKeys: z.array(z.string()).readonly(),
  /** Loopback URL of the Python ops-recorder work-signals sidecar; null ⇒ signals down. */
  opsRecorderUrl: z.string().nullable(),
  /** Auth token the sidecar's `require_api_key` expects; null ⇒ preflight fails. */
  opsRecorderToken: z.string().nullable(),
  /**
   * True when the sidecar runs with auth disabled (loopback-only dev): the
   * token preflight is skipped and the live probe decides truthfully.
   */
  opsRecorderAuthDisabled: z.boolean(),
  /** Enable the alert rule-evaluation loop (off in local/test by default). */
  alertingEnabled: z.boolean(),
  /** Alert evaluation cadence (ms); `0` disables the loop. */
  alertEvalIntervalMs: z.number().int().nonnegative(),
  /**
   * Enable the autonomous work-signals poller: a scheduled tick that calls
   * `WorkSignalsService.refresh()` so needs-you/stuck signals reach the notify +
   * RunEvent bus WITHOUT a human opening the board. Degrade-truthful — a poll
   * against an absent sidecar yields an empty batch, never a fabricated signal.
   */
  signalsPollEnabled: z.boolean(),
  /** Work-signals poll cadence (ms); `0` disables the loop (default off outside prod). */
  signalsPollIntervalMs: z.number().int().nonnegative(),
  /**
   * Enable the GitHub/Linear detector tick that rides the signals poll loop.
   * HARD DEPENDENCY: the tick fires only inside `pollSignalsOnce`, so this flag is
   * INERT unless the poller is armed (`signalsPollEnabled && signalsPollIntervalMs
   * > 0`). Opt-in (default false) — the detectors touch real GH/Linear via tokens
   * held in the Python sidecar. Degrade-truthful: no tokens ⇒ the sidecar detects
   * nothing ⇒ the following `refresh()` pulls nothing (never a fabricated signal).
   */
  signalsSyncEnabled: z.boolean(),
  /** Bounded in-memory log ring buffer size for the ops surface. */
  logRingSize: z.number().int().positive(),
  /** Default space id for un-scoped internal reads/writes. */
  defaultSpaceId: z.string(),
  isProduction: z.boolean(),
});

export type ObservabilityConfig = z.infer<typeof observabilityConfigSchema>;

/** The not-yet-in-AppConfig observability values bootstrap may inject. */
export interface ObservabilityConfigOverrides {
  readonly otlpEndpoint?: string | null;
  readonly sampleRatio?: number;
  readonly metricsAuthToken?: string | null;
  readonly redactKeys?: readonly string[];
  readonly opsRecorderUrl?: string | null;
  readonly opsRecorderToken?: string | null;
  readonly opsRecorderAuthDisabled?: boolean;
  readonly alertingEnabled?: boolean;
  readonly alertEvalIntervalMs?: number;
  readonly signalsPollEnabled?: boolean;
  readonly signalsPollIntervalMs?: number;
  readonly signalsSyncEnabled?: boolean;
  readonly logRingSize?: number;
  readonly defaultSpaceId?: string;
}

/**
 * Reject a localhost/loopback OTLP endpoint in production (fail-safe: a prod build
 * must never silently point tracing at a dev collector). Returns the value in dev.
 */
function safeEndpoint(value: string | null | undefined, isProduction: boolean): string | null {
  if (!value) return null;
  if (isProduction && /localhost|127\.0\.0\.1|\[::1\]/.test(value)) return null;
  return value;
}

/**
 * Project the observability slice out of the whole config. The metrics-auth token
 * defaults to the shared `INTERNAL_SERVICE_KEY` (same trust boundary as
 * `/internal/*`); everything else arrives via `overrides` (bootstrap reads env
 * once and injects). Absent overrides ⇒ tracing no-op + signals down + `/metrics`
 * gated — all truthful, never a faked readiness.
 */
export function sliceObservabilityConfig(
  app: AppConfig,
  overrides: ObservabilityConfigOverrides = {},
): ObservabilityConfig {
  const isProduction = app.runtime.isProduction;
  const otlpEndpoint = safeEndpoint(overrides.otlpEndpoint, isProduction);
  // The ops-recorder sidecar loopback URL: a bare localhost URL is FINE here (it is
  // an in-box sidecar), unlike the OTLP collector — so it is passed through as-is.
  const opsRecorderUrl = overrides.opsRecorderUrl ?? null;
  const metricsAuthToken = overrides.metricsAuthToken ?? app.internal.serviceKey;

  return observabilityConfigSchema.parse({
    otlpEndpoint,
    tracingExportEnabled: otlpEndpoint !== null,
    sampleRatio: overrides.sampleRatio ?? (isProduction ? 0.1 : 1),
    metricsAuthToken,
    metricsAuthPresent: metricsAuthToken !== null && metricsAuthToken.length > 0,
    redactKeys: overrides.redactKeys ?? DEFAULT_REDACT_KEYS,
    opsRecorderUrl,
    opsRecorderToken: overrides.opsRecorderToken ?? null,
    opsRecorderAuthDisabled: overrides.opsRecorderAuthDisabled ?? false,
    alertingEnabled: overrides.alertingEnabled ?? false,
    alertEvalIntervalMs: overrides.alertEvalIntervalMs ?? (isProduction ? 30_000 : 0),
    // The signals poller is autonomous by default (needs-you/stuck signals must
    // reach a human even when nobody opens the board). Off outside production —
    // a `0` interval disables the loop so tests/dev never spin a background timer.
    signalsPollEnabled: overrides.signalsPollEnabled ?? true,
    signalsPollIntervalMs: overrides.signalsPollIntervalMs ?? (isProduction ? 60_000 : 0),
    // The detector tick is opt-in and rides the poll loop (inert unless the poller
    // is armed). Off by default — it touches real GH/Linear via the sidecar.
    signalsSyncEnabled: overrides.signalsSyncEnabled ?? false,
    logRingSize: overrides.logRingSize ?? 1_000,
    defaultSpaceId: overrides.defaultSpaceId ?? 'default',
    isProduction,
  });
}
