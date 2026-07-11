/**
 * Work-signals ingest — the THIN, IN-PROCESS TS sink for "this workspace is
 * stuck / blocked / needs a handoff" signals on the real product path.
 *
 * INTEGRATION-PLAN §d.4 keeps `py/ops-recorder` as the richer DETECTOR service;
 * this module is the lightweight INGEST it (or any caller) posts a signal to. A
 * signal is:
 *
 *   1. RECORDED to the canonical agent-os state of record as a `handoff`
 *      `RunEvent` on the task's run, so the control plane (and the workspace
 *      events stream) has a truthful, auditable trace of the stuck work — exactly
 *      like every other lifecycle event. Best-effort: if the repository write
 *      fails, the signal is still kept in the in-memory ring and the handoff is
 *      still attempted (record-only fallback, never throw).
 *
 *   2. mirrored to a small in-memory RING so a quick "what's stuck right now?"
 *      read is available without scanning the full event log.
 *
 *   3. used to EMIT a `@recoder/coordination` handoff (intent `handoff`) so a
 *      stuck workspace can be PICKED UP and re-dispatched by another agent.
 *      Idempotent via the durable dedup ledger; degrade-safe (coordination
 *      unavailable → record-only, the handoff is `skipped`, never thrown).
 *
 *   4. [FUSION SEAM] after the inline record+handoff, the signal is optionally
 *      FORWARDED to the Python ops-recorder service (`OPS_RECORDER_URL`) so that
 *      service's richer store, normalisation, and handoff-prompt pipeline also
 *      has the signal. Gated by env flag — when absent, this step is silently
 *      skipped and the existing inline path is UNCHANGED. The forward result is
 *      carried in `RecordedWorkSignal.opsRecorderForward` for auditability.
 *
 * DEGRADE-SAFE end to end: this never throws. The worst case is "recorded only"
 * (handoff skipped, forward skipped) — it never fakes a pickup it could not
 * initiate and never fakes a forward it could not complete.
 */
import { randomUUID } from 'node:crypto';
import { agentOsContainer } from '../agent-os/service-container.js';
import { emitWorkSignalHandoff, type WorkSignalHandoffResult } from './coordination-integration.js';
import { createLogger } from '../logger.js';
import type { RunEvent } from '@recoder/agent-os';
import {
  forwardToOpsRecorder,
  opsRecorderAvailability,
  isOpsRecorderShape,
  opsRecorderShapeToDetail,
  type OpsRecorderForwardResult,
  type OpsRecorderIngestShape,
} from './ops-recorder-adapter.js';

const logger = createLogger('conductor:work-signals');

/** The recognized work-signal kinds. Unknown kinds are coerced to `stuck-work`. */
export const WORK_SIGNAL_KINDS = ['stuck-work', 'blocked', 'needs-handoff'] as const;
export type WorkSignalKind = (typeof WORK_SIGNAL_KINDS)[number];

/** Cap on the in-memory ring so a long-running backend can't grow it unbounded. */
const MAX_SIGNALS = 200;

/** A normalized, validated work signal as accepted by the ingest. */
export type WorkSignalInput = {
  workspaceId: string;
  spaceId: string;
  taskId: string;
  runId?: string;
  kind: WorkSignalKind;
  /** Free-text detail from the detector (why it's stuck). */
  detail?: string;
  /** Who/what reported the signal (e.g. `py/ops-recorder`). */
  reportedBy?: string;
};

/** A recorded work signal: the input plus its server-assigned id + timestamps. */
export type RecordedWorkSignal = WorkSignalInput & {
  signalId: string;
  recordedAt: string;
  /** Whether the signal was persisted to agent-os state (vs. ring-only fallback). */
  recorded: boolean;
  /** The handoff outcome (emitted / duplicate / skipped + reason). */
  handoff: WorkSignalHandoffResult;
  /**
   * The result of forwarding the signal to the Python ops-recorder service
   * (FUSION SEAM §d.4). Present only when `OPS_RECORDER_URL` is set; absent
   * when the seam is off (existing inline path unchanged).
   */
  opsRecorderForward?: OpsRecorderForwardResult;
};

/** In-memory ring of the most recent signals (newest last). Process-local. */
const ring: RecordedWorkSignal[] = [];

/**
 * Validate + normalize a raw ingest body. Returns `{ ok:false, error }` with a
 * caller-facing message on the first missing/invalid field (fail fast at the
 * system boundary), or `{ ok:true, value }` with a normalized signal.
 *
 * FUSION SEAM: also accepts bodies that carry the ops-recorder `WorkSignalIngest`
 * shape (source/item_type/title/source_url/detected_reason/priority) alongside
 * the mandatory WorkSignalInput fields (workspaceId/spaceId/taskId). When detected,
 * the ops-recorder fields are folded into `detail` + `reportedBy` so the signal
 * flows through the exact same inline path — no schema divergence.
 */
export function parseWorkSignal(
  body: unknown,
): { ok: true; value: WorkSignalInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const workspaceId = asNonEmptyString(b.workspaceId);
  if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
  const spaceId = asNonEmptyString(b.spaceId);
  if (!spaceId) return { ok: false, error: 'spaceId is required' };
  const taskId = asNonEmptyString(b.taskId);
  if (!taskId) return { ok: false, error: 'taskId is required' };

  const kindRaw = asNonEmptyString(b.kind);
  // Default/coerce unknown kinds to `stuck-work` — never reject on kind so a
  // detector can always get a signal in (the richest possible read).
  const kind: WorkSignalKind = (WORK_SIGNAL_KINDS as readonly string[]).includes(kindRaw ?? '')
    ? (kindRaw as WorkSignalKind)
    : 'stuck-work';

  const value: WorkSignalInput = { workspaceId, spaceId, taskId, kind };
  const runId = asNonEmptyString(b.runId);
  if (runId) value.runId = runId;

  // Detect the fused ops-recorder shape (FUSION SEAM §d.4).
  // When the body carries ops-recorder fields (source/item_type/title/source_url/
  // detected_reason/priority), fold them into detail+reportedBy so the existing
  // inline path is unchanged — we never branch on shape downstream.
  if (isOpsRecorderShape(b)) {
    const { detail: fusedDetail, reportedBy: fusedReportedBy } = opsRecorderShapeToDetail(b);
    // Fused detail wins over an explicit `detail` field when both are present,
    // since the ops-recorder shape is richer and the caller intentionally sent it.
    value.detail = fusedDetail;
    value.reportedBy = fusedReportedBy;
  } else {
    const detail = asNonEmptyString(b.detail);
    if (detail) value.detail = detail;
    const reportedBy = asNonEmptyString(b.reportedBy);
    if (reportedBy) value.reportedBy = reportedBy;
  }

  return { ok: true, value };
}

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Ingest a work signal: record it to agent-os state + ring, then emit a pickup
 * handoff. NEVER throws — every step is best-effort and degrade-safe, so the
 * worst outcome is "recorded only" (handoff skipped).
 */
export async function ingestWorkSignal(input: WorkSignalInput): Promise<RecordedWorkSignal> {
  const signalId = randomUUID();
  const recordedAt = new Date().toISOString();

  // 1) Record to canonical agent-os state as a `handoff` RunEvent (best-effort).
  const recorded = await recordSignalEvent(input, signalId, recordedAt);

  // 2) Emit the coordination pickup handoff (degrade-safe — record-only on skip).
  let handoff: WorkSignalHandoffResult;
  try {
    handoff = await emitWorkSignalHandoff({
      workspaceId: input.workspaceId,
      spaceId: input.spaceId,
      taskId: input.taskId,
      ...(input.runId ? { runId: input.runId } : {}),
      kind: input.kind,
      ...(handoffPrompt(input) ? { prompt: handoffPrompt(input) } : {}),
    });
  } catch (err) {
    // emitWorkSignalHandoff is already degrade-safe, but never let a surprise
    // throw escape the ingest — the signal is recorded regardless.
    logger.warn({ ...idFields(input), err }, 'work-signal handoff threw at ingest — recorded only');
    handoff = { status: 'skipped', reason: 'handoff-threw' };
  }

  // 3) FUSION SEAM §d.4 — optionally forward to the Python ops-recorder service.
  // This step runs AFTER the inline record+handoff so the inline path is fully
  // independent. When OPS_RECORDER_URL is unset the forward is silently skipped
  // and the result is omitted — the existing inline path is UNCHANGED.
  let opsRecorderForward: OpsRecorderForwardResult | undefined;
  const { available: opsAvailable } = opsRecorderAvailability();
  if (opsAvailable) {
    // Build a best-effort ops-recorder ingest payload from what we have.
    // We coerce the WorkSignalInput fields to the ops-recorder shape; missing
    // source/item_type/title/source_url are synthesised from the available ids.
    const opsPayload = buildOpsRecorderPayload(input);
    opsRecorderForward = await forwardToOpsRecorder(
      opsPayload,
      process.env.OPS_RECORDER_API_KEY,
    );
    logger.info(
      { ...idFields(input), signalId, forwarded: opsRecorderForward.forwarded },
      'ops-recorder forward complete',
    );
  }

  const signal: RecordedWorkSignal = {
    ...input,
    signalId,
    recordedAt,
    recorded,
    handoff,
    ...(opsRecorderForward !== undefined ? { opsRecorderForward } : {}),
  };

  // 4) Mirror to the in-memory ring (newest last, bounded).
  ring.push(signal);
  if (ring.length > MAX_SIGNALS) ring.splice(0, ring.length - MAX_SIGNALS);

  logger.info(
    { ...idFields(input), signalId, recorded, handoff: handoff.status },
    'work signal ingested',
  );
  return signal;
}

/** Build the optional human prompt carried into the handoff from the signal detail. */
function handoffPrompt(input: WorkSignalInput): string | undefined {
  if (!input.detail) return undefined;
  return (
    `Workspace ${input.workspaceId} reported "${input.kind}" on task ${input.taskId}: ` +
    `${input.detail}. Pick up the stuck work and re-dispatch.`
  );
}

/**
 * Build a best-effort ops-recorder ingest payload from a WorkSignalInput.
 *
 * The ops-recorder service expects source/item_type/title/source_url/detected_reason/
 * priority. We synthesise these from the inline signal fields, using the kind
 * and detail as the detected reason and coercing a recoder:// URL from the ids.
 * This is purely additive — the forward is best-effort and degrade-safe.
 */
function buildOpsRecorderPayload(input: WorkSignalInput): OpsRecorderIngestShape {
  return {
    source: 'recoder',
    item_type: 'workspace',
    title: input.detail
      ? `${input.kind}: ${input.detail.slice(0, 120)}`
      : `workspace ${input.workspaceId} — ${input.kind}`,
    source_url: `recoder://workspaces/${input.workspaceId}/tasks/${input.taskId}`,
    detected_reason: input.detail ?? input.kind,
    priority: kindToPriority(input.kind),
    ...(input.reportedBy ? { why_it_matters: `Reported by ${input.reportedBy}` } : {}),
  };
}

/** Map a work-signal kind to an ops-recorder priority string. */
function kindToPriority(kind: string): string {
  if (kind === 'blocked') return 'high';
  if (kind === 'needs-handoff') return 'medium';
  return 'low'; // 'stuck-work' and unknown → low (the detector decides real priority)
}

/**
 * Append the signal to the canonical event log as a `handoff` RunEvent. Returns
 * `true` on a successful persist, `false` on any failure (the caller falls back
 * to the ring-only record — truthful, never a fake persist).
 */
async function recordSignalEvent(
  input: WorkSignalInput,
  signalId: string,
  recordedAt: string,
): Promise<boolean> {
  try {
    const event: RunEvent = {
      eventId: signalId,
      type: 'handoff',
      taskId: input.taskId,
      ...(input.runId ? { runId: input.runId } : {}),
      agentId: input.workspaceId,
      message: `work-signal:${input.kind}${input.detail ? ` — ${input.detail}` : ''}`,
      createdAt: recordedAt,
      data: {
        workSignal: true,
        kind: input.kind,
        workspaceId: input.workspaceId,
        spaceId: input.spaceId,
        ...(input.detail ? { detail: input.detail } : {}),
        ...(input.reportedBy ? { reportedBy: input.reportedBy } : {}),
      },
    };
    await Promise.resolve(agentOsContainer.repository.appendEvent(event));
    return true;
  } catch (err) {
    logger.warn(
      { ...idFields(input), err },
      'work signal not persisted to agent-os state — kept in ring only (record-only)',
    );
    return false;
  }
}

function idFields(input: WorkSignalInput): Record<string, string> {
  return { workspaceId: input.workspaceId, spaceId: input.spaceId, taskId: input.taskId };
}

/**
 * List recently-ingested work signals (newest first), optionally filtered by
 * `taskId` / `workspaceId`. Process-local view over the in-memory ring; the
 * durable record is the agent-os event log.
 */
export function listWorkSignals(filter?: {
  taskId?: string;
  workspaceId?: string;
  limit?: number;
}): RecordedWorkSignal[] {
  let out = [...ring].reverse();
  if (filter?.taskId) out = out.filter((s) => s.taskId === filter.taskId);
  if (filter?.workspaceId) out = out.filter((s) => s.workspaceId === filter.workspaceId);
  const limit = filter?.limit && filter.limit > 0 ? filter.limit : undefined;
  return limit ? out.slice(0, limit) : out;
}

/** Test-only: clear the in-memory ring so cases don't bleed into each other. */
export function _resetWorkSignalsForTest(): void {
  ring.length = 0;
}
