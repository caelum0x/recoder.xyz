/**
 * @module task-envelope
 *
 * Canonical TaskEnvelope schema for the Recoder A2A control plane.
 *
 * A TaskEnvelope is the top-level wrapper that carries a task through the
 * entire lifecycle -- from submission by a requester agent, through execution
 * by an assignee agent, to terminal completion/failure/cancellation.
 *
 * Every envelope is scoped to a workspace + thread and carries an
 * OpenTelemetry-compatible trace_id so that downstream consumers (audit,
 * observability, billing) can correlate events end-to-end.
 *
 * Consumed by: codex adapter, claude adapter, control-plane orchestrator,
 * audit-log service, billing metering.
 *
 * @example
 * ```ts
 * import type { TaskEnvelope } from '@recoder/shared/a2a/schemas';
 *
 * const envelope: TaskEnvelope = {
 *   envelope_version: TASK_ENVELOPE_VERSION,
 *   id: 'task_01HXYZ',
 *   workspace_id: 'ws_abc',
 *   thread_id: 'thr_def',
 *   trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   state: TaskStateEnum.Submitted,
 *   connector: { platform: 'codex', protocol: 'jsonrpc', connector_id: 'codex-v1' },
 *   requester: { agent_id: 'agent-pm', platform: 'recoder_pm' },
 *   assignee:  { agent_id: 'agent-codex', platform: 'codex' },
 *   payload: { kind: 'text', text: 'Implement the auth flow' },
 *   created_at: '2026-02-24T10:00:00.000Z',
 *   updated_at: '2026-02-24T10:00:00.000Z',
 * };
 * ```
 */

import type { RecoderAgentPlatform, RecoderPayload } from '../types';
import type { A2AProtocolKind, TaskState as ControlPlaneTaskState } from '../control-plane';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Current version of the TaskEnvelope schema. */
export const TASK_ENVELOPE_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Task State
// ---------------------------------------------------------------------------

/**
 * Re-export the canonical task state type from the control plane.
 * This ensures a single source of truth for the state union.
 */
export type TaskState = ControlPlaneTaskState;

/**
 * Named-access enum for task state values.
 *
 * Lifecycle:
 * ```
 * submitted -> working -> completed
 *                |     -> failed
 *                |     -> cancelled
 *                +---> input-required -> working (loop)
 * ```
 *
 * These values are identical to the `TaskState` union from the control plane,
 * but exposed as a const object for ergonomic named access:
 * ```ts
 * if (envelope.state === TaskStateEnum.Completed) { ... }
 * ```
 */
export const TaskStateEnum = {
  /** Task has been created and is awaiting execution. */
  Submitted: 'submitted' as const satisfies TaskState,
  /** Task is actively being processed by the assignee agent. */
  Working: 'working' as const satisfies TaskState,
  /** The assignee needs additional input before it can continue. */
  InputRequired: 'input-required' as const satisfies TaskState,
  /** Task finished successfully. */
  Completed: 'completed' as const satisfies TaskState,
  /** Task terminated with an error. */
  Failed: 'failed' as const satisfies TaskState,
  /** Task was explicitly cancelled by a requester or operator. */
  Cancelled: 'cancelled' as const satisfies TaskState,
} as const;

/** Ordered list of all task states (useful for validation). */
export const TASK_STATES: readonly TaskState[] = [
  TaskStateEnum.Submitted,
  TaskStateEnum.Working,
  TaskStateEnum.InputRequired,
  TaskStateEnum.Completed,
  TaskStateEnum.Failed,
  TaskStateEnum.Cancelled,
] as const;

/** Set of terminal states -- once a task reaches one of these it cannot transition further. */
export const TERMINAL_TASK_STATES: ReadonlySet<TaskState> = new Set<TaskState>([
  TaskStateEnum.Completed,
  TaskStateEnum.Failed,
  TaskStateEnum.Cancelled,
]);

/**
 * Returns true when the given state is a terminal state.
 *
 * @param state - The task state to check.
 */
export function isTerminalState(state: TaskState): boolean {
  return TERMINAL_TASK_STATES.has(state);
}

// ---------------------------------------------------------------------------
// Task State Transition
// ---------------------------------------------------------------------------

/**
 * A record of a state transition that occurred during the task lifecycle.
 * Stored in `TaskEnvelope.history` to provide a full audit trail of state
 * changes without requiring a separate event query.
 */
export interface TaskStateTransition {
  /** The state the task moved from. */
  from: TaskState;
  /** The state the task moved to. */
  to: TaskState;
  /** ISO-8601 timestamp of the transition. */
  transitioned_at: string;
  /** Optional human/agent-readable reason for the transition. */
  reason?: string;
  /** ID of the actor (agent or user) that triggered the transition. */
  triggered_by?: string;
}

// ---------------------------------------------------------------------------
// Connector Info
// ---------------------------------------------------------------------------

/**
 * Describes which connector/adapter is responsible for executing the task.
 * This links the task to the UACB connector layer (codex adapter, claude
 * adapter, etc.).
 */
export interface TaskConnectorInfo {
  /** The agent platform this connector targets. */
  platform: RecoderAgentPlatform;
  /** The wire protocol used by this connector. */
  protocol: A2AProtocolKind;
  /** Unique identifier of the connector instance. */
  connector_id: string;
  /** Optional human-readable name for the connector. */
  name?: string;
  /** Connector-specific metadata (e.g. endpoint URL, model name). */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent Reference
// ---------------------------------------------------------------------------

/**
 * A lightweight reference to an agent involved in the task.
 * Unlike the full `RecoderAgentIdentity`, this is a minimal pointer suitable
 * for embedding inside envelopes without duplicating the full agent card.
 */
export interface TaskAgentRef {
  /** The agent's unique identifier in the registry. */
  agent_id: string;
  /** The platform the agent belongs to. */
  platform: RecoderAgentPlatform;
  /** Optional human-readable display name. */
  name?: string;
  /** Optional instance identifier when multiple instances of the same agent exist. */
  instance_id?: string;
}

// ---------------------------------------------------------------------------
// Task Result
// ---------------------------------------------------------------------------

/**
 * A canonical link to a deployed preview produced by a task execution
 * (e.g. a Daytona preview URL or a published web build).
 */
export interface TaskPreviewLink {
  /** The preview URL. */
  url: string;
  /** Optional human-readable label for the preview. */
  label?: string;
}

/**
 * The result of a completed (or failed) task.
 * Only present when the task reaches a terminal state.
 */
export interface TaskResult {
  /** Plain text summary of the result. */
  text?: string;
  /** Structured data returned by the connector. */
  data?: Record<string, unknown>;
  /** Artifacts produced during execution (patches, files, reports). */
  artifacts?: TaskArtifact[];
  /** Canonical preview links produced during execution. */
  preview?: TaskPreviewLink[];
}

/**
 * An artifact produced by a task execution.
 */
export interface TaskArtifact {
  /** A unique key for this artifact within the task. */
  key: string;
  /** The type of artifact. */
  artifact_type: 'patch' | 'file' | 'plan' | 'report' | 'log' | 'custom';
  /** MIME type of the content. */
  mime_type: string;
  /** The artifact content (inline). */
  content: string;
  /** Optional file path when the artifact represents a file. */
  path?: string;
  /** Optional metadata about the artifact. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy Snapshot
// ---------------------------------------------------------------------------

/**
 * A snapshot of the policy decision that was made when the task was submitted.
 * Embedded inside the envelope so that downstream consumers can see what was
 * approved (or denied) without querying the policy plane separately.
 */
export interface TaskPolicySnapshot {
  /** The policy action that was checked (e.g. 'file:write', 'bash:exec'). */
  action: string;
  /** Whether the action was approved. */
  approved: boolean;
  /** The rule that was applied ('auto', 'prompt', 'deny'). */
  rule: string;
  /** Human-readable reason for the decision. */
  reason: string;
  /** ISO-8601 timestamp of the policy check. */
  checked_at: string;
}

// ---------------------------------------------------------------------------
// Error Info
// ---------------------------------------------------------------------------

/**
 * Structured error information attached to a failed task.
 * Uses the canonical error taxonomy defined in `./error-taxonomy.ts`.
 */
export interface TaskErrorInfo {
  /** Machine-readable error code from the taxonomy. */
  code: string;
  /** Error category from the taxonomy. */
  category: string;
  /** Human-readable error message. */
  message: string;
  /** Error severity. */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Whether the operation can be retried. */
  retryable: boolean;
  /** Additional details about the error. */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// TaskEnvelope
// ---------------------------------------------------------------------------

/**
 * The canonical TaskEnvelope -- the top-level schema that wraps every task
 * flowing through the Recoder A2A control plane.
 *
 * Design principles:
 * 1. **Self-describing**: Carries its own version so consumers can handle
 *    schema evolution.
 * 2. **Trace-aware**: Every envelope has a `trace_id` for distributed tracing.
 * 3. **Workspace-scoped**: `workspace_id` + `thread_id` place the task in
 *    the correct organizational context.
 * 4. **Connector-linked**: The `connector` field ties the task to the adapter
 *    that will execute it.
 * 5. **Audit-ready**: `history` and `policy` fields embed enough information
 *    for offline audit without extra lookups.
 */
export interface TaskEnvelope {
  // -- identity ---------------------------------------------------------------

  /** Schema version of this envelope (semver). */
  envelope_version: string;

  /** Unique task identifier. */
  id: string;

  // -- scoping ----------------------------------------------------------------

  /**
   * The workspace this task belongs to.
   * Maps to the organizational unit (team, project, org) in the Recoder
   * platform.
   */
  workspace_id: string;

  /**
   * The thread (conversation) this task is part of.
   * Multiple tasks can belong to the same thread.
   */
  thread_id: string;

  /**
   * Distributed tracing identifier (W3C Trace Context compatible).
   * All events, audit entries, and side effects produced by this task
   * should carry this trace_id.
   */
  trace_id: string;

  /**
   * Optional parent span/message ID for nested traces.
   */
  parent_id?: string;

  // -- lifecycle --------------------------------------------------------------

  /** Current state of the task. */
  state: TaskState;

  /** Ordered history of state transitions. */
  history?: TaskStateTransition[];

  // -- participants -----------------------------------------------------------

  /** The agent or user that requested this task. */
  requester: TaskAgentRef;

  /** The agent assigned to execute this task. */
  assignee: TaskAgentRef;

  // -- connector --------------------------------------------------------------

  /** Information about the connector/adapter that handles execution. */
  connector: TaskConnectorInfo;

  // -- payload ----------------------------------------------------------------

  /**
   * The task prompt or input payload.
   * Uses the existing `RecoderPayload` discriminated union so that tasks
   * can carry text, JSON, commands, or artifact payloads.
   */
  payload: RecoderPayload | RecoderPayload[];

  // -- result -----------------------------------------------------------------

  /** The task result, populated when the task reaches a terminal state. */
  result?: TaskResult;

  /** Error information, populated when state is 'failed'. */
  error?: TaskErrorInfo;

  // -- policy -----------------------------------------------------------------

  /** Snapshot of policy decisions made for this task. */
  policy?: TaskPolicySnapshot[];

  // -- timestamps -------------------------------------------------------------

  /** ISO-8601 timestamp of task creation. */
  created_at: string;

  /** ISO-8601 timestamp of last update. */
  updated_at: string;

  // -- cost & usage tracking --------------------------------------------------

  /**
   * Total tokens consumed by this task (prompt + completion).
   * Populated when the task reaches the `completed` state.
   */
  tokensUsed?: number;

  /**
   * Estimated cost in USD for this task execution.
   * Populated when the task reaches the `completed` state.
   */
  estimatedCostUsd?: number;

  /**
   * Number of times this task has been retried (re-created after failure).
   * Starts at 0 and increments each time a retry is attempted.
   */
  retryCount?: number;

  // -- extensibility ----------------------------------------------------------

  /** Arbitrary metadata for connector-specific or consumer-specific data. */
  metadata?: Record<string, unknown>;

  /**
   * Tags for categorization and filtering.
   * Examples: ['priority:high', 'team:backend', 'sprint:42']
   */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Input for creating a new TaskEnvelope.
 * Fields that can be auto-populated (timestamps, version, initial state) are
 * optional.
 */
export interface CreateTaskEnvelopeInput {
  id: string;
  workspace_id: string;
  thread_id: string;
  trace_id: string;
  parent_id?: string;
  requester: TaskAgentRef;
  assignee: TaskAgentRef;
  connector: TaskConnectorInfo;
  payload: RecoderPayload | RecoderPayload[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  /** Override the initial state (defaults to 'submitted'). */
  initial_state?: TaskState;
  /** Override the creation timestamp (defaults to now). */
  now?: string;
}

/**
 * Create a new `TaskEnvelope` in the `submitted` state with sensible
 * defaults for version, timestamps, and empty history.
 *
 * @param input - The required fields for envelope creation.
 * @returns A fully populated `TaskEnvelope`.
 */
export function createTaskEnvelope(input: CreateTaskEnvelopeInput): TaskEnvelope {
  const now = input.now ?? new Date().toISOString();
  return {
    envelope_version: TASK_ENVELOPE_VERSION,
    id: input.id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    trace_id: input.trace_id,
    parent_id: input.parent_id,
    state: input.initial_state ?? TaskStateEnum.Submitted,
    history: [],
    requester: input.requester,
    assignee: input.assignee,
    connector: input.connector,
    payload: input.payload,
    created_at: now,
    updated_at: now,
    metadata: input.metadata,
    tags: input.tags,
  };
}

// ---------------------------------------------------------------------------
// State transition helper
// ---------------------------------------------------------------------------

/**
 * Allowed state transitions. Maps each state to the set of states it can
 * move to. Any transition not in this map is invalid.
 */
export const ALLOWED_STATE_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  [TaskStateEnum.Submitted]: [TaskStateEnum.Working, TaskStateEnum.Cancelled, TaskStateEnum.Failed],
  [TaskStateEnum.Working]: [
    TaskStateEnum.Completed,
    TaskStateEnum.Failed,
    TaskStateEnum.Cancelled,
    TaskStateEnum.InputRequired,
  ],
  [TaskStateEnum.InputRequired]: [TaskStateEnum.Working, TaskStateEnum.Cancelled, TaskStateEnum.Failed],
  [TaskStateEnum.Completed]: [],
  [TaskStateEnum.Failed]: [],
  [TaskStateEnum.Cancelled]: [],
};

/**
 * Check whether a state transition is valid according to the lifecycle rules.
 *
 * @param from - The current state.
 * @param to - The desired next state.
 * @returns `true` if the transition is allowed.
 */
export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return (ALLOWED_STATE_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Apply a state transition to an envelope, returning a new envelope with
 * the updated state and an appended history entry. Throws if the transition
 * is not allowed.
 *
 * @param envelope - The current envelope.
 * @param to - The target state.
 * @param options - Optional reason and actor for the transition.
 * @returns A new `TaskEnvelope` with the transition applied.
 */
export function transitionTaskEnvelope(
  envelope: TaskEnvelope,
  to: TaskState,
  options?: { reason?: string; triggered_by?: string; now?: string }
): TaskEnvelope {
  if (!isValidTransition(envelope.state, to)) {
    throw new Error(
      `Invalid task state transition: ${envelope.state} -> ${to} (task ${envelope.id})`
    );
  }

  const now = options?.now ?? new Date().toISOString();
  const transition: TaskStateTransition = {
    from: envelope.state,
    to,
    transitioned_at: now,
    reason: options?.reason,
    triggered_by: options?.triggered_by,
  };

  return {
    ...envelope,
    state: to,
    updated_at: now,
    history: [...(envelope.history ?? []), transition],
  };
}
