/**
 * ops-recorder adapter — the degrade-safe loopback seam between the
 * docker-backend's inline `/work-signals` ingest and the richer Python
 * ops-recorder work-signals service (`py/ops-recorder/work-signals`).
 *
 * INTEGRATION-PLAN §d.4 / WIRE-UP #10:
 *   py/ops-recorder is the DETECTOR authority — it polls GitHub/Linear, detects
 *   stuck work, normalises it into `WorkSignal` objects, and generates AI handoff
 *   prompts. The docker-backend `/work-signals` ingress is the lightweight
 *   in-process TS sink that the Python service (or any caller) POSTs a stuck item
 *   to once the detection is done.
 *
 * This module adds the DUAL direction:
 *
 *   a) FORWARD: after the inline ingest records + emits the signal, this adapter
 *      optionally forwards the same event to the Python service's `/ingest`
 *      endpoint so the py service's richer store/pipeline also has it.
 *      Gated by `OPS_RECORDER_URL`; degrade-safe — forwarding failure never
 *      blocks or changes the result the caller already received.
 *
 *   b) PARSE (fused shape): accepts the richer ops-recorder `WorkSignalIngest`
 *      wire shape (source/item_type/title/source_url/detected_reason/priority)
 *      so a call originating from the Python service can be handled by the same
 *      POST `/work-signals` ingress without a separate route. The fused fields
 *      are carried into `WorkSignalInput.detail` and `WorkSignalInput.reportedBy`
 *      so the inline path sees them naturally.
 *
 * DEGRADE-SAFE contract (mirrors colbert-rerank.ts):
 *   - `OPS_RECORDER_URL` unset → availability `false`, forward skipped silently.
 *   - service down / non-2xx  → forward skipped, reason logged, never throws.
 *   - malformed response       → forward skipped, reason logged, never throws.
 *   It NEVER fakes a forward it could not complete and NEVER throws into a caller.
 */
import { createLogger } from '../logger.js';

const logger = createLogger('conductor:ops-recorder-adapter');

/** Request timeout for forwarding to the Python service. */
const FORWARD_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// URL helpers (mirrors colbert-rerank.ts pattern)
// ---------------------------------------------------------------------------

/**
 * The configured ops-recorder base URL, or undefined when the seam is off.
 * Reads `OPS_RECORDER_URL`; trailing slash stripped for clean path appending.
 */
export function opsRecorderUrl(): string | undefined {
  const raw = process.env.OPS_RECORDER_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '');
}

/**
 * Truthful availability: is `OPS_RECORDER_URL` set?
 * Does NOT probe the live service — a down service degrades per-request.
 */
export function opsRecorderAvailability(): { available: boolean; url?: string } {
  const url = opsRecorderUrl();
  return url ? { available: true, url } : { available: false };
}

// ---------------------------------------------------------------------------
// Fused signal shape: ops-recorder wire → WorkSignalInput fields
// ---------------------------------------------------------------------------

/**
 * The richer `WorkSignalIngest` shape that the Python ops-recorder service
 * publishes. A caller that already has this shape can POST it to the inline
 * `/work-signals` ingress and it will be accepted + forwarded.
 *
 * Required fields match `api/ingest.py::WorkSignalIngest`; optional fields
 * carry contextual metadata that is folded into the inline `detail` string.
 */
export type OpsRecorderIngestShape = {
  /** Signal origin (`github` | `linear` or any string). */
  source: string;
  /** Item type (`pull_request` | `issue` or any string). */
  item_type: string;
  /** Human-readable title of the stuck item. */
  title: string;
  /** Canonical URL of the stuck item. */
  source_url: string;
  /** Why the detector flagged it as stuck. */
  detected_reason: string;
  /** Priority signal (`high` | `medium` | `low`). */
  priority: string;
  // Optional contextual fields
  assignee?: string;
  status?: string;
  why_it_matters?: string;
  recommended_next_action?: string;
};

/**
 * Returns true when `body` carries the fused ops-recorder shape (all required
 * fields present), rather than the native `WorkSignalInput` shape.
 */
export function isOpsRecorderShape(body: unknown): body is OpsRecorderIngestShape {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.source === 'string' &&
    b.source.trim().length > 0 &&
    typeof b.item_type === 'string' &&
    b.item_type.trim().length > 0 &&
    typeof b.title === 'string' &&
    b.title.trim().length > 0 &&
    typeof b.source_url === 'string' &&
    b.source_url.trim().length > 0 &&
    typeof b.detected_reason === 'string' &&
    b.detected_reason.trim().length > 0 &&
    typeof b.priority === 'string' &&
    b.priority.trim().length > 0
  );
}

/**
 * Synthesise the WorkSignalInput required fields from the ops-recorder shape.
 * The fused shape does not carry workspaceId/spaceId/taskId (those are
 * docker-backend concepts); callers supply them alongside the ops-recorder
 * fields, or they are coerced from the source/source_url as stable identifiers.
 *
 * Returns a partial record with `detail` (constructed from the ops-recorder
 * fields) and `reportedBy` (`py/ops-recorder`). The caller must supply the
 * mandatory WorkSignalInput fields (workspaceId, spaceId, taskId).
 */
export function opsRecorderShapeToDetail(shape: OpsRecorderIngestShape): {
  detail: string;
  reportedBy: string;
} {
  const parts: string[] = [
    `[${shape.source}/${shape.item_type}] ${shape.title}`,
    `url:${shape.source_url}`,
    `reason:${shape.detected_reason}`,
    `priority:${shape.priority}`,
  ];
  if (shape.assignee) parts.push(`assignee:${shape.assignee}`);
  if (shape.status) parts.push(`status:${shape.status}`);
  if (shape.why_it_matters) parts.push(`why:${shape.why_it_matters}`);
  if (shape.recommended_next_action) parts.push(`action:${shape.recommended_next_action}`);

  return { detail: parts.join(' | '), reportedBy: 'py/ops-recorder' };
}

// ---------------------------------------------------------------------------
// Forward: inline ingest → ops-recorder Python service
// ---------------------------------------------------------------------------

/** Result of a forward attempt to the ops-recorder service. */
export type OpsRecorderForwardResult =
  | { forwarded: true; signalId: string }
  | { forwarded: false; reason: string };

/**
 * Forward an ops-recorder `WorkSignalIngest` payload to the Python service's
 * `POST /work-signals/ingest` endpoint.
 *
 * Called after the inline ingest completes successfully so the Python service's
 * richer store/pipeline (normalisation, handoff generation, Postgres) also has
 * the signal. Degrade-safe: any error (network, non-2xx, malformed) is logged
 * and returned as `{ forwarded: false }` — it NEVER throws into the caller.
 *
 * Requires `OPS_RECORDER_URL` to be set. When absent, returns
 * `{ forwarded: false, reason: 'OPS_RECORDER_URL not set' }` with no network IO.
 */
export async function forwardToOpsRecorder(
  payload: OpsRecorderIngestShape,
  apiKey?: string,
): Promise<OpsRecorderForwardResult> {
  const base = opsRecorderUrl();
  if (!base) {
    return { forwarded: false, reason: 'OPS_RECORDER_URL not set' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    const res = await fetch(`${base}/work-signals/ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const reason = `ops-recorder HTTP ${res.status}`;
      logger.warn({ status: res.status }, 'ops-recorder forward non-2xx — skipped');
      return { forwarded: false, reason };
    }

    const body = (await res.json()) as { id?: string };
    const signalId = typeof body?.id === 'string' ? body.id : 'unknown';
    logger.info({ signalId }, 'forwarded to ops-recorder');
    return { forwarded: true, signalId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'ops-recorder forward failed';
    logger.warn({ reason }, 'ops-recorder forward failed — skipped (degrade-safe)');
    return { forwarded: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
