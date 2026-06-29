/**
 * recoder-billing IPC connect seam — the Node-side client for the optional
 * `py/recoder-billing` internal billing surface (`/internal/agent-os/billing/*`).
 *
 * The py engine (recoder_billing.ipc.internal_api) exposes exactly two endpoints
 * behind `BILLING_BASE_URL`:
 *   - `GET  /internal/agent-os/billing/health` → 200 `{healthy:true}` / 503 unhealthy
 *   - `POST /internal/agent-os/billing/invoke`  → an operation call, guarded by the
 *      `x-internal-service-key` header + a signed envelope (single-use nonce).
 *
 * This seam wires the CONNECT path the TS Polar adapter does not cover: when an
 * operator runs the standalone py billing engine and sets `BILLING_BASE_URL`, the
 * backend can probe its readiness (and, when `INTERNAL_SERVICE_KEY` is set, send
 * an authorized invoke). It is purely ADDITIVE — the existing `@recoder/distribution`
 * Polar billing path is untouched and remains the default.
 *
 * DEGRADE-SAFE end to end:
 *   - `BILLING_BASE_URL` unset      → `{ available:false }`, never a faked health.
 *   - server down / non-2xx / 503   → `{ healthy:false, reason }`, never throws.
 *   - missing `INTERNAL_SERVICE_KEY` → `invoke` reports unauthorized without a call.
 * It mirrors the py guard's own contract: a missing secret/URL DENIES, never fakes
 * an allow.
 */
import { createLogger } from './log.js';

const logger = createLogger('distribution-billing-ipc');

/** Path prefix the py engine mounts the internal billing surface under. */
const INTERNAL_PREFIX = '/internal/agent-os/billing';
const INTERNAL_SERVICE_KEY_HEADER = 'x-internal-service-key';

/** Bounded probe/invoke timeout (ms). */
const IPC_TIMEOUT_MS = 8_000;

/** Resolved `BILLING_BASE_URL` (trailing slash stripped), or undefined when off. */
export function billingBaseUrl(): string | undefined {
  const raw = process.env.BILLING_BASE_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '');
}

function internalServiceKey(): string | undefined {
  return process.env.INTERNAL_SERVICE_KEY?.trim() || undefined;
}

export interface BillingIpcAvailability {
  /** True when `BILLING_BASE_URL` is configured (the seam can connect). */
  readonly available: boolean;
  /** The resolved base URL, when available. */
  readonly url?: string;
  /** True when an `INTERNAL_SERVICE_KEY` is also present (invoke is possible). */
  readonly authorized: boolean;
}

/**
 * Truthful availability of the billing IPC seam: is `BILLING_BASE_URL` set, and
 * do we also hold an `INTERNAL_SERVICE_KEY` to authorize an invoke? This is a
 * config check (no network) — `health()` does the live probe.
 */
export function billingIpcAvailability(): BillingIpcAvailability {
  const url = billingBaseUrl();
  const authorized = Boolean(internalServiceKey());
  return url ? { available: true, url, authorized } : { available: false, authorized };
}

export interface BillingIpcHealth {
  /** True when `BILLING_BASE_URL` is configured. */
  readonly available: boolean;
  /** True only when the engine returned a 200 `{healthy:true}`. */
  readonly healthy: boolean;
  /** The engine's reported status (`ok` / `unhealthy`) when reachable. */
  readonly status?: string;
  /** Why the probe was skipped/failed (set when not healthy). */
  readonly reason?: string;
}

/**
 * Probe `GET /internal/agent-os/billing/health` on the py billing engine. This
 * endpoint needs no envelope (only the optional service key), so a deploy can be
 * monitored even before a signed invoke is wired.
 *
 * Degrade-safe: unset URL / unreachable / non-2xx all return `healthy:false`
 * with a `reason`; never throws and never fabricates a healthy result.
 */
export async function billingIpcHealth(): Promise<BillingIpcHealth> {
  const url = billingBaseUrl();
  if (!url) {
    return { available: false, healthy: false, reason: 'BILLING_BASE_URL not set' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IPC_TIMEOUT_MS);
  try {
    const key = internalServiceKey();
    const res = await fetch(`${url}${INTERNAL_PREFIX}/health`, {
      method: 'GET',
      headers: key ? { [INTERNAL_SERVICE_KEY_HEADER]: key } : {},
      signal: controller.signal,
    });
    // The engine returns 503 (with a body) when a required secret/URL is absent.
    const body = (await res.json().catch(() => ({}))) as { status?: string; healthy?: boolean };
    if (!res.ok || body.healthy !== true) {
      return {
        available: true,
        healthy: false,
        ...(body.status ? { status: body.status } : {}),
        reason: `billing engine reported HTTP ${res.status}`,
      };
    }
    return { available: true, healthy: true, status: body.status ?? 'ok' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'billing IPC health probe failed';
    logger.warn('billing IPC health probe failed', { reason });
    return { available: true, healthy: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

export interface BillingIpcInvokeResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly data?: unknown;
  readonly reason?: string;
}

/**
 * Send an authorized operation to `POST /internal/agent-os/billing/invoke`.
 *
 * The caller supplies a fully-formed signed `envelope` (built by whatever owns
 * the billing signing key) — this seam does NOT mint envelopes, so no signing
 * material is duplicated here. It only attaches the `x-internal-service-key`
 * header and posts the envelope.
 *
 * Degrade-safe: missing URL or service key returns `{ ok:false, reason }` WITHOUT
 * a network call (never a faked success); transport/HTTP errors degrade to
 * `{ ok:false, reason }`; never throws.
 */
export async function billingIpcInvoke(envelope: unknown): Promise<BillingIpcInvokeResult> {
  const url = billingBaseUrl();
  if (!url) return { ok: false, reason: 'BILLING_BASE_URL not set' };
  const key = internalServiceKey();
  if (!key) return { ok: false, reason: 'INTERNAL_SERVICE_KEY not set (cannot authorize invoke)' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IPC_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${INTERNAL_PREFIX}/invoke`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [INTERNAL_SERVICE_KEY_HEADER]: key,
      },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok) {
      return { ok: false, status: res.status, data, reason: `billing invoke HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'billing IPC invoke failed';
    logger.warn('billing IPC invoke failed', { reason });
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
