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
 * DEGRADE-SAFE end to end: this never throws. The worst case is "recorded only"
 * (handoff skipped) — it never fakes a pickup it could not initiate.
 */
import { randomUUID } from 'node:crypto';
import { agentOsContainer } from '../agent-os/service-container.js';
import { emitWorkSignalHandoff, type WorkSignalHandoffResult } from './coordination-integration.js';
import { createLogger } from '../logger.js';
import type { RunEvent } from '@recoder/agent-os';

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
};

/** In-memory ring of the most recent signals (newest last). Process-local. */
const ring: RecordedWorkSignal[] = [];

/**
 * Validate + normalize a raw ingest body. Returns `{ ok:false, error }` with a
 * caller-facing message on the first missing/invalid field (fail fast at the
 * system boundary), or `{ ok:true, value }` with a normalized signal.
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
  const detail = asNonEmptyString(b.detail);
  if (detail) value.detail = detail;
  const reportedBy = asNonEmptyString(b.reportedBy);
  if (reportedBy) value.reportedBy = reportedBy;
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

  const signal: RecordedWorkSignal = { ...input, signalId, recordedAt, recorded, handoff };

  // 3) Mirror to the in-memory ring (newest last, bounded).
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
