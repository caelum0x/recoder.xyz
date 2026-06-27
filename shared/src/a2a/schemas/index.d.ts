/**
 * @module @recoder/shared/a2a/schemas
 *
 * Canonical TypeScript schemas for the Recoder A2A control plane.
 *
 * This barrel re-exports all schema types, enums, constants, and factory
 * helpers so that consumers can import everything from a single path:
 *
 * ```ts
 * import type {
 *   TaskEnvelope,
 *   AuditEvent,
 *   A2AError,
 * } from '@recoder/shared/a2a/schemas';
 *
 * import {
 *   TaskStateEnum,
 *   AuditEventTypeEnum,
 *   A2AErrorCodeEnum,
 *   createTaskEnvelope,
 *   createAuditEvent,
 *   buildA2AError,
 * } from '@recoder/shared/a2a/schemas';
 * ```
 */
export { TASK_ENVELOPE_VERSION, TaskStateEnum, TASK_STATES, TERMINAL_TASK_STATES, isTerminalState, ALLOWED_STATE_TRANSITIONS, isValidTransition, transitionTaskEnvelope, createTaskEnvelope, type TaskState, type TaskStateTransition, type TaskConnectorInfo, type TaskAgentRef, type TaskResult, type TaskArtifact, type TaskPreviewLink, type TaskEvidenceItem, type TaskPolicySnapshot, type TaskErrorInfo, type TaskEnvelope, type CreateTaskEnvelopeInput, } from './task-envelope';
export { AUDIT_EVENT_VERSION, AuditEventTypeEnum, AUDIT_EVENT_TYPES, AuditActorKindEnum, AuditTargetKindEnum, AuditSeverityEnum, createAuditEvent, type AuditEventType, type AuditActorKind, type AuditActor, type AuditTargetKind, type AuditTarget, type AuditPolicyContext, type AuditSeverity, type AuditEvent, type CreateAuditEventInput, } from './audit-event';
export { A2AErrorSeverityEnum, A2AErrorCategoryEnum, A2AErrorCodeEnum, A2A_ERROR_CODE_REGISTRY, buildA2AError, getErrorCodeMeta, isA2AErrorCode, A2AStructuredError, type A2AErrorSeverity, type A2AErrorCategory, type A2AErrorCode, type A2AErrorCodeMeta, type A2AError, } from './error-taxonomy';
