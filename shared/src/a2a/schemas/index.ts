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

export {
  // -- version ----------------------------------------------------------------
  TASK_ENVELOPE_VERSION,

  // -- task state -------------------------------------------------------------
  TaskStateEnum,
  TASK_STATES,
  TERMINAL_TASK_STATES,
  isTerminalState,

  // -- state transitions ------------------------------------------------------
  ALLOWED_STATE_TRANSITIONS,
  isValidTransition,
  transitionTaskEnvelope,

  // -- factory ----------------------------------------------------------------
  createTaskEnvelope,

  // -- types ------------------------------------------------------------------
  type TaskState,
  type TaskStateTransition,
  type TaskConnectorInfo,
  type TaskAgentRef,
  type TaskResult,
  type TaskArtifact,
  type TaskPolicySnapshot,
  type TaskErrorInfo,
  type TaskEnvelope,
  type CreateTaskEnvelopeInput,
} from './task-envelope';

export {
  // -- version ----------------------------------------------------------------
  AUDIT_EVENT_VERSION,

  // -- event types ------------------------------------------------------------
  AuditEventTypeEnum,
  AUDIT_EVENT_TYPES,

  // -- actor ------------------------------------------------------------------
  AuditActorKindEnum,

  // -- target -----------------------------------------------------------------
  AuditTargetKindEnum,

  // -- severity ---------------------------------------------------------------
  AuditSeverityEnum,

  // -- factory ----------------------------------------------------------------
  createAuditEvent,

  // -- types ------------------------------------------------------------------
  type AuditEventType,
  type AuditActorKind,
  type AuditActor,
  type AuditTargetKind,
  type AuditTarget,
  type AuditPolicyContext,
  type AuditSeverity,
  type AuditEvent,
  type CreateAuditEventInput,
} from './audit-event';

export {
  // -- severity ---------------------------------------------------------------
  A2AErrorSeverityEnum,

  // -- categories -------------------------------------------------------------
  A2AErrorCategoryEnum,

  // -- codes ------------------------------------------------------------------
  A2AErrorCodeEnum,
  A2A_ERROR_CODE_REGISTRY,

  // -- helpers ----------------------------------------------------------------
  buildA2AError,
  getErrorCodeMeta,
  isA2AErrorCode,

  // -- error class ------------------------------------------------------------
  A2AStructuredError,

  // -- types ------------------------------------------------------------------
  type A2AErrorSeverity,
  type A2AErrorCategory,
  type A2AErrorCode,
  type A2AErrorCodeMeta,
  type A2AError,
} from './error-taxonomy';
