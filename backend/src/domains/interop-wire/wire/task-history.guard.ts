/**
 * `task-history.guard` — validates any UNTRUSTED task-history projection carried
 * inside an admitted A2A domain-envelope payload, wiring the a2a-sdk's
 * `validateTaskHistory` (shape → continuity → monotonic ordering → legal
 * transitions) at the ingress boundary where remote/runtime-reported state
 * enters Recoder.
 *
 * A remote peer or runtime that reports a task projection can attach a
 * `history` chain (the canonical `TaskEnvelope.history` shape, or a
 * `tasks/get`-style `{ task: { history } }` projection). That chain is
 * attacker-choosable: a forged/discontinuous/illegal chain must be REJECTED at
 * admission, never persisted or served back as truth. Payloads that carry no
 * history projection are untouched (vacuously valid) — this guard only fires on
 * the fields it understands, so ordinary `message/send` payloads are unaffected.
 *
 * Pure and fail-closed: no I/O, never throws on hostile input; a malformed
 * chain yields `{ ok: false, reason }` for the gates to map onto a 400 deny.
 */
import { validateTaskHistory } from '@recoder/a2a-sdk';

/** Stable rejection code the ingress gates surface for a malformed chain. */
export const TASK_HISTORY_INVALID_CODE = 'task_history_invalid';

/** Result of checking a payload's task-history projections. */
export type TaskHistoryCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const OK: TaskHistoryCheck = { ok: true };

/** Extract the candidate `history` value at `container.history`, if present. */
function historyOf(container: unknown): unknown {
  if (typeof container !== 'object' || container === null) return undefined;
  return (container as Record<string, unknown>).history;
}

/**
 * Check every task-history projection carried in an admitted domain-envelope
 * payload. Recognized carriers (all optional — absent ⇒ vacuously valid):
 *
 *   - `payload.history`        — the payload IS a task projection / `TaskEnvelope`.
 *   - `payload.task.history`   — a `tasks/get`-style `{ task, … }` projection.
 *
 * Returns `{ ok: false, reason }` on the FIRST malformed chain encountered.
 */
export function checkPayloadTaskHistory(payload: unknown): TaskHistoryCheck {
  if (typeof payload !== 'object' || payload === null) return OK;
  const record = payload as Record<string, unknown>;

  const direct = historyOf(record);
  if (direct !== undefined) {
    const result = validateTaskHistory(direct);
    if (!result.ok) return { ok: false, reason: `payload.history rejected: ${result.reason}` };
  }

  const nested = historyOf(record.task);
  if (nested !== undefined) {
    const result = validateTaskHistory(nested);
    if (!result.ok) return { ok: false, reason: `payload.task.history rejected: ${result.reason}` };
  }

  return OK;
}
