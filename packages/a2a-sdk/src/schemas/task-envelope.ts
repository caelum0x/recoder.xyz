/**
 * @module task-envelope
 *
 * Canonical TaskEnvelope schema for the Recoder A2A control plane.
 */

import type {
  RecoderAgentPlatform,
  RecoderPayload,
  A2AProtocolKind,
  TaskState as ControlPlaneTaskState,
} from './types';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Current version of the TaskEnvelope schema. */
export const TASK_ENVELOPE_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Task State
// ---------------------------------------------------------------------------

export type TaskState = ControlPlaneTaskState;

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
 */
export function isTerminalState(state: TaskState): boolean {
  return TERMINAL_TASK_STATES.has(state);
}

// ---------------------------------------------------------------------------
// Task State Transition
// ---------------------------------------------------------------------------

export interface TaskStateTransition {
  from: TaskState;
  to: TaskState;
  transitioned_at: string;
  reason?: string;
  triggered_by?: string;
}

// ---------------------------------------------------------------------------
// Connector Info
// ---------------------------------------------------------------------------

export interface TaskConnectorInfo {
  platform: RecoderAgentPlatform;
  protocol: A2AProtocolKind;
  connector_id: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent Reference
// ---------------------------------------------------------------------------

export interface TaskAgentRef {
  agent_id: string;
  platform: RecoderAgentPlatform;
  name?: string;
  instance_id?: string;
}

// ---------------------------------------------------------------------------
// Task Result
// ---------------------------------------------------------------------------

export interface TaskResult {
  text?: string;
  data?: Record<string, unknown>;
  artifacts?: TaskArtifact[];
}

export type TaskArtifactType =
  | 'patch'
  | 'file'
  | 'plan'
  | 'report'
  | 'log'
  | 'pull_request'
  | 'preview'
  | 'screenshot'
  | 'verification'
  | 'custom';

export const TaskArtifactTypeEnum = {
  Patch: 'patch' as const satisfies TaskArtifactType,
  File: 'file' as const satisfies TaskArtifactType,
  Plan: 'plan' as const satisfies TaskArtifactType,
  Report: 'report' as const satisfies TaskArtifactType,
  Log: 'log' as const satisfies TaskArtifactType,
  PullRequest: 'pull_request' as const satisfies TaskArtifactType,
  Preview: 'preview' as const satisfies TaskArtifactType,
  Screenshot: 'screenshot' as const satisfies TaskArtifactType,
  Verification: 'verification' as const satisfies TaskArtifactType,
  Custom: 'custom' as const satisfies TaskArtifactType,
} as const;

export const TASK_ARTIFACT_TYPES: readonly TaskArtifactType[] = [
  TaskArtifactTypeEnum.Patch,
  TaskArtifactTypeEnum.File,
  TaskArtifactTypeEnum.Plan,
  TaskArtifactTypeEnum.Report,
  TaskArtifactTypeEnum.Log,
  TaskArtifactTypeEnum.PullRequest,
  TaskArtifactTypeEnum.Preview,
  TaskArtifactTypeEnum.Screenshot,
  TaskArtifactTypeEnum.Verification,
  TaskArtifactTypeEnum.Custom,
] as const;

export interface TaskArtifact {
  key: string;
  artifact_type: TaskArtifactType;
  mime_type: string;
  content: string;
  path?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy Snapshot
// ---------------------------------------------------------------------------

export interface TaskPolicySnapshot {
  action: string;
  approved: boolean;
  rule: string;
  reason: string;
  checked_at: string;
}

// ---------------------------------------------------------------------------
// Error Info
// ---------------------------------------------------------------------------

export interface TaskErrorInfo {
  code: string;
  category: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// TaskEnvelope
// ---------------------------------------------------------------------------

export interface TaskEnvelope {
  envelope_version: string;
  id: string;
  workspace_id: string;
  thread_id: string;
  trace_id: string;
  parent_id?: string;
  state: TaskState;
  history?: TaskStateTransition[];
  requester: TaskAgentRef;
  assignee: TaskAgentRef;
  connector: TaskConnectorInfo;
  payload: RecoderPayload | RecoderPayload[];
  result?: TaskResult;
  error?: TaskErrorInfo;
  policy?: TaskPolicySnapshot[];
  created_at: string;
  updated_at: string;
  tokensUsed?: number;
  estimatedCostUsd?: number;
  retryCount?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

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
  initial_state?: TaskState;
  now?: string;
}

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

export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return (ALLOWED_STATE_TRANSITIONS[from] ?? []).includes(to);
}

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
