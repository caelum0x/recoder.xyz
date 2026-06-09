/**
 * @module schemas
 *
 * Canonical TypeScript schemas for the Recoder A2A control plane.
 * Inlined from @recoder/shared/a2a/schemas for standalone publishing.
 */

// Re-export shared types
export type {
  RecoderAgentPlatform,
  RecoderPayload,
  RecoderTextPayload,
  RecoderJsonPayload,
  RecoderCommandPayload,
  RecoderArtifactPayload,
  A2AProtocolKind,
} from './types';

export {
  TASK_ENVELOPE_VERSION,
  TaskStateEnum,
  TASK_STATES,
  TERMINAL_TASK_STATES,
  isTerminalState,
  TaskArtifactTypeEnum,
  TASK_ARTIFACT_TYPES,
  ALLOWED_STATE_TRANSITIONS,
  isValidTransition,
  transitionTaskEnvelope,
  createTaskEnvelope,
  type TaskState,
  type TaskStateTransition,
  type TaskConnectorInfo,
  type TaskAgentRef,
  type TaskResult,
  type TaskArtifactType,
  type TaskArtifact,
  type TaskPolicySnapshot,
  type TaskErrorInfo,
  type TaskEnvelope,
  type CreateTaskEnvelopeInput,
} from './task-envelope';

export {
  type AgentCard,
  type AgentCardSecurityScheme,
  type AgentCardSkill,
} from './agent-card';

export {
  type A2AMessage,
  type MessagePart,
} from './message-part';

export {
  type ArtifactPart,
} from './artifact-part';

export {
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
} from './audit-event';

export {
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
} from './error-taxonomy';

export {
  SIGNED_ENVELOPE_VERSION,
  createSignedEnvelope,
  isSignedEnvelope,
  type SignedEnvelopeAlgorithm,
  type SignedEnvelopeSignature,
  type SignedEnvelope,
  type CreateSignedEnvelopeInput,
} from './signed-envelope';
