/**
 * @module task-timeline.service
 *
 * Read-only aggregator that projects a unified, ordered timeline for a single
 * task / run by reading from **existing** history sources. It introduces no
 * new storage: every event is derived from the canonical `TaskEnvelope`
 * (lifecycle history, result artifacts, embedded PR / preview URLs) and from
 * the {@link ApprovalGateService} (human approval gates).
 *
 * The timeline makes the product path visible end-to-end:
 *
 *   task -> artifact -> pr -> preview -> approval
 *
 * Each entry is a {@link TimelineEvent} with a stable, UI-friendly shape:
 * `{ id, type, title, timestamp, url?, status }`. Consumers (e.g. the `app`
 * dashboard stepper) render these directly without needing to understand the
 * underlying A2A schemas.
 */

import type { TaskEnvelope, TaskArtifact } from '@recoder/shared/a2a';
import type { ApprovalRequest } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The category of a unified timeline event. */
export type TimelineEventType = 'task' | 'artifact' | 'pr' | 'preview' | 'approval';

/**
 * UI-normalized status. Maps the various underlying states (task lifecycle
 * states, approval statuses) onto a small, render-friendly vocabulary.
 */
export type TimelineEventStatus =
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'failed'
  | 'cancelled';

/**
 * A single entry in the unified task timeline. Intentionally flat and
 * presentation-oriented so the dashboard can render a vertical stepper without
 * any A2A-schema knowledge.
 */
export interface TimelineEvent {
  /** Stable identifier for this event within the timeline. */
  id: string;
  /** Event category, used to pick an icon / lane in the UI. */
  type: TimelineEventType;
  /** Short human-readable label. */
  title: string;
  /** ISO-8601 timestamp used for ordering. */
  timestamp: string;
  /** Optional link to the underlying artifact / PR / preview / approval. */
  url?: string;
  /** UI-normalized status. */
  status: TimelineEventStatus;
}

/** The full timeline projection for a task. */
export interface TaskTimeline {
  taskId: string;
  workspaceId: string;
  threadId: string;
  traceId: string;
  /** Current task state (raw lifecycle state). */
  state: string;
  /** Ordered timeline events (oldest first). */
  events: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a raw task lifecycle state onto a UI-normalized status. */
function lifecycleStateToStatus(state: string): TimelineEventStatus {
  switch (state) {
    case 'submitted':
      return 'pending';
    case 'working':
    case 'input-required':
      return 'in_progress';
    case 'completed':
      return 'success';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

/** Map an approval status onto a UI-normalized status. */
function approvalStatusToStatus(status: ApprovalRequest['status']): TimelineEventStatus {
  switch (status) {
    case 'granted':
      return 'success';
    case 'rejected':
      return 'failed';
    case 'expired':
      return 'cancelled';
    case 'escalated':
    case 'pending':
    default:
      return 'pending';
  }
}

/**
 * Pull a URL value out of a loosely-typed bag (metadata or result.data),
 * checking a list of common key variants. Returns the first non-empty string.
 */
function firstUrl(
  bag: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!bag) return undefined;
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

const PR_URL_KEYS = ['prUrl', 'pr_url', 'pullRequestUrl', 'pull_request_url', 'pullRequest'] as const;
const PREVIEW_URL_KEYS = [
  'previewUrl',
  'preview_url',
  'preview',
  'deployUrl',
  'deploy_url',
  'deploymentUrl',
] as const;

/** Extract a human-readable label for an artifact. */
function artifactTitle(artifact: TaskArtifact, index: number): string {
  if (artifact.path) return artifact.path;
  if (artifact.key) return artifact.key;
  return `${artifact.artifact_type || 'artifact'} #${index + 1}`;
}

/** Read an optional inline URL stored on an artifact's metadata. */
function artifactUrl(artifact: TaskArtifact): string | undefined {
  return firstUrl(artifact.metadata, ['url', 'href', 'link']);
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Build the unified timeline for a task envelope.
 *
 * @param envelope  The canonical task envelope (source of lifecycle + result).
 * @param approvals Approval-gate requests scoped to the task's workspace.
 *                  Already-filtered approvals are accepted so this function
 *                  stays pure and easy to test.
 */
export function buildTaskTimeline(
  envelope: TaskEnvelope,
  approvals: readonly ApprovalRequest[] = [],
): TaskTimeline {
  const events: TimelineEvent[] = [];

  // --- task lifecycle events --------------------------------------------
  // Seed with creation, then one event per recorded transition. This gives
  // the "task" lane its full progression without duplicating storage.
  events.push({
    id: `${envelope.id}:task:created`,
    type: 'task',
    title: 'Task created',
    timestamp: envelope.created_at,
    status: 'pending',
  });

  for (const [i, transition] of (envelope.history ?? []).entries()) {
    events.push({
      id: `${envelope.id}:task:${i}`,
      type: 'task',
      title: transition.reason
        ? `Task ${transition.to}: ${transition.reason}`
        : `Task ${transition.to}`,
      timestamp: transition.transitioned_at,
      status: lifecycleStateToStatus(transition.to),
    });
  }

  // --- artifact events ---------------------------------------------------
  const artifacts = envelope.result?.artifacts ?? [];
  const artifactTimestamp = envelope.updated_at;
  for (const [i, artifact] of artifacts.entries()) {
    events.push({
      id: `${envelope.id}:artifact:${artifact.key || i}`,
      type: 'artifact',
      title: `Artifact: ${artifactTitle(artifact, i)}`,
      timestamp: artifactTimestamp,
      url: artifactUrl(artifact),
      status: 'success',
    });
  }

  // --- PR event ----------------------------------------------------------
  // The envelope may carry a PR URL either on metadata (set when the task is
  // dispatched) or on result.data (set when the connector reports back).
  const prUrl =
    firstUrl(envelope.metadata, PR_URL_KEYS) ??
    firstUrl(envelope.result?.data, PR_URL_KEYS);
  if (prUrl) {
    events.push({
      id: `${envelope.id}:pr`,
      type: 'pr',
      title: 'Pull request opened',
      timestamp: envelope.updated_at,
      url: prUrl,
      status: envelope.state === 'completed' ? 'success' : 'in_progress',
    });
  }

  // --- preview event -----------------------------------------------------
  const previewUrl =
    firstUrl(envelope.metadata, PREVIEW_URL_KEYS) ??
    firstUrl(envelope.result?.data, PREVIEW_URL_KEYS);
  if (previewUrl) {
    events.push({
      id: `${envelope.id}:preview`,
      type: 'preview',
      title: 'Preview deployed',
      timestamp: envelope.updated_at,
      url: previewUrl,
      status: 'success',
    });
  }

  // --- approval events ---------------------------------------------------
  for (const approval of approvals) {
    events.push({
      id: `${envelope.id}:approval:${approval.approvalId}`,
      type: 'approval',
      title: `Approval: ${approval.action}`,
      timestamp: approval.resolvedAt ?? approval.createdAt,
      status: approvalStatusToStatus(approval.status),
    });
  }

  // Stable chronological ordering (oldest first). Falls back to insertion
  // order for ties via a stable sort.
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    taskId: envelope.id,
    workspaceId: envelope.workspace_id,
    threadId: envelope.thread_id,
    traceId: envelope.trace_id,
    state: envelope.state,
    events,
  };
}
