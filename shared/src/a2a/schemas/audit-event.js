"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditSeverityEnum = exports.AuditTargetKindEnum = exports.AuditActorKindEnum = exports.AUDIT_EVENT_TYPES = exports.AuditEventTypeEnum = exports.AUDIT_EVENT_VERSION = void 0;
exports.createAuditEvent = createAuditEvent;
// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
/** Current version of the AuditEvent schema. */
exports.AUDIT_EVENT_VERSION = '1.0.0';
// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------
/**
 * Canonical audit event types covering the full lifecycle of tasks,
 * policy decisions, connector activity, collaboration actions, and
 * system-level events.
 */
exports.AuditEventTypeEnum = {
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
};
/** Ordered list of all event types (useful for validation / UI dropdowns). */
exports.AUDIT_EVENT_TYPES = Object.values(exports.AuditEventTypeEnum);
// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------
/**
 * The kinds of actors that can produce audit events.
 */
exports.AuditActorKindEnum = {
    /** An AI agent. */
    Agent: 'agent',
    /** A human user. */
    User: 'user',
    /** An internal system service (e.g. policy engine, scheduler). */
    System: 'system',
    /** A connector/adapter. */
    Connector: 'connector',
};
// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------
/**
 * The kinds of resources that can be the target of an audit event.
 */
exports.AuditTargetKindEnum = {
    Task: 'task',
    Agent: 'agent',
    Connector: 'connector',
    Channel: 'channel',
    Thread: 'thread',
    Message: 'message',
    Policy: 'policy',
    Workspace: 'workspace',
    System: 'system',
};
// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------
/**
 * Severity levels for audit events, following standard log severity.
 */
exports.AuditSeverityEnum = {
    /** Informational -- normal operation. */
    Info: 'info',
    /** Warning -- something unexpected but not an error. */
    Warning: 'warning',
    /** Error -- an operation failed. */
    Error: 'error',
    /** Critical -- a severe failure requiring immediate attention. */
    Critical: 'critical',
};
/**
 * Create a new `AuditEvent` with sensible defaults for version and timestamp.
 *
 * @param input - The required fields for event creation.
 * @returns A fully populated `AuditEvent`.
 */
function createAuditEvent(input) {
    return {
        schema_version: exports.AUDIT_EVENT_VERSION,
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
