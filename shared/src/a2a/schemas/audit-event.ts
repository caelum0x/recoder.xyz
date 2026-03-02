/**
 * @module audit-event
 *
 * Canonical AuditEvent schema for the Recoder A2A control plane.
 *
 * An AuditEvent is an immutable record of something that happened within the
 * system. Events are produced by connectors, the policy plane, the task
 * orchestrator, and the collaboration service. They feed into the audit-log
 * service and downstream analytics/compliance pipelines.
 *
 * Every event carries a `trace_id` that links it to the originating
 * `TaskEnvelope`, enabling full causal reconstruction of any workflow.
 *
 * Consumed by: audit-log service, analytics pipeline, compliance dashboards,
 * billing metering, alerting/monitoring.
 *
 * @example
 * ```ts
 * import type { AuditEvent } from '@recoder/shared/a2a/schemas';
 * import { AuditEventTypeEnum, AuditActorKindEnum } from '@recoder/shared/a2a/schemas';
 *
 * const event: AuditEvent = {
 *   schema_version: AUDIT_EVENT_VERSION,
 *   id: 'evt_01HXYZ',
 *   event_type: AuditEventTypeEnum.TaskSubmitted,
 *   actor: {
 *     kind: AuditActorKindEnum.Agent,
 *     id: 'agent-pm',
 *     platform: 'recoder_pm',
 *   },
 *   target: {
 *     kind: 'task',
 *     id: 'task_01HXYZ',
 *   },
 *   trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   workspace_id: 'ws_abc',
 *   thread_id: 'thr_def',
 *   timestamp: '2026-02-24T10:00:00.000Z',
 * };
 * ```
 */

import type { RecoderAgentPlatform } from '../types';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Current version of the AuditEvent schema. */
export const AUDIT_EVENT_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * Canonical audit event types covering the full lifecycle of tasks,
 * policy decisions, connector activity, collaboration actions, and
 * system-level events.
 */
export const AuditEventTypeEnum = {
  // -- task lifecycle ---------------------------------------------------------
  /** A new task was submitted. */
  TaskSubmitted: 'task.submitted',
  /** Task execution started. */
  TaskStarted: 'task.started',
  /** Task made progress (intermediate update). */
  TaskProgress: 'task.progress',
  /** Assignee agent needs additional input. */
  TaskInputRequired: 'task.input_required',
  /** Task completed successfully. */
  TaskCompleted: 'task.completed',
  /** Task failed with an error. */
  TaskFailed: 'task.failed',
  /** Task was cancelled. */
  TaskCancelled: 'task.cancelled',

  // -- policy decisions -------------------------------------------------------
  /** A policy check was performed. */
  PolicyChecked: 'policy.checked',
  /** A policy action was approved (auto or prompt). */
  PolicyApproved: 'policy.approved',
  /** A policy action was denied. */
  PolicyDenied: 'policy.denied',

  // -- connector events -------------------------------------------------------
  /** A connector was attached to an agent. */
  ConnectorAttached: 'connector.attached',
  /** A connector was detached from an agent. */
  ConnectorDetached: 'connector.detached',
  /** A connector emitted a diagnostic or health event. */
  ConnectorHealth: 'connector.health',
  /** A connector encountered an error. */
  ConnectorError: 'connector.error',

  // -- agent registry ---------------------------------------------------------
  /** An agent was registered. */
  AgentRegistered: 'agent.registered',
  /** An agent was unregistered. */
  AgentUnregistered: 'agent.unregistered',
  /** An agent's capabilities were updated. */
  AgentUpdated: 'agent.updated',

  // -- collaboration ----------------------------------------------------------
  /** A collaboration channel was created. */
  ChannelCreated: 'collaboration.channel_created',
  /** A collaboration thread was created. */
  ThreadCreated: 'collaboration.thread_created',
  /** A message was sent in a collaboration thread. */
  MessageSent: 'collaboration.message_sent',

  // -- system -----------------------------------------------------------------
  /** A system-level configuration change. */
  SystemConfig: 'system.config',
  /** A system-level error or warning. */
  SystemError: 'system.error',
} as const;

/** Union of all valid audit event type string values. */
export type AuditEventType = (typeof AuditEventTypeEnum)[keyof typeof AuditEventTypeEnum];

/** Ordered list of all event types (useful for validation / UI dropdowns). */
export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = Object.values(AuditEventTypeEnum);

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

/**
 * The kinds of actors that can produce audit events.
 */
export const AuditActorKindEnum = {
  /** An AI agent. */
  Agent: 'agent',
  /** A human user. */
  User: 'user',
  /** An internal system service (e.g. policy engine, scheduler). */
  System: 'system',
  /** A connector/adapter. */
  Connector: 'connector',
} as const;

/** Union of all valid actor kind string values. */
export type AuditActorKind = (typeof AuditActorKindEnum)[keyof typeof AuditActorKindEnum];

/**
 * Identifies who (or what) caused the audit event.
 */
export interface AuditActor {
  /** The kind of actor. */
  kind: AuditActorKind;

  /** Unique identifier of the actor. */
  id: string;

  /** Optional human-readable display name. */
  name?: string;

  /** Platform the actor belongs to (for agents/connectors). */
  platform?: RecoderAgentPlatform;

  /** Additional actor metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

/**
 * The kinds of resources that can be the target of an audit event.
 */
export const AuditTargetKindEnum = {
  Task: 'task',
  Agent: 'agent',
  Connector: 'connector',
  Channel: 'channel',
  Thread: 'thread',
  Message: 'message',
  Policy: 'policy',
  Workspace: 'workspace',
  System: 'system',
} as const;

/** Union of all valid target kind string values. */
export type AuditTargetKind = (typeof AuditTargetKindEnum)[keyof typeof AuditTargetKindEnum];

/**
 * Identifies the resource that was affected by the audit event.
 */
export interface AuditTarget {
  /** The kind of resource. */
  kind: AuditTargetKind;

  /** Unique identifier of the target resource. */
  id: string;

  /** Optional human-readable display name. */
  name?: string;

  /** Additional target metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy Context
// ---------------------------------------------------------------------------

/**
 * When an audit event is related to a policy decision, this carries the
 * full context of what was checked and what the outcome was.
 */
export interface AuditPolicyContext {
  /** The policy action that was evaluated (e.g. 'file:write', 'bash:exec'). */
  action: string;

  /** The rule that was applied ('auto', 'prompt', 'deny'). */
  rule: string;

  /** Whether the action was approved. */
  approved: boolean;

  /** Human-readable reason for the decision. */
  reason: string;

  /** The agent ID the policy was checked against. */
  agent_id: string;

  /** Additional policy evaluation details. */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

/**
 * Severity levels for audit events, following standard log severity.
 */
export const AuditSeverityEnum = {
  /** Informational -- normal operation. */
  Info: 'info',
  /** Warning -- something unexpected but not an error. */
  Warning: 'warning',
  /** Error -- an operation failed. */
  Error: 'error',
  /** Critical -- a severe failure requiring immediate attention. */
  Critical: 'critical',
} as const;

/** Union of all valid severity string values. */
export type AuditSeverity = (typeof AuditSeverityEnum)[keyof typeof AuditSeverityEnum];

// ---------------------------------------------------------------------------
// AuditEvent
// ---------------------------------------------------------------------------

/**
 * The canonical AuditEvent -- an immutable record of an action or state
 * change within the Recoder A2A system.
 *
 * Design principles:
 * 1. **Immutable**: Once created, an audit event is never modified.
 * 2. **Trace-linked**: `trace_id` connects every event to its causal chain.
 * 3. **Self-describing**: Carries its own schema version for evolution.
 * 4. **Workspace-scoped**: `workspace_id` enables multi-tenant audit queries.
 * 5. **Actor-target model**: Every event answers "who did what to whom".
 * 6. **Policy-aware**: When a policy was involved, the full decision context
 *    is embedded directly in the event.
 */
export interface AuditEvent {
  // -- identity ---------------------------------------------------------------

  /** Schema version of this audit event (semver). */
  schema_version: string;

  /** Unique event identifier. */
  id: string;

  // -- classification ---------------------------------------------------------

  /** The type of event (from the canonical event type enum). */
  event_type: AuditEventType;

  /** Severity of the event. Defaults to 'info' if not set. */
  severity?: AuditSeverity;

  // -- participants -----------------------------------------------------------

  /** The actor that caused this event. */
  actor: AuditActor;

  /** The resource that was affected by this event. */
  target: AuditTarget;

  // -- tracing ----------------------------------------------------------------

  /**
   * Distributed tracing identifier (W3C Trace Context compatible).
   * Links this event to the originating TaskEnvelope and all related events.
   */
  trace_id: string;

  /**
   * Optional parent event or span ID for nested event hierarchies.
   */
  parent_event_id?: string;

  // -- scoping ----------------------------------------------------------------

  /**
   * The workspace this event belongs to.
   */
  workspace_id: string;

  /**
   * The thread (conversation) this event is associated with, if any.
   */
  thread_id?: string;

  /**
   * The task this event is associated with, if any.
   */
  task_id?: string;

  // -- timing -----------------------------------------------------------------

  /** ISO-8601 timestamp of when the event occurred. */
  timestamp: string;

  /**
   * Duration in milliseconds, if the event represents a timed operation
   * (e.g. task execution, policy check).
   */
  duration_ms?: number;

  // -- policy -----------------------------------------------------------------

  /**
   * Policy context, present when the event involves a policy decision.
   */
  policy?: AuditPolicyContext;

  // -- extensibility ----------------------------------------------------------

  /** Arbitrary metadata for event-specific details. */
  metadata?: Record<string, unknown>;

  /**
   * Tags for categorization and filtering.
   * Examples: ['connector:codex', 'severity:high', 'team:backend']
   */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Input for creating a new AuditEvent.
 * Fields that can be auto-populated (schema_version, timestamp) are optional.
 */
export interface CreateAuditEventInput {
  id: string;
  event_type: AuditEventType;
  actor: AuditActor;
  target: AuditTarget;
  trace_id: string;
  workspace_id: string;
  thread_id?: string;
  task_id?: string;
  parent_event_id?: string;
  severity?: AuditSeverity;
  policy?: AuditPolicyContext;
  metadata?: Record<string, unknown>;
  tags?: string[];
  duration_ms?: number;
  /** Override the timestamp (defaults to now). */
  now?: string;
}

/**
 * Create a new `AuditEvent` with sensible defaults for version and timestamp.
 *
 * @param input - The required fields for event creation.
 * @returns A fully populated `AuditEvent`.
 */
export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  return {
    schema_version: AUDIT_EVENT_VERSION,
    id: input.id,
    event_type: input.event_type,
    severity: input.severity,
    actor: input.actor,
    target: input.target,
    trace_id: input.trace_id,
    parent_event_id: input.parent_event_id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    task_id: input.task_id,
    timestamp: input.now ?? new Date().toISOString(),
    duration_ms: input.duration_ms,
    policy: input.policy,
    metadata: input.metadata,
    tags: input.tags,
  };
}
