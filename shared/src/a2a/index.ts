export * from './types';
export * from './bridge';
export * from './error-contract';
export * from './error-contract.snapshot';
export * from './control-plane';
export * from './persistent-services';
export * from './redis-persistence';

// Re-export schemas selectively to avoid TaskState name collision with
// control-plane.ts (both define the same TaskState union).
// Consumers who want the full schemas surface should use
// '@recoder/shared/a2a/schemas' directly.
export {
  // task-envelope (excluding TaskState -- already re-exported from control-plane)
  TASK_ENVELOPE_VERSION,
  TaskStateEnum,
  TASK_STATES,
  TERMINAL_TASK_STATES,
  isTerminalState,
  ALLOWED_STATE_TRANSITIONS,
  isValidTransition,
  transitionTaskEnvelope,
  createTaskEnvelope,
  type TaskStateTransition,
  type TaskConnectorInfo,
  type TaskAgentRef,
  type TaskResult,
  type TaskArtifact,
  type TaskPreviewLink,
  type TaskEvidenceItem,
  type TaskPolicySnapshot,
  type TaskErrorInfo,
  type TaskEnvelope,
  type CreateTaskEnvelopeInput,
  // audit-event
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
  // error-taxonomy
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

// Re-export OpenClaw adapter under a namespace-like path.
// Consumers who want the full adapter surface should use
// '@recoder/shared/a2a/adapters/openclaw' directly.
export {
  // types
  OPENCLAW_EVENT_NAMES,
  isOpenClawEventName,
  type OpenClawGatewayEvent,
  type OpenClawTaskGeneratingEvent,
  type OpenClawEventName,
  // validation
  validateOpenClawEvent,
  runValidationAssertions,
  type ValidationResult,
  // mapper
  mapOpenClawEvent,
  mapOpenClawEventStrict,
  type OpenClawMapperOptions,
  type OpenClawMapperResult,
} from './adapters/openclaw';
