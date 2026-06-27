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
/** Current version of the AuditEvent schema. */
export declare const AUDIT_EVENT_VERSION: "1.0.0";
/**
 * Canonical audit event types covering the full lifecycle of tasks,
 * policy decisions, connector activity, collaboration actions, and
 * system-level events.
 */
export declare const AuditEventTypeEnum: {
    /** A new task was submitted. */
    readonly TaskSubmitted: "task.submitted";
    /** Task execution started. */
    readonly TaskStarted: "task.started";
    /** Task made progress (intermediate update). */
    readonly TaskProgress: "task.progress";
    /** Assignee agent needs additional input. */
    readonly TaskInputRequired: "task.input_required";
    /** Task completed successfully. */
    readonly TaskCompleted: "task.completed";
    /** Task failed with an error. */
    readonly TaskFailed: "task.failed";
    /** Task was cancelled. */
    readonly TaskCancelled: "task.cancelled";
    /** A policy check was performed. */
    readonly PolicyChecked: "policy.checked";
    /** A policy action was approved (auto or prompt). */
    readonly PolicyApproved: "policy.approved";
    /** A policy action was denied. */
    readonly PolicyDenied: "policy.denied";
    /** A connector was attached to an agent. */
    readonly ConnectorAttached: "connector.attached";
    /** A connector was detached from an agent. */
    readonly ConnectorDetached: "connector.detached";
    /** A connector emitted a diagnostic or health event. */
    readonly ConnectorHealth: "connector.health";
    /** A connector encountered an error. */
    readonly ConnectorError: "connector.error";
    /** An agent was registered. */
    readonly AgentRegistered: "agent.registered";
    /** An agent was unregistered. */
    readonly AgentUnregistered: "agent.unregistered";
    /** An agent's capabilities were updated. */
    readonly AgentUpdated: "agent.updated";
    /** A collaboration channel was created. */
    readonly ChannelCreated: "collaboration.channel_created";
    /** A collaboration thread was created. */
    readonly ThreadCreated: "collaboration.thread_created";
    /** A message was sent in a collaboration thread. */
    readonly MessageSent: "collaboration.message_sent";
    /** A system-level configuration change. */
    readonly SystemConfig: "system.config";
    /** A system-level error or warning. */
    readonly SystemError: "system.error";
};
/** Union of all valid audit event type string values. */
export type AuditEventType = (typeof AuditEventTypeEnum)[keyof typeof AuditEventTypeEnum];
/** Ordered list of all event types (useful for validation / UI dropdowns). */
export declare const AUDIT_EVENT_TYPES: readonly AuditEventType[];
/**
 * The kinds of actors that can produce audit events.
 */
export declare const AuditActorKindEnum: {
    /** An AI agent. */
    readonly Agent: "agent";
    /** A human user. */
    readonly User: "user";
    /** An internal system service (e.g. policy engine, scheduler). */
    readonly System: "system";
    /** A connector/adapter. */
    readonly Connector: "connector";
};
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
/**
 * The kinds of resources that can be the target of an audit event.
 */
export declare const AuditTargetKindEnum: {
    readonly Task: "task";
    readonly Agent: "agent";
    readonly Connector: "connector";
    readonly Channel: "channel";
    readonly Thread: "thread";
    readonly Message: "message";
    readonly Policy: "policy";
    readonly Workspace: "workspace";
    readonly System: "system";
};
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
/**
 * Severity levels for audit events, following standard log severity.
 */
export declare const AuditSeverityEnum: {
    /** Informational -- normal operation. */
    readonly Info: "info";
    /** Warning -- something unexpected but not an error. */
    readonly Warning: "warning";
    /** Error -- an operation failed. */
    readonly Error: "error";
    /** Critical -- a severe failure requiring immediate attention. */
    readonly Critical: "critical";
};
/** Union of all valid severity string values. */
export type AuditSeverity = (typeof AuditSeverityEnum)[keyof typeof AuditSeverityEnum];
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
    /** Schema version of this audit event (semver). */
    schema_version: string;
    /** Unique event identifier. */
    id: string;
    /** The type of event (from the canonical event type enum). */
    event_type: AuditEventType;
    /** Severity of the event. Defaults to 'info' if not set. */
    severity?: AuditSeverity;
    /** The actor that caused this event. */
    actor: AuditActor;
    /** The resource that was affected by this event. */
    target: AuditTarget;
    /**
     * Distributed tracing identifier (W3C Trace Context compatible).
     * Links this event to the originating TaskEnvelope and all related events.
     */
    trace_id: string;
    /**
     * Optional parent event or span ID for nested event hierarchies.
     */
    parent_event_id?: string;
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
    /** ISO-8601 timestamp of when the event occurred. */
    timestamp: string;
    /**
     * Duration in milliseconds, if the event represents a timed operation
     * (e.g. task execution, policy check).
     */
    duration_ms?: number;
    /**
     * Policy context, present when the event involves a policy decision.
     */
    policy?: AuditPolicyContext;
    /** Arbitrary metadata for event-specific details. */
    metadata?: Record<string, unknown>;
    /**
     * Tags for categorization and filtering.
     * Examples: ['connector:codex', 'severity:high', 'team:backend']
     */
    tags?: string[];
}
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
export declare function createAuditEvent(input: CreateAuditEventInput): AuditEvent;
