/**
 * @module @recoder/a2a-sdk
 *
 * Shared SDK helpers for the Recoder A2A system.
 *
 * This package provides connector-level utilities that sit between the
 * canonical schemas (`@recoder/shared/a2a/schemas`) and the individual
 * adapter implementations (Codex adapter, Claude Code adapter, etc.).
 *
 * Consumers should prefer importing from this single package rather than
 * reaching into `@recoder/shared/a2a/schemas` directly -- all canonical
 * types and enums are re-exported here alongside the SDK helpers.
 *
 * ## Sub-modules
 *
 * | Module              | Purpose                                         |
 * |---------------------|-------------------------------------------------|
 * | `state-mapping`     | Bidirectional native <-> canonical state maps    |
 * | `error-mapping`     | Map connector errors to canonical A2AError       |
 * | `envelope-builders` | Factory functions for connector-specific envelopes |
 * | `audit-helpers`     | Typed emitters for common audit events           |
 * | `validation`        | Structural validators for schemas                |
 *
 * @example
 * ```ts
 * import {
 *   // Canonical types (re-exported)
 *   TaskStateEnum,
 *   A2AErrorCodeEnum,
 *   AuditEventTypeEnum,
 *   // SDK helpers
 *   mapCodexState,
 *   mapClaudeError,
 *   buildCodexEnvelope,
 *   emitTaskSubmitted,
 *   validateTaskEnvelope,
 * } from '@recoder/a2a-sdk';
 * ```
 */

// ---------------------------------------------------------------------------
// Re-export canonical schemas (inlined from @recoder/shared/a2a/schemas)
// ---------------------------------------------------------------------------

export {
  // -- shared types -----------------------------------------------------------
  type RecoderAgentPlatform,
  type RecoderPayload,
  type RecoderTextPayload,
  type RecoderJsonPayload,
  type RecoderCommandPayload,
  type RecoderArtifactPayload,
  type A2AProtocolKind,

  // -- task-envelope ----------------------------------------------------------
  TASK_ENVELOPE_VERSION,
  TaskStateEnum,
  TASK_STATES,
  TERMINAL_TASK_STATES,
  isTerminalState,
  ALLOWED_STATE_TRANSITIONS,
  isValidTransition,
  transitionTaskEnvelope,
  createTaskEnvelope,
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

  // -- audit-event ------------------------------------------------------------
  AUDIT_EVENT_VERSION,
  AuditEventTypeEnum,
  AUDIT_EVENT_TYPES,
  AuditActorKindEnum,
  AuditTargetKindEnum,
  AuditSeverityEnum,
  createAuditEvent,
  type AuditEventType,
  type AuditActorKind,
  type AuditActor,
  type AuditTargetKind,
  type AuditTarget,
  type AuditPolicyContext,
  type AuditSeverity,
  type AuditEvent,
  type CreateAuditEventInput,

  // -- error-taxonomy ---------------------------------------------------------
  A2AErrorSeverityEnum,
  A2AErrorCategoryEnum,
  A2AErrorCodeEnum,
  A2A_ERROR_CODE_REGISTRY,
  buildA2AError,
  getErrorCodeMeta,
  isA2AErrorCode,
  A2AStructuredError,
  type A2AErrorSeverity,
  type A2AErrorCategory,
  type A2AErrorCode,
  type A2AErrorCodeMeta,
  type A2AError,
} from './schemas';

// ---------------------------------------------------------------------------
// SDK helpers: State mapping
// ---------------------------------------------------------------------------

export {
  type ConnectorPlatform,
  type CodexNativeState,
  type ClaudeNativeState,
  mapCodexState,
  mapCodexStateStrict,
  canonicalToCodexState,
  mapClaudeState,
  mapClaudeStateStrict,
  canonicalToClaudeState,
  mapConnectorState,
  mapConnectorStateStrict,
  canonicalToConnectorState,
  checkConnectorTransition,
  isConnectorTerminalState,
} from './state-mapping';

// ---------------------------------------------------------------------------
// SDK helpers: Error mapping
// ---------------------------------------------------------------------------

export {
  type CodexErrorInput,
  type ClaudeErrorInput,
  type ConnectorErrorInput,
  mapCodexError,
  mapClaudeError,
  mapHttpError,
  mapConnectorError,
  wrapUnknownError,
} from './error-mapping';

// ---------------------------------------------------------------------------
// SDK helpers: Envelope builders
// ---------------------------------------------------------------------------

export {
  type ConnectorEnvelopeInput,
  type CodexEnvelopeOptions,
  type ClaudeEnvelopeOptions,
  buildCodexEnvelope,
  buildClaudeEnvelope,
  completeEnvelope,
  failEnvelope,
  cancelEnvelope,
  startEnvelope,
  a2aErrorToTaskErrorInfo,
} from './envelope-builders';

// ---------------------------------------------------------------------------
// SDK helpers: Audit event emitters
// ---------------------------------------------------------------------------

export {
  type AuditEventBase,
  type TaskAuditEventInput,
  type ConnectorAuditEventInput,
  type PolicyAuditEventInput,
  emitTaskSubmitted,
  emitTaskStarted,
  emitTaskProgress,
  emitTaskInputRequired,
  emitTaskCompleted,
  emitTaskFailed,
  emitTaskCancelled,
  emitConnectorAttached,
  emitConnectorHealth,
  emitConnectorError,
  emitPolicyChecked,
  emitPolicyApproved,
  emitPolicyDenied,
  emitAuditForTransition,
} from './audit-helpers';

// ---------------------------------------------------------------------------
// SDK helpers: Validation
// ---------------------------------------------------------------------------

export {
  type ValidationIssue,
  type ValidationResult,
  validateTaskEnvelope,
  isValidTaskEnvelope,
  assertTaskEnvelope,
  validateAuditEvent,
  isValidAuditEvent,
  assertAuditEvent,
  validateA2AError,
  isValidA2AError,
} from './validation';

// ---------------------------------------------------------------------------
// SDK helpers: Inbound ingress normalization (shared entrypoint for consumers)
// ---------------------------------------------------------------------------

export {
  type NormalizeInboundEnvelopeOptions,
  type NormalizeInboundEnvelopeResult,
  normalizeInboundEnvelope,
} from './ingress';
