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

  // -- signed-envelope --------------------------------------------------------
  SIGNED_ENVELOPE_VERSION,
  createSignedEnvelope,
  isSignedEnvelope,
  type SignedEnvelopeAlgorithm,
  type SignedEnvelopeSignature,
  type SignedEnvelope,
  type CreateSignedEnvelopeInput,
} from './schemas';

// ---------------------------------------------------------------------------
// Canonical Agent OS contracts
// ---------------------------------------------------------------------------

export {
  AgentVendorSurfaceEnum,
  AGENT_VENDOR_SURFACES,
  AgentRuntimeKindEnum,
  AGENT_RUNTIME_KINDS,
  AgentCapabilityKindEnum,
  AGENT_CAPABILITY_KINDS,
  ToolCapabilityModeEnum,
  TOOL_CAPABILITY_MODES,
  MemoryScopeEnum,
  MEMORY_SCOPES,
  createAgentProfile,
  type AgentVendorSurface,
  type AgentRuntimeKind,
  type AgentCapabilityKind,
  type ToolCapabilityMode,
  type MemoryScope,
  type AgentCapability,
  type ToolCapability,
  type AgentProfile,
  type CreateAgentProfileInput,
} from './agent-profile';

export {
  TaskIntentEnum,
  TASK_INTENTS,
  isTaskIntent,
  type TaskIntent,
} from './task-intent';

export {
  PermissionEffectEnum,
  PERMISSION_EFFECTS,
  ToolPermissionModeEnum,
  TOOL_PERMISSION_MODES,
  ApprovalRequirementAtEnum,
  APPROVAL_REQUIREMENT_TIMINGS,
  ApprovalDecisionEnum,
  ApprovalGateStatusEnum,
  APPROVAL_GATE_STATUSES,
  ApprovalPolicyModeEnum,
  APPROVAL_POLICY_MODES,
  CwdPolicyModeEnum,
  CWD_POLICY_MODES,
  RuntimeHealthStatusEnum,
  RUNTIME_HEALTH_STATUSES,
  type PermissionEffect,
  type ToolPermissionMode,
  type ApprovalRequirementAt,
  type ApprovalDecision,
  type ApprovalGateStatus,
  type ApprovalPolicyMode,
  type CwdPolicyMode,
  type RuntimeHealthStatus,
  type PathPermissionRule,
  type ToolPermissionRule,
  type AgentPermissionPolicy,
  type ApprovalRule,
  type ApprovalPolicy,
  type CwdPolicy,
  type RuntimeHealth,
  type ApprovalGate,
} from './policy';

export {
  InstructionSourceKindEnum,
  INSTRUCTION_SOURCE_KINDS,
  MemoryReferenceScopeEnum,
  MEMORY_REFERENCE_SCOPES,
  createInstructionBundle,
  type InstructionSourceKind,
  type MemoryReferenceScope,
  type InstructionSourceRef,
  type MemoryRef,
  type InstructionProvenanceSourceFile,
  type InstructionBundleProvenance,
  type InstructionBundle,
  type CreateInstructionBundleInput,
} from './instruction-bundle';

export * from './client';
export * from './server';
export * from './signing';

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
  validateAgentProfile,
  isValidAgentProfile,
  assertAgentProfile,
  validateInstructionBundle,
  isValidInstructionBundle,
  assertInstructionBundle,
} from './validation';

// ---------------------------------------------------------------------------
// SDK helpers: Inbound ingress normalization (shared entrypoint for consumers)
// ---------------------------------------------------------------------------

export {
  type NormalizeInboundEnvelopeOptions,
  type NormalizeInboundEnvelopeResult,
  normalizeInboundEnvelope,
} from './ingress';

export {
  type LegacyInboundEnvelope,
  type AdaptLegacyEnvelopeOptions,
  adaptLegacyEnvelopeToTaskEnvelope,
} from './envelope-adapters';

export {
  type NormalizeLegacyInboundEnvelopeOptions,
  type NormalizeLegacyInboundEnvelopeResult,
  normalizeLegacyInboundEnvelope,
} from './legacy-ingress';

// ---------------------------------------------------------------------------
// SDK helpers: Bridge and orchestration contracts
// ---------------------------------------------------------------------------

export {
  A2A_BRIDGE_CONTRACT_VERSION,
  A2A_BRIDGE_ENDPOINTS,
  A2A_BRIDGE_ENDPOINT_PATTERNS,
  bridgeHeartbeatPath,
  bridgeJobResultPath,
  createApprovalCheckpoint,
  createHandoffCheckpoint,
  createRunHistoryEvent,
  createRuntimeEvidence,
  isA2ABridgeEndpoint,
  isBridgeHeartbeatRequest,
  isBridgeJob,
  isRunHistoryEvent,
  orchestrationHistoryPath,
  orchestrationHistoryStreamPath,
  orchestrationOverridePath,
  orchestrationRecomputePath,
  type A2ABridgeEndpoint,
  type ApprovalCheckpoint,
  type ApprovalCheckpointState,
  type BridgeAgentStatus,
  type BridgeHeartbeatListResponse,
  type BridgeHeartbeatRecord,
  type BridgeHeartbeatRequest,
  type BridgeJob,
  type BridgeJobCreateRequest,
  type BridgeJobCreateResponse,
  type BridgeJobResultRequest,
  type BridgeJobResultResponse,
  type BridgeJobStatus,
  type BridgeOwnershipScope,
  type BridgePairRequest,
  type BridgePairResponse,
  type BridgePolicyDocument,
  type BridgePolicyEffect,
  type BridgePolicyRule,
  type BridgeSession,
  type BridgeSessionListResponse,
  type BridgeSessionStatus,
  type CreateApprovalCheckpointInput,
  type CreateHandoffCheckpointInput,
  type CreateRunHistoryEventInput,
  type CreateRuntimeEvidenceInput,
  type HandoffCheckpoint,
  type HandoffCheckpointState,
  type OrchestrationHistoryRequest,
  type OrchestrationHistoryResponse,
  type OrchestrationOverrideRequest,
  type OrchestrationOverrideResponse,
  type OrchestrationRecomputeRequest,
  type OrchestrationRecomputeResponse,
  type RunHistoryEvent,
  type RunHistoryEventKind,
  type RuntimeEvidence,
  type RuntimeEvidenceArtifactRef,
  type RuntimeEvidenceKind,
} from './bridge-contract';
