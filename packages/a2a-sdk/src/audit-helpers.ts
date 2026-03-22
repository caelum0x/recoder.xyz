/**
 * @module audit-helpers
 *
 * High-level audit event emitter helpers for common A2A operations.
 *
 * Instead of manually constructing `CreateAuditEventInput` objects for every
 * lifecycle event, adapter code can call these type-safe helper functions
 * which pre-fill the `event_type`, `actor`, `target`, and `severity` fields
 * for the most common scenarios.
 *
 * All helpers return an `AuditEvent` (not a side-effecting "emit"). The
 * caller is responsible for persisting or publishing the event through
 * the audit-log service transport layer.
 *
 * @example
 * ```ts
 * import { emitTaskSubmitted, emitConnectorInvoked } from '@recoder/a2a-sdk/audit-helpers';
 *
 * const evt = emitTaskSubmitted({
 *   id: 'evt_01',
 *   task_id: 'task_01',
 *   workspace_id: 'ws_abc',
 *   trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   actor_agent_id: 'agent-pm',
 *   actor_platform: 'recoder_pm',
 * });
 * await auditLogService.persist(evt);
 * ```
 */

import {
  type AuditEvent,
  type AuditActor,
  type AuditTarget,
  type AuditSeverity,
  type AuditPolicyContext,
  AuditEventTypeEnum,
  AuditActorKindEnum,
  AuditTargetKindEnum,
  AuditSeverityEnum,
  createAuditEvent,
} from './schemas';

import type { RecoderAgentPlatform } from './schemas';

// ---------------------------------------------------------------------------
// Common input base
// ---------------------------------------------------------------------------

/**
 * Common fields required by all audit event helpers.
 */
export interface AuditEventBase {
  /** Unique event ID. */
  id: string;
  /** Workspace ID. */
  workspace_id: string;
  /** Trace ID for correlation with the originating TaskEnvelope. */
  trace_id: string;
  /** Optional thread ID. */
  thread_id?: string;
  /** Optional parent event ID. */
  parent_event_id?: string;
  /** Optional additional metadata. */
  metadata?: Record<string, unknown>;
  /** Optional tags. */
  tags?: string[];
  /** Override the timestamp (defaults to now). */
  now?: string;
}

/**
 * Fields for task-scoped audit events.
 */
export interface TaskAuditEventInput extends AuditEventBase {
  /** The task ID that this event is about. */
  task_id: string;
  /** The actor agent ID. */
  actor_agent_id: string;
  /** The actor's platform. */
  actor_platform: RecoderAgentPlatform;
  /** Optional actor display name. */
  actor_name?: string;
}

/**
 * Fields for connector-scoped audit events.
 */
export interface ConnectorAuditEventInput extends AuditEventBase {
  /** The connector ID. */
  connector_id: string;
  /** The connector platform. */
  connector_platform: RecoderAgentPlatform;
  /** Optional task ID. */
  task_id?: string;
  /** Optional connector display name. */
  connector_name?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function agentActor(
  agentId: string,
  platform: RecoderAgentPlatform,
  name?: string,
): AuditActor {
  return {
    kind: AuditActorKindEnum.Agent,
    id: agentId,
    platform,
    name,
  };
}

function connectorActor(
  connectorId: string,
  platform: RecoderAgentPlatform,
  name?: string,
): AuditActor {
  return {
    kind: AuditActorKindEnum.Connector,
    id: connectorId,
    platform,
    name,
  };
}

function systemActor(systemId: string = 'control-plane'): AuditActor {
  return {
    kind: AuditActorKindEnum.System,
    id: systemId,
    name: 'A2A Control Plane',
  };
}

function taskTarget(taskId: string): AuditTarget {
  return {
    kind: AuditTargetKindEnum.Task,
    id: taskId,
  };
}

function connectorTarget(
  connectorId: string,
  name?: string,
): AuditTarget {
  return {
    kind: AuditTargetKindEnum.Connector,
    id: connectorId,
    name,
  };
}

// ---------------------------------------------------------------------------
// Task lifecycle events
// ---------------------------------------------------------------------------

/**
 * Emit a `task.submitted` audit event.
 *
 * Call this when a new task envelope is created and submitted to the
 * control plane.
 */
export function emitTaskSubmitted(input: TaskAuditEventInput): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.TaskSubmitted,
    severity: AuditSeverityEnum.Info,
    actor: agentActor(input.actor_agent_id, input.actor_platform, input.actor_name),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    metadata: input.metadata,
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `task.started` audit event.
 *
 * Call this when a task transitions from `submitted` to `working`.
 */
export function emitTaskStarted(input: TaskAuditEventInput): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.TaskStarted,
    severity: AuditSeverityEnum.Info,
    actor: agentActor(input.actor_agent_id, input.actor_platform, input.actor_name),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    metadata: input.metadata,
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `task.progress` audit event.
 *
 * Call this for intermediate progress updates during task execution.
 */
export function emitTaskProgress(
  input: TaskAuditEventInput & { progress_pct?: number },
): AuditEvent {
  const metadata = { ...input.metadata };
  if (input.progress_pct !== undefined) {
    metadata.progress_pct = input.progress_pct;
  }

  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.TaskProgress,
    severity: AuditSeverityEnum.Info,
    actor: agentActor(input.actor_agent_id, input.actor_platform, input.actor_name),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    metadata,
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `task.input_required` audit event.
 *
 * Call this when the assignee agent needs additional input.
 */
export function emitTaskInputRequired(input: TaskAuditEventInput): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.TaskInputRequired,
    severity: AuditSeverityEnum.Info,
    actor: agentActor(input.actor_agent_id, input.actor_platform, input.actor_name),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    metadata: input.metadata,
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `task.completed` audit event.
 *
 * Call this when a task reaches the `completed` terminal state.
 */
export function emitTaskCompleted(
  input: TaskAuditEventInput & { duration_ms?: number },
): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.TaskCompleted,
    severity: AuditSeverityEnum.Info,
    actor: agentActor(input.actor_agent_id, input.actor_platform, input.actor_name),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    duration_ms: input.duration_ms,
    metadata: input.metadata,
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `task.failed` audit event.
 *
 * Call this when a task reaches the `failed` terminal state.
 */
export function emitTaskFailed(
  input: TaskAuditEventInput & {
    error_code?: string;
    error_message?: string;
    duration_ms?: number;
  },
): AuditEvent {
  const metadata: Record<string, unknown> = { ...input.metadata };
  if (input.error_code) metadata.error_code = input.error_code;
  if (input.error_message) metadata.error_message = input.error_message;

  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.TaskFailed,
    severity: AuditSeverityEnum.Error,
    actor: agentActor(input.actor_agent_id, input.actor_platform, input.actor_name),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    duration_ms: input.duration_ms,
    metadata,
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `task.cancelled` audit event.
 *
 * Call this when a task is explicitly cancelled.
 */
export function emitTaskCancelled(
  input: TaskAuditEventInput & { reason?: string },
): AuditEvent {
  const metadata: Record<string, unknown> = { ...input.metadata };
  if (input.reason) metadata.cancellation_reason = input.reason;

  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.TaskCancelled,
    severity: AuditSeverityEnum.Info,
    actor: agentActor(input.actor_agent_id, input.actor_platform, input.actor_name),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    metadata,
    tags: input.tags,
    now: input.now,
  });
}

// ---------------------------------------------------------------------------
// Connector events
// ---------------------------------------------------------------------------

/**
 * Emit a `connector.attached` audit event.
 *
 * Call this when a connector is attached to an agent for task execution.
 */
export function emitConnectorAttached(input: ConnectorAuditEventInput): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.ConnectorAttached,
    severity: AuditSeverityEnum.Info,
    actor: systemActor(),
    target: connectorTarget(input.connector_id, input.connector_name),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    metadata: {
      ...input.metadata,
      connector_platform: input.connector_platform,
    },
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `connector.health` audit event.
 *
 * Call this when a connector emits a health check or diagnostic event.
 */
export function emitConnectorHealth(
  input: ConnectorAuditEventInput & {
    healthy: boolean;
    latency_ms?: number;
  },
): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.ConnectorHealth,
    severity: input.healthy ? AuditSeverityEnum.Info : AuditSeverityEnum.Warning,
    actor: connectorActor(input.connector_id, input.connector_platform, input.connector_name),
    target: connectorTarget(input.connector_id, input.connector_name),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    metadata: {
      ...input.metadata,
      healthy: input.healthy,
      ...(input.latency_ms !== undefined ? { latency_ms: input.latency_ms } : {}),
    },
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `connector.error` audit event.
 *
 * Call this when a connector encounters an error during task execution.
 */
export function emitConnectorError(
  input: ConnectorAuditEventInput & {
    error_code?: string;
    error_message: string;
  },
): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.ConnectorError,
    severity: AuditSeverityEnum.Error,
    actor: connectorActor(input.connector_id, input.connector_platform, input.connector_name),
    target: connectorTarget(input.connector_id, input.connector_name),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    metadata: {
      ...input.metadata,
      ...(input.error_code ? { error_code: input.error_code } : {}),
      error_message: input.error_message,
    },
    tags: input.tags,
    now: input.now,
  });
}

// ---------------------------------------------------------------------------
// Policy events
// ---------------------------------------------------------------------------

/**
 * Input for policy audit events.
 */
export interface PolicyAuditEventInput extends AuditEventBase {
  /** The task ID the policy was checked for. */
  task_id: string;
  /** The agent ID the policy was evaluated against. */
  agent_id: string;
  /** The policy action (e.g. 'file:write', 'bash:exec'). */
  action: string;
  /** The rule that was applied ('auto', 'prompt', 'deny'). */
  rule: string;
  /** Whether the action was approved. */
  approved: boolean;
  /** Human-readable reason for the decision. */
  reason: string;
  /** Duration of the policy check. */
  duration_ms?: number;
}

/**
 * Emit a `policy.checked` audit event.
 *
 * Call this after a policy evaluation completes.
 */
export function emitPolicyChecked(input: PolicyAuditEventInput): AuditEvent {
  const policyContext: AuditPolicyContext = {
    action: input.action,
    rule: input.rule,
    approved: input.approved,
    reason: input.reason,
    agent_id: input.agent_id,
  };

  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.PolicyChecked,
    severity: AuditSeverityEnum.Info,
    actor: systemActor('policy-engine'),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    duration_ms: input.duration_ms,
    policy: policyContext,
    metadata: input.metadata,
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `policy.approved` audit event.
 *
 * Convenience wrapper around `emitPolicyChecked` for approved actions.
 */
export function emitPolicyApproved(
  input: Omit<PolicyAuditEventInput, 'approved'>,
): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.PolicyApproved,
    severity: AuditSeverityEnum.Info,
    actor: systemActor('policy-engine'),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    duration_ms: input.duration_ms,
    policy: {
      action: input.action,
      rule: input.rule,
      approved: true,
      reason: input.reason,
      agent_id: input.agent_id,
    },
    metadata: input.metadata,
    tags: input.tags,
    now: input.now,
  });
}

/**
 * Emit a `policy.denied` audit event.
 *
 * Convenience wrapper for denied actions.
 */
export function emitPolicyDenied(
  input: Omit<PolicyAuditEventInput, 'approved'>,
): AuditEvent {
  return createAuditEvent({
    id: input.id,
    event_type: AuditEventTypeEnum.PolicyDenied,
    severity: AuditSeverityEnum.Warning,
    actor: systemActor('policy-engine'),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    duration_ms: input.duration_ms,
    policy: {
      action: input.action,
      rule: input.rule,
      approved: false,
      reason: input.reason,
      agent_id: input.agent_id,
    },
    metadata: input.metadata,
    tags: input.tags,
    now: input.now,
  });
}

// ---------------------------------------------------------------------------
// Compound helper: emit audit event from envelope transition
// ---------------------------------------------------------------------------

/**
 * Mapping from canonical TaskState to the appropriate audit event emitter.
 * Used by `emitAuditForTransition` to automatically produce the right
 * event type when a task envelope transitions.
 */
const STATE_TO_EVENT_TYPE = {
  submitted: AuditEventTypeEnum.TaskSubmitted,
  working: AuditEventTypeEnum.TaskStarted,
  'input-required': AuditEventTypeEnum.TaskInputRequired,
  completed: AuditEventTypeEnum.TaskCompleted,
  failed: AuditEventTypeEnum.TaskFailed,
  cancelled: AuditEventTypeEnum.TaskCancelled,
} as const;

/**
 * Automatically emit the correct audit event type for a task state
 * transition. This is the preferred method for adapter code that processes
 * state changes and wants to emit a matching audit event without manually
 * switching on the state.
 *
 * @param input - The task audit event input.
 * @param newState - The canonical state the task transitioned to.
 * @returns An `AuditEvent` with the correct event_type for the transition.
 */
export function emitAuditForTransition(
  input: TaskAuditEventInput & { duration_ms?: number },
  newState: string,
): AuditEvent {
  const eventType =
    STATE_TO_EVENT_TYPE[newState as keyof typeof STATE_TO_EVENT_TYPE] ??
    AuditEventTypeEnum.TaskProgress;

  const severity =
    newState === 'failed'
      ? AuditSeverityEnum.Error
      : newState === 'cancelled'
        ? AuditSeverityEnum.Warning
        : AuditSeverityEnum.Info;

  return createAuditEvent({
    id: input.id,
    event_type: eventType,
    severity,
    actor: agentActor(input.actor_agent_id, input.actor_platform, input.actor_name),
    target: taskTarget(input.task_id),
    trace_id: input.trace_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    parent_event_id: input.parent_event_id,
    duration_ms: input.duration_ms,
    metadata: input.metadata,
    tags: input.tags,
    now: input.now,
  });
}
