/**
 * @module history-validation
 *
 * History-chain validation for the canonical `TaskEnvelope`.
 *
 * A `TaskEnvelope` carries an optional `history` of {@link TaskStateTransition}
 * records describing how the task moved through the canonical lifecycle. When an
 * envelope arrives from a remote A2A peer, that history is untrusted: it may be
 * malformed (wrong shape), discontinuous (a gap in the chain), out of order
 * (non-monotonic timestamps), or contain an illegal transition (for example a
 * terminal state moving back to an active state).
 *
 * {@link validateTaskHistory} asserts that a history is well-formed:
 *   1. **Shape** — every entry has a valid `from`/`to` canonical state, a valid
 *      ISO `transitioned_at` timestamp, and optional string `reason` /
 *      `triggered_by` fields.
 *   2. **Continuity** — each entry's `from` equals the previous entry's `to`, so
 *      the chain is unbroken (no gaps).
 *   3. **Monotonic ordering** — `transitioned_at` never moves backwards between
 *      consecutive entries (equal timestamps are allowed for rapid transitions).
 *   4. **Legal transitions** — every `from -> to` is permitted by the canonical
 *      state machine (`ALLOWED_STATE_TRANSITIONS` / {@link isValidTransition}).
 *
 * The validator is pure and deterministic: no I/O, no clock reads, no mutation
 * of its input. It returns a discriminated result so callers can react to the
 * specific failure reason.
 *
 * @example
 * ```ts
 * import { validateTaskHistory } from '@recoder/a2a-sdk';
 *
 * const result = validateTaskHistory(remoteEnvelope.history);
 * if (!result.ok) {
 *   throw new Error(`Rejected task history: ${result.reason}`);
 * }
 * ```
 */

import {
  type TaskState,
  type TaskStateTransition,
  TASK_STATES,
  isValidTransition,
} from './schemas';

/**
 * Result of {@link validateTaskHistory}.
 *
 * `ok: true` means the history is well-formed. `ok: false` carries a
 * human-readable `reason` describing the first violation encountered.
 */
export type TaskHistoryValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const TASK_STATE_SET: ReadonlySet<string> = new Set<string>(TASK_STATES);

function isTaskState(value: unknown): value is TaskState {
  return typeof value === 'string' && TASK_STATE_SET.has(value);
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

/**
 * Validate that a `TaskEnvelope` history chain is well-formed.
 *
 * Accepts `unknown` because the history typically originates from an untrusted
 * remote peer; every entry is shape-checked at runtime before any structural
 * assertion is made. An absent (`undefined` / `null`) or empty history is
 * treated as vacuously valid — a freshly created envelope has `history: []`.
 *
 * @param history - The `history` field of a `TaskEnvelope` (or any untrusted value).
 * @returns `{ ok: true }` when well-formed, otherwise `{ ok: false, reason }`.
 */
export function validateTaskHistory(history: unknown): TaskHistoryValidationResult {
  if (history === undefined || history === null) {
    // An absent history is vacuously well-formed.
    return { ok: true };
  }

  if (!Array.isArray(history)) {
    return { ok: false, reason: 'history must be an array' };
  }

  let previous: TaskStateTransition | undefined;

  for (let index = 0; index < history.length; index += 1) {
    const entry: unknown = history[index];

    // (a) Shape checks --------------------------------------------------------
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, reason: `history[${index}] must be an object` };
    }

    const record = entry as Record<string, unknown>;

    if (!isTaskState(record.from)) {
      return {
        ok: false,
        reason: `history[${index}].from is not a valid task state`,
      };
    }
    if (!isTaskState(record.to)) {
      return {
        ok: false,
        reason: `history[${index}].to is not a valid task state`,
      };
    }
    if (!isValidTimestamp(record.transitioned_at)) {
      return {
        ok: false,
        reason: `history[${index}].transitioned_at is not a valid ISO timestamp`,
      };
    }
    if (record.reason !== undefined && typeof record.reason !== 'string') {
      return {
        ok: false,
        reason: `history[${index}].reason must be a string when present`,
      };
    }
    if (record.triggered_by !== undefined && typeof record.triggered_by !== 'string') {
      return {
        ok: false,
        reason: `history[${index}].triggered_by must be a string when present`,
      };
    }

    const from = record.from;
    const to = record.to;
    const transitionedAt = record.transitioned_at;

    // (c) Legal transition per the canonical state machine --------------------
    // This also rejects self-loops and any move out of a terminal state, since
    // ALLOWED_STATE_TRANSITIONS lists no successors for terminal states.
    if (!isValidTransition(from, to)) {
      return {
        ok: false,
        reason: `history[${index}] has an illegal transition: ${from} -> ${to}`,
      };
    }

    if (previous) {
      // (b) Continuity — the chain must be unbroken.
      if (from !== previous.to) {
        return {
          ok: false,
          reason: `history[${index}] is discontinuous: expected from="${previous.to}" but got "${from}"`,
        };
      }

      // (b) Monotonic ordering by transitioned_at (non-decreasing).
      if (Date.parse(transitionedAt) < Date.parse(previous.transitioned_at)) {
        return {
          ok: false,
          reason: `history[${index}] is out of order: transitioned_at "${transitionedAt}" precedes "${previous.transitioned_at}"`,
        };
      }
    }

    previous = { from, to, transitioned_at: transitionedAt };
  }

  return { ok: true };
}
