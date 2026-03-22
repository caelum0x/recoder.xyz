/**
 * @module audit-event
 *
 * Canonical AuditEvent schema for the Recoder A2A control plane.
 */

import type { RecoderAgentPlatform } from './types';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Current version of the AuditEvent schema. */
export const AUDIT_EVENT_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export const AuditEventTypeEnum = {
  // -- task lifecycle ---------------------------------------------------------
  TaskSubmitted: 'task.submitted',
  TaskStarted: 'task.started',
  TaskProgress: 'task.progress',
  TaskInputRequired: 'task.input_required',
  TaskCompleted: 'task.completed',
  TaskFailed: 'task.failed',
  TaskCancelled: 'task.cancelled',

  // -- policy decisions -------------------------------------------------------
  PolicyChecked: 'policy.checked',
  PolicyApproved: 'policy.approved',
  PolicyDenied: 'policy.denied',

  // -- connector events -------------------------------------------------------
  ConnectorAttached: 'connector.attached',
  ConnectorDetached: 'connector.detached',
  ConnectorHealth: 'connector.health',
  ConnectorError: 'connector.error',

  // -- agent registry ---------------------------------------------------------
  AgentRegistered: 'agent.registered',
  AgentUnregistered: 'agent.unregistered',
  AgentUpdated: 'agent.updated',

  // -- collaboration ----------------------------------------------------------
  ChannelCreated: 'collaboration.channel_created',
  ThreadCreated: 'collaboration.thread_created',
  MessageSent: 'collaboration.message_sent',

  // -- system -----------------------------------------------------------------
  SystemConfig: 'system.config',
  SystemError: 'system.error',
} as const;

/** Union of all valid audit event type string values. */
export type AuditEventType = (typeof AuditEventTypeEnum)[keyof typeof AuditEventTypeEnum];

/** Ordered list of all event types (useful for validation / UI dropdowns). */
export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = Object.values(AuditEventTypeEnum);

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

export const AuditActorKindEnum = {
  Agent: 'agent',
  User: 'user',
  System: 'system',
  Connector: 'connector',
} as const;

export type AuditActorKind = (typeof AuditActorKindEnum)[keyof typeof AuditActorKindEnum];

export interface AuditActor {
  kind: AuditActorKind;
  id: string;
  name?: string;
  platform?: RecoderAgentPlatform;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

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

export type AuditTargetKind = (typeof AuditTargetKindEnum)[keyof typeof AuditTargetKindEnum];

export interface AuditTarget {
  kind: AuditTargetKind;
  id: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy Context
// ---------------------------------------------------------------------------

export interface AuditPolicyContext {
  action: string;
  rule: string;
  approved: boolean;
  reason: string;
  agent_id: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export const AuditSeverityEnum = {
  Info: 'info',
  Warning: 'warning',
  Error: 'error',
  Critical: 'critical',
} as const;

export type AuditSeverity = (typeof AuditSeverityEnum)[keyof typeof AuditSeverityEnum];

// ---------------------------------------------------------------------------
// AuditEvent
// ---------------------------------------------------------------------------

export interface AuditEvent {
  schema_version: string;
  id: string;
  event_type: AuditEventType;
  severity?: AuditSeverity;
  actor: AuditActor;
  target: AuditTarget;
  trace_id: string;
  parent_event_id?: string;
  workspace_id: string;
  thread_id?: string;
  task_id?: string;
  timestamp: string;
  duration_ms?: number;
  policy?: AuditPolicyContext;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

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
  now?: string;
}

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
