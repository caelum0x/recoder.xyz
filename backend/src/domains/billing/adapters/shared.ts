/**
 * Shared HTTP + webhook-crypto + normalization helpers for the four
 * Merchant-of-Record adapters (Polar / Creem / Paddle / Dodo).
 *
 * Every adapter is degrade-safe: with no API key it never touches the network
 * (health `down`, reads `null`, checkout throws a truthful `SERVICE_UNAVAILABLE`).
 * These helpers centralize the fail-safe HTTP shape (timeout-bounded `fetch`, no
 * secret ever logged) and the signature verifiers so no adapter hand-rolls HMAC.
 *
 * ARCHITECTURE §10.8: no `process.env` here — the credential slice is injected
 * from `BillingConfig` by the composer; base URLs default per provider only when
 * the injected `baseUrl` override is absent.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderCredential } from '../config.js';
import type { Logger } from '../../../shared/logger.js';
import { AppError, ErrorCode, createError } from '../../../shared/errors.js';
import {
  CircuitBreaker,
  type Clock,
  type Random,
  type Sleep,
} from '../../../shared/outbound-resilience.js';
import {
  degraded,
  healthy,
  unhealthy,
  type ComponentHealth,
} from '../../../shared/health-types.js';
import type { PlanCatalog } from '../services/plan-catalog.service.js';
import type {
  BillingProviderName,
  ProviderHealth,
  SubscriptionStatus,
} from '../types.js';

/** The deps every provider adapter is constructed with. */
export interface ProviderAdapterDeps {
  /** The active provider's injected credential slice (key may be absent). */
  readonly credential: ProviderCredential;
  /** The plan catalog — used to map provider product ids ↔ plan tiers. */
  readonly catalog: PlanCatalog;
  readonly logger?: Logger;
  /**
   * Optional outbound-resilience knobs (breaker + idempotent-GET retry). Absent
   * in production ⇒ a fresh per-adapter {@link CircuitBreaker} with default
   * thresholds and the real clock/RNG/timer. Injected in tests for determinism.
   */
  readonly resilience?: ProviderResilienceOptions;
}

/** Resolve the API base URL: injected override wins, else the provider default. */
export function resolveBaseUrl(credential: ProviderCredential, fallback: string): string {
  const raw = credential.baseUrl && credential.baseUrl.length > 0 ? credential.baseUrl : fallback;
  return raw.replace(/\/+$/, '');
}

/** How the adapter presents its API key on the wire. */
export type AuthScheme = 'bearer' | 'x-api-key';

export interface ProviderFetchOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly authScheme?: AuthScheme;
  readonly extraHeaders?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

/**
 * Timeout-bounded JSON fetch. Throws an `AppError(SERVICE_UNAVAILABLE)` on any
 * non-2xx / network / timeout — the caller maps that to a truthful edge error or
 * a fail-safe `null`. Never logs the Authorization header.
 */
export async function providerFetch<T>(opts: ProviderFetchOptions): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(opts.authScheme === 'x-api-key'
      ? { 'x-api-key': opts.apiKey }
      : { Authorization: `Bearer ${opts.apiKey}` }),
    ...(opts.extraHeaders ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(`${opts.baseUrl}${opts.path}`, {
      method: opts.method,
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
  } catch (cause) {
    throw createError(
      ErrorCode.SERVICE_UNAVAILABLE,
      cause instanceof Error ? `provider unreachable: ${cause.message}` : 'provider unreachable',
      { cause },
    );
  }

  const text = await response.text();
  const json = text ? safeJson(text) : {};
  if (!response.ok) {
    const detail =
      (json as { detail?: unknown; error?: unknown; message?: unknown })?.detail ??
      (json as { error?: unknown })?.error ??
      (json as { message?: unknown })?.message ??
      `HTTP ${response.status}`;
    throw createError(
      ErrorCode.SERVICE_UNAVAILABLE,
      typeof detail === 'string' ? detail : `HTTP ${response.status}`,
    );
  }
  return json as T;
}

/* ------------------------------------------------------------------ *
 * Outbound resilience: per-provider circuit breaker + idempotent retry *
 * ------------------------------------------------------------------ */

/**
 * Injectable resilience knobs. Every field is optional and defaults to a
 * production-safe value; tests inject a shared `breaker`, a fake `now`/`sleep`/
 * `random`, or tighter budgets to make the state machine deterministic. Read-only
 * consumer of `../../../shared/outbound-resilience` — that primitive is never
 * modified here.
 */
export interface ProviderResilienceOptions {
  /** Reuse an existing breaker instead of minting a fresh per-adapter one. */
  readonly breaker?: CircuitBreaker;
  /** Consecutive failures that trip the provider circuit OPEN. Default 5. */
  readonly failureThreshold?: number;
  /** How long the circuit stays OPEN before a half-open probe, in ms. Default 30s. */
  readonly cooldownMs?: number;
  /** Injected clock for the breaker (defaults to the real `Date.now`). */
  readonly now?: Clock;
  /** Total attempts (incl. the first) for an IDEMPOTENT GET. Default 3. */
  readonly maxAttempts?: number;
  /** Backoff base for the idempotent-GET retry, in ms. Default 100. */
  readonly baseDelayMs?: number;
  /** Upper bound on any single idempotent-GET backoff delay, in ms. Default 30s. */
  readonly maxDelayMs?: number;
  /** Injected RNG in [0,1) for the retry jitter (defaults to `Math.random`). */
  readonly random?: Random;
  /** Injected abortable delay for the retry backoff (defaults to a real timer). */
  readonly sleep?: Sleep;
}

/** The resilient outbound transport shared by an adapter's read + write calls. */
export interface ProviderTransport {
  /**
   * Perform one provider HTTP call under the circuit breaker. A `GET` is treated
   * as IDEMPOTENT and wrapped in a bounded jittered retry; every other method
   * (checkout-create POST, usage-ingest POST, cancel PATCH, …) runs exactly ONCE
   * and is NEVER re-sent. While the circuit is OPEN this fast-fails with a
   * truthful `CircuitOpenError` — never a fabricated response.
   */
  call<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { readonly extraHeaders?: Readonly<Record<string, string>>; readonly timeoutMs?: number },
  ): Promise<T>;
  /** The breaker gating this transport (per provider) — exposed for inspection. */
  readonly breaker: CircuitBreaker;
}

export interface ProviderTransportOptions {
  /** The provider this transport speaks to — used as the breaker key. */
  readonly provider: BillingProviderName;
  /** Resolved API base URL (already trailing-slash-trimmed). */
  readonly baseUrl: string;
  /** The bearer / x-api-key credential (may be empty when unconfigured). */
  readonly apiKey: string;
  /** How the key is presented on the wire (defaults to bearer). */
  readonly authScheme?: AuthScheme;
  /** Optional resilience overrides (breaker reuse + deterministic seams). */
  readonly resilience?: ProviderResilienceOptions;
}

/** A method is retry-safe only when it cannot duplicate a side effect. */
function isIdempotentMethod(method: string): boolean {
  return method.toUpperCase() === 'GET';
}

/**
 * Build a per-provider resilient transport around {@link providerFetch}.
 *
 * The circuit breaker isolates this provider's downstream: once it trips OPEN,
 * `call` fast-fails truthfully (the adapter maps that to `down` / `null` /
 * `SERVICE_UNAVAILABLE`, never a faked success) until the cooldown allows a
 * single half-open probe. Bounded retry is applied ONLY to idempotent `GET`
 * reads (subscription lookups, health probes); a checkout-create or webhook-side
 * `POST` is never retried, so a payment/usage side effect can never be duplicated.
 */
export function createProviderTransport(options: ProviderTransportOptions): ProviderTransport {
  const r = options.resilience;
  const breaker =
    r?.breaker ??
    new CircuitBreaker({
      failureThreshold: r?.failureThreshold,
      cooldownMs: r?.cooldownMs,
      now: r?.now,
    });
  const key = options.provider;

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { readonly extraHeaders?: Readonly<Record<string, string>>; readonly timeoutMs?: number },
  ): Promise<T> {
    const run = (): Promise<T> =>
      providerFetch<T>({
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        method,
        path,
        body,
        authScheme: options.authScheme,
        extraHeaders: opts?.extraHeaders,
        timeoutMs: opts?.timeoutMs,
      });

    // Non-idempotent writes: breaker-gated, but executed exactly once (no retry).
    if (!isIdempotentMethod(method)) {
      return breaker.execute(key, run);
    }

    // Idempotent reads/health: breaker-gated AND bounded jittered retry.
    return breaker.execute(key, run, {
      idempotent: true,
      maxAttempts: r?.maxAttempts,
      baseDelayMs: r?.baseDelayMs,
      maxDelayMs: r?.maxDelayMs,
      random: r?.random,
      sleep: r?.sleep,
    });
  }

  return { call, breaker };
}

/** Parse JSON, returning `{}` on malformed input (never throws). */
export function safeJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Constant-time string comparison that never throws on length mismatch. */
export function timingEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Header lookup that is case-insensitive (Express lowercases; raw may not). */
export function header(
  headers: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

/** Default webhook timestamp tolerance (5 minutes), per the Standard-Webhooks spec. */
export const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 300_000;

/** Injectable clock/tolerance for the replay-defense freshness check (testable + deterministic). */
export interface WebhookFreshnessOptions {
  /** Current wall-clock in ms (defaults to `Date.now()`). */
  readonly nowMs?: number;
  /** Max allowed skew between `nowMs` and the signed timestamp (defaults to 5 min). */
  readonly toleranceMs?: number;
}

/**
 * Replay defense: the provider timestamp is Unix *seconds* (Standard-Webhooks +
 * Paddle). Reject when it is missing, non-numeric, or further than `toleranceMs`
 * from `nowMs` — a captured-but-valid webhook cannot re-verify forever.
 */
export function isFreshWebhookTimestamp(timestamp: string, opts?: WebhookFreshnessOptions): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const nowMs = opts?.nowMs ?? Date.now();
  const toleranceMs = opts?.toleranceMs ?? WEBHOOK_TIMESTAMP_TOLERANCE_MS;
  return Math.abs(nowMs - seconds * 1000) <= toleranceMs;
}

/**
 * Verify a Standard-Webhooks signature (Polar + Dodo Payments). The signed
 * content is `${id}.${timestamp}.${payload}`; the secret is a `whsec_`-prefixed
 * base64 value. The `webhook-signature` header is a space-delimited list of
 * `v1,<base64sig>` entries — a match on ANY entry passes (key rotation).
 *
 * Rejects a stale timestamp (replay defense) BEFORE the HMAC compare.
 */
export function verifyStandardWebhook(
  rawBody: Buffer,
  headers: Readonly<Record<string, string>>,
  secret: string,
  freshness?: WebhookFreshnessOptions,
): boolean {
  const id = header(headers, 'webhook-id');
  const timestamp = header(headers, 'webhook-timestamp');
  const sigHeader = header(headers, 'webhook-signature');
  if (!id || !timestamp || !sigHeader) return false;
  if (!isFreshWebhookTimestamp(timestamp, freshness)) return false;

  const key = decodeWebhookSecret(secret);
  const signed = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', key).update(signed).digest('base64');

  for (const part of sigHeader.split(' ')) {
    const [, sig] = part.split(',', 2);
    if (sig && timingEqual(sig, expected)) return true;
  }
  return false;
}

/** A `whsec_`-prefixed secret is base64 after the prefix; else use raw utf8 bytes. */
function decodeWebhookSecret(secret: string): Buffer {
  const stripped = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const b64 = Buffer.from(stripped, 'base64');
  // If it round-trips as base64, use the decoded bytes; otherwise treat as raw.
  return b64.length > 0 && b64.toString('base64').replace(/=+$/, '') === stripped.replace(/=+$/, '')
    ? b64
    : Buffer.from(secret, 'utf8');
}

/** Verify a hex HMAC-SHA256 of the raw body (Creem: `creem-signature`). */
export function verifyHmacHex(
  rawBody: Buffer,
  headers: Readonly<Record<string, string>>,
  secret: string,
  headerName: string,
): boolean {
  const provided = header(headers, headerName);
  if (!provided) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingEqual(provided.trim().toLowerCase(), expected.toLowerCase());
}

/**
 * Verify a Paddle `Paddle-Signature` header of the form `ts=<unix>;h1=<hex>`.
 * The signed payload is `${ts}:${rawBody}` HMAC-SHA256 hex against the secret.
 *
 * Rejects a stale `ts` (replay defense) BEFORE the HMAC compare.
 */
export function verifyPaddleSignature(
  rawBody: Buffer,
  headers: Readonly<Record<string, string>>,
  secret: string,
  freshness?: WebhookFreshnessOptions,
): boolean {
  const raw = header(headers, 'paddle-signature');
  if (!raw) return false;
  let ts: string | undefined;
  let h1: string | undefined;
  for (const part of raw.split(';')) {
    const [k, v] = part.split('=', 2);
    if (k === 'ts') ts = v;
    else if (k === 'h1') h1 = v;
  }
  if (!ts || !h1) return false;
  if (!isFreshWebhookTimestamp(ts, freshness)) return false;
  const expected = createHmac('sha256', secret)
    .update(`${ts}:${rawBody.toString('utf8')}`)
    .digest('hex');
  return timingEqual(h1.toLowerCase(), expected.toLowerCase());
}

/** Normalize an arbitrary provider status string to a domain SubscriptionStatus. */
export function normalizeStatus(raw: unknown): SubscriptionStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'active' || s === 'paid' || s === 'succeeded') return 'active';
  if (s === 'trialing' || s === 'trial' || s === 'on_trial') return 'trialing';
  if (s === 'past_due' || s === 'unpaid' || s === 'payment_failed') return 'past_due';
  // canceled | cancelled | expired | revoked | paused | incomplete_expired → canceled floor.
  return 'canceled';
}

/** Coerce a value to a trimmed non-empty string or `undefined`. */
export function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/** Coerce a value to an ISO string or `undefined` (accepts Date | number | string). */
export function isoOrUndefined(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return new Date(v).toISOString();
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * Build a truthful `ProviderHealth`. `configured:false` ⇒ `down` (never faked).
 * When configured, `probe` runs a cheap authenticated call; a throw ⇒ `down`
 * with the truthful reason (auth/network), never a fabricated `up`.
 */
export async function buildProviderHealth(
  name: BillingProviderName,
  credential: ProviderCredential,
  probe: () => Promise<void>,
): Promise<ProviderHealth> {
  if (!credential.present) {
    return { name, configured: false, status: 'down', reason: `${name}: API key not configured` };
  }
  try {
    await probe();
    return { name, configured: true, status: 'up' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : `${name} unreachable`;
    return { name, configured: true, status: 'down', reason };
  }
}

/** Map a `ProviderHealth` onto the module-level `ComponentHealth` shape. */
export function providerToComponentHealth(h: ProviderHealth, componentName: string): ComponentHealth {
  if (!h.configured) return degraded(componentName, h.reason ?? `${h.name}: not configured`);
  if (h.status === 'up') return healthy(componentName, { provider: h.name });
  return unhealthy(componentName, h.reason ?? `${h.name}: provider down`);
}

/** The fail-safe guard every adapter's `createCheckout` uses when the key is absent. */
export function unconfiguredCheckoutError(name: BillingProviderName): AppError {
  return createError(
    ErrorCode.SERVICE_UNAVAILABLE,
    `${name}: billing provider not configured; cannot start checkout`,
  );
}

/** Extract a subject id from a provider event's metadata (best-effort). */
export function subjectIdFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const m = metadata as Record<string, unknown>;
  return str(m.subjectId) ?? str(m.subject_id) ?? str(m.recoder_subject_id);
}
