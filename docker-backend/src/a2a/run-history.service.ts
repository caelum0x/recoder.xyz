/**
 * @module run-history.service
 *
 * Workspace / run-level **unified history** read-model. Where
 * {@link buildTaskTimeline} projects a single task's product path
 * (task -> artifact -> pr -> preview -> approval), this layer aggregates the
 * full picture of a *run* — every task in a workspace plus the surrounding
 * audit events and human approvals — into one ordered, queryable stream that
 * both PM (`recoder-pm`) and Agents (`recoder-agents`) consume identically.
 *
 * Design constraints (matching the task-timeline read-model it builds on):
 *
 *  - **No new storage.** Every entry is derived from existing sources:
 *      • task envelopes (lifecycle + result artifacts/PR/preview links),
 *      • the in-memory audit trail (`getRecentAuditEvents`),
 *      • the approval gate (`listForWorkspace`).
 *  - **Reuse, don't duplicate.** Per-task lifecycle/artifact/pr/preview events
 *    come straight from {@link buildTaskTimeline}; this module merely merges,
 *    enriches (prompt/assignee), and orders them across tasks, then folds in
 *    audit decisions and logs.
 *  - **Pure & testable.** The core projection {@link buildRunHistory} takes
 *    already-fetched inputs and returns a plain value, so it is trivially
 *    unit-testable without touching singletons.
 *
 * The output is intentionally flat and presentation-oriented so that any
 * surface can render the run history (a vertical activity feed grouped by task)
 * without understanding the underlying A2A schemas.
 */

import type { TaskEnvelope, ApprovalRequest, AuditEvent } from '@recoder/shared/a2a';
import {
  buildTaskTimeline,
  type TimelineEvent,
  type TimelineEventStatus,
} from './task-timeline.service';
import { extractApprovalTaskId } from './approval-gate.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The category of a unified run-history entry. Extends the per-task timeline
 * vocabulary with run-level lanes that only make sense when aggregating across
 * tasks: `audit` (a recorded decision/log) and `decision` (a policy outcome).
 */
export type RunHistoryEntryType =
  | 'task'
  | 'artifact'
  | 'pr'
  | 'preview'
  | 'approval'
  | 'audit'
  | 'decision';

/** UI-normalized status, reusing the task-timeline vocabulary. */
export type RunHistoryEntryStatus = TimelineEventStatus;

/**
 * A single entry in the unified run history. Flat and presentation-oriented:
 * consumers render these directly. Each entry is attributed to its source task
 * (when known) so a UI can group the stream by task while still showing one
 * continuous, ordered run timeline.
 */
export interface RunHistoryEntry {
  /** Stable identifier for this entry within the run history. */
  id: string;
  /** Entry category, used to pick an icon / lane in the UI. */
  type: RunHistoryEntryType;
  /** Short human-readable label. */
  title: string;
  /** ISO-8601 timestamp used for ordering. */
  timestamp: string;
  /** UI-normalized status. */
  status: RunHistoryEntryStatus;
  /** The task this entry belongs to, if any (enables grouping). */
  taskId?: string;
  /** Optional link to the underlying artifact / PR / preview / approval. */
  url?: string;
  /** Optional actor display (e.g. who triggered an audit/decision event). */
  actor?: string;
}

/**
 * Per-task summary header included alongside the merged stream so a surface can
 * render a grouped view (one card per task) without re-deriving these fields.
 */
export interface RunHistoryTaskSummary {
  taskId: string;
  /** The originating prompt for the task, if one is present in its payload. */
  prompt?: string;
  /** The agent assigned to the task. */
  assignee?: string;
  /** The agent that requested the task. */
  requester?: string;
  /** Current task lifecycle state. */
  state: string;
  threadId: string;
  traceId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Caps applied by the *caller* when fetching the upstream sources (task
 * envelopes / audit events). Surfaced back to consumers so they can detect when
 * the underlying fetch — not just the response `limit` — was capped and may
 * therefore be incomplete.
 */
export interface RunHistorySourceCaps {
  /** Max task envelopes fetched for the workspace, and whether the cap was hit. */
  tasks?: { limit: number; capped: boolean };
  /** Max audit events fetched, and whether the cap was hit. */
  auditEvents?: { limit: number; capped: boolean };
}

/** Truncation / completeness indicators for a run-history projection. */
export interface RunHistoryMeta {
  /** Total merged entries before type/since/limit narrowing. */
  totalEntries: number;
  /** Entries after type/since narrowing but before the `limit` slice. */
  matchedEntries: number;
  /** Entries actually returned after the `limit` slice. */
  returnedEntries: number;
  /** True when the `limit` filter dropped entries from the response. */
  truncated: boolean;
  /** Upstream fetch caps applied by the caller, if any were reported. */
  sourceCaps?: RunHistorySourceCaps;
}

/** The full unified run-history projection for a workspace / run. */
export interface RunHistory {
  workspaceId: string;
  /** Per-task summaries (prompt, assignee, state, ...). */
  tasks: RunHistoryTaskSummary[];
  /** Ordered, merged history entries across all tasks (oldest first). */
  entries: RunHistoryEntry[];
  /** Truncation / completeness indicators (caps, counts). */
  meta: RunHistoryMeta;
}

/** Optional filters for narrowing a run-history projection. */
export interface RunHistoryFilter {
  /** Restrict to a single task (run) within the workspace. */
  taskId?: string;
  /** Restrict to a subset of entry types. */
  types?: readonly RunHistoryEntryType[];
  /** Only include entries at or after this ISO-8601 timestamp. */
  since?: string;
  /** Cap the number of returned entries (newest-trimmed, ordering preserved). */
  limit?: number;
  /**
   * Caps the caller applied when fetching upstream sources (task envelopes /
   * audit events). Reported back via {@link RunHistoryMeta.sourceCaps} so
   * consumers can detect a capped/incomplete fetch.
   */
  sourceCaps?: RunHistorySourceCaps;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map an audit severity onto a UI-normalized status. */
function auditSeverityToStatus(severity: AuditEvent['severity']): RunHistoryEntryStatus {
  switch (severity) {
    case 'error':
    case 'critical':
      return 'failed';
    case 'warning':
      return 'pending';
    case 'info':
    default:
      return 'success';
  }
}

/**
 * Pull the originating prompt out of a task envelope's payload. The payload may
 * be a single part or an array of parts, and the prompt may live under a few
 * common key variants. Returns the first non-empty string found.
 */
function extractPrompt(payload: TaskEnvelope['payload']): string | undefined {
  const parts: unknown[] = Array.isArray(payload) ? payload : [payload];
  for (const part of parts) {
    if (typeof part === 'string') {
      if (part.trim().length > 0) return part;
      continue;
    }
    if (!part || typeof part !== 'object') continue;
    const bag = part as Record<string, unknown>;
    const candidate =
      (bag.kind === 'text' ? bag.text : undefined) ??
      bag.prompt ??
      bag.task ??
      bag.message ??
      bag.content;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

/** Build the per-task summary header from an envelope. */
function toTaskSummary(envelope: TaskEnvelope): RunHistoryTaskSummary {
  return {
    taskId: envelope.id,
    prompt: extractPrompt(envelope.payload),
    assignee: envelope.assignee?.agent_id,
    requester: envelope.requester?.agent_id,
    state: envelope.state,
    threadId: envelope.thread_id,
    traceId: envelope.trace_id,
    createdAt: envelope.created_at,
    updatedAt: envelope.updated_at,
  };
}

/** Convert a per-task timeline event into a run-history entry. */
function timelineEventToEntry(event: TimelineEvent, taskId: string): RunHistoryEntry {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    timestamp: event.timestamp,
    status: event.status,
    taskId,
    ...(event.url ? { url: event.url } : {}),
  };
}

/** Convert an audit event into a run-history entry. */
function auditEventToEntry(event: AuditEvent): RunHistoryEntry {
  // Policy outcomes are surfaced as a distinct "decision" lane so the run
  // history makes the *why* of an action visible alongside the *what*.
  const isDecision = event.policy !== undefined;
  const title = event.policy
    ? `Decision: ${event.policy.action} ${event.policy.approved ? 'approved' : 'denied'}`
    : `Audit: ${event.event_type}`;

  return {
    id: `audit:${event.id}`,
    type: isDecision ? 'decision' : 'audit',
    title,
    timestamp: event.timestamp,
    status: event.policy
      ? event.policy.approved
        ? 'success'
        : 'failed'
      : auditSeverityToStatus(event.severity),
    ...(event.task_id ? { taskId: event.task_id } : {}),
    ...(event.actor?.id ? { actor: event.actor.name ?? event.actor.id } : {}),
  };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Build the unified run history for a workspace by merging:
 *
 *   1. per-task timelines (reusing {@link buildTaskTimeline}) — lifecycle,
 *      artifacts, PR, preview and per-task approval events;
 *   2. workspace audit events — decisions and logs not already represented;
 *   3. (per-task approvals are passed through {@link buildTaskTimeline} so they
 *      appear in the task lanes; workspace-level approvals with no resolvable
 *      task id are still attributed via their details bag).
 *
 * The function is pure: all sources are passed in already-fetched, so it can be
 * unit-tested without any singletons.
 *
 * @param workspaceId  The workspace (run scope) being projected.
 * @param envelopes    Task envelopes belonging to the workspace.
 * @param approvals    Approval-gate requests scoped to the workspace.
 * @param auditEvents  Recent audit events (workspace-scoped or global; filtered
 *                     to the workspace here).
 * @param filter       Optional narrowing (single task, types, since, limit).
 */
export function buildRunHistory(
  workspaceId: string,
  envelopes: readonly TaskEnvelope[],
  approvals: readonly ApprovalRequest[] = [],
  auditEvents: readonly AuditEvent[] = [],
  filter: RunHistoryFilter = {},
): RunHistory {
  const sourceCaps = filter.sourceCaps;

  const scopedEnvelopes = envelopes.filter(
    (e) => e.workspace_id === workspaceId && (!filter.taskId || e.id === filter.taskId),
  );

  // Group approvals by their originating task id so each task's timeline only
  // receives its own approvals (keeps per-task lanes clean).
  const approvalsByTask = new Map<string, ApprovalRequest[]>();
  for (const approval of approvals) {
    if (approval.workspaceId !== workspaceId) continue;
    const taskId = extractApprovalTaskId(approval);
    if (!taskId) continue;
    const bucket = approvalsByTask.get(taskId) ?? [];
    bucket.push(approval);
    approvalsByTask.set(taskId, bucket);
  }

  const tasks: RunHistoryTaskSummary[] = [];
  const entries: RunHistoryEntry[] = [];

  // --- per-task timelines (reuse buildTaskTimeline) ----------------------
  for (const envelope of scopedEnvelopes) {
    tasks.push(toTaskSummary(envelope));
    const timeline = buildTaskTimeline(envelope, approvalsByTask.get(envelope.id) ?? []);
    for (const event of timeline.events) {
      entries.push(timelineEventToEntry(event, envelope.id));
    }
  }

  // --- workspace audit events (decisions + logs) -------------------------
  // Only include events for this workspace. When a single task is requested,
  // also restrict audit events to that task (events without a task id are
  // dropped from a task-scoped view, since they cannot be attributed to it).
  const taskIdSet = new Set(scopedEnvelopes.map((e) => e.id));
  for (const event of auditEvents) {
    if (event.workspace_id !== workspaceId) continue;
    if (filter.taskId) {
      if (event.task_id !== filter.taskId) continue;
    } else if (event.task_id && !taskIdSet.has(event.task_id)) {
      // Audit event references a task outside this workspace projection — skip.
      continue;
    }
    entries.push(auditEventToEntry(event));
  }

  // --- ordering & filtering ----------------------------------------------
  // Sort a copy: never mutate the accumulated `entries` array in place.
  let ordered = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Total merged entries before type/since/limit narrowing — used to surface a
  // truncation indicator to consumers.
  const totalBeforeFilters = ordered.length;

  if (filter.types && filter.types.length > 0) {
    const allowed = new Set<RunHistoryEntryType>(filter.types);
    ordered = ordered.filter((e) => allowed.has(e.type));
  }

  if (filter.since) {
    const since = filter.since;
    ordered = ordered.filter((e) => e.timestamp.localeCompare(since) >= 0);
  }

  // Number of entries after type/since narrowing but before the limit slice.
  const matchedEntries = ordered.length;

  if (typeof filter.limit === 'number' && filter.limit >= 0) {
    // Keep the most recent `limit` entries while preserving chronological order.
    ordered = ordered.slice(Math.max(0, ordered.length - filter.limit));
  }

  return {
    workspaceId,
    tasks: filter.taskId ? tasks.filter((t) => t.taskId === filter.taskId) : tasks,
    entries: ordered,
    meta: {
      totalEntries: totalBeforeFilters,
      matchedEntries,
      returnedEntries: ordered.length,
      // True when the returned set is narrower than the matched set due to the
      // `limit` filter — consumers can detect the cap and page/refine.
      truncated: ordered.length < matchedEntries,
      ...(sourceCaps ? { sourceCaps } : {}),
    },
  };
}
