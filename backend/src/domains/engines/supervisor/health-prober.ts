/**
 * One-shot HTTP `/health` probe with a HARD timeout and a truthful classifier.
 * The invariant (shared/health-types §): a probe NEVER throws and NEVER hangs —
 * a timeout or a connection error classifies `down`, a 200 with a truthful
 * `available:false` body classifies `degraded`, a clean 200 is `up`. Shared by
 * the daemon + sidecar supervisors.
 */
import { PROBE_TIMEOUT_MS } from '../constants.js';
import type { EngineStatus } from '../types.js';

/** The raw result of a single probe. */
export interface ProbeResult {
  readonly status: EngineStatus;
  /** Probe latency in ms. */
  readonly probeMs: number;
  /** Truthful reason when not `up`. */
  readonly reason?: string;
  /** The engine's own availability flag when its `/health` body reports one. */
  readonly reportedAvailable?: boolean;
}

/**
 * Classify a `/health` response body. A body that reports `available:false`
 * (colbert's `rerank_available:false`, a sidecar's degraded deps) is a truthful
 * `degraded` — the shell is up but the capability is not — never a faked `up`.
 */
export function classifyProbe(ok: boolean, body: unknown): { status: EngineStatus; available?: boolean } {
  if (!ok) return { status: 'down' };
  const availability = readAvailability(body);
  if (availability === false) return { status: 'degraded', available: false };
  return { status: 'up', ...(availability === true ? { available: true } : {}) };
}

/** Read a boolean `available` / `*_available` / `ready` flag from a health body. */
function readAvailability(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === 'available' || key === 'ready' || key.endsWith('_available')) {
      const value = record[key];
      if (typeof value === 'boolean') return value;
    }
  }
  return undefined;
}

/**
 * Probe `<url><healthPath>` once with a hard timeout. Resolves a truthful
 * `ProbeResult` on every path — a network error, a non-2xx, or a timeout all
 * become `down` (never a throw, never a hang).
 */
export async function probeHttpHealth(
  url: string,
  timeoutMs: number = PROBE_TIMEOUT_MS,
  healthPath = '/health',
): Promise<ProbeResult> {
  const started = Date.now();
  const target = `${url.replace(/\/+$/, '')}${healthPath}`;
  try {
    const resp = await (globalThis.fetch as typeof fetch)(target, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const probeMs = Date.now() - started;
    let body: unknown;
    try {
      body = await resp.json();
    } catch {
      // 200 without a parsable body — treat as up, availability unknown.
      body = undefined;
    }
    const classified = classifyProbe(resp.ok, body);
    if (classified.status === 'up') {
      return { status: 'up', probeMs, ...(classified.available !== undefined ? { reportedAvailable: classified.available } : {}) };
    }
    if (classified.status === 'degraded') {
      return {
        status: 'degraded',
        probeMs,
        reason: 'engine reports its capability is unavailable (degraded deps)',
        reportedAvailable: false,
      };
    }
    return { status: 'down', probeMs, reason: `health probe returned HTTP ${resp.status}` };
  } catch (err) {
    const probeMs = Date.now() - started;
    const reason =
      err instanceof Error && err.name === 'TimeoutError'
        ? `health probe timed out after ${timeoutMs}ms`
        : `health probe failed: ${err instanceof Error ? err.message : String(err)}`;
    return { status: 'down', probeMs, reason };
  }
}

/**
 * Poll `/health` until it responds `up`/`degraded` or the deadline passes. Used
 * on boot to wait for a freshly-spawned daemon/sidecar. Returns the final probe
 * (which is `down` when the deadline is hit).
 */
export async function waitForHealthy(
  url: string,
  deadlineMs: number,
  pollMs: number,
  timeoutMs: number = PROBE_TIMEOUT_MS,
  healthPath = '/health',
): Promise<ProbeResult> {
  const start = Date.now();
  let last: ProbeResult = { status: 'down', probeMs: 0, reason: 'not probed yet' };
  for (;;) {
    last = await probeHttpHealth(url, timeoutMs, healthPath);
    if (last.status !== 'down') return last;
    if (Date.now() - start >= deadlineMs) return last;
    await sleep(pollMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
