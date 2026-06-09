/**
 * Canonical bridge and orchestration contracts for the Recoder A2A control plane.
 *
 * These types make the Phase 2 bridge/admin API importable instead of leaving it
 * as README-only behavior in tools/a2a-interop. Runtime adapters should keep
 * emitting TaskEnvelope objects; this module defines the shared job/session,
 * approval, handoff, runtime evidence, and history wrappers around them.
 */

import type {
  AuditEvent,
  TaskAgentRef,
  TaskArtifact,
  TaskEnvelope,
  TaskErrorInfo,
  TaskPolicySnapshot,
  TaskResult,
  TaskState,
} from './schemas';

export const A2A_BRIDGE_CONTRACT_VERSION = '2026-06-07' as const;

export const A2A_BRIDGE_ENDPOINTS = {
  jobsNext: '/api/a2a/bridge/jobs/next',
  heartbeat: '/api/a2a/bridge/heartbeat',
  pair: '/api/a2a/bridge/pair',
  sessions: '/api/a2a/bridge/sessions',
  jobs: '/api/a2a/bridge/jobs',
  heartbeats: '/api/a2a/bridge/heartbeats',
  policy: '/api/a2a/policy',
} as const;

export const A2A_BRIDGE_ENDPOINT_PATTERNS = {
  jobResult: '/api/a2a/bridge/jobs/:jobId/result',
  heartbeatByBridgeId: '/api/a2a/bridge/heartbeats/:bridgeId',
  history: '/api/a2a/orchestrate/:threadId/:traceId/history',
  historyStream: '/api/a2a/orchestrate/:threadId/:traceId/history/stream',
  override: '/api/a2a/orchestrate/:threadId/:traceId/override',
  recompute: '/api/a2a/orchestrate/:threadId/:traceId/recompute',
} as const;

export type A2ABridgeEndpoint =
  | (typeof A2A_BRIDGE_ENDPOINTS)[keyof typeof A2A_BRIDGE_ENDPOINTS]
  | (typeof A2A_BRIDGE_ENDPOINT_PATTERNS)[keyof typeof A2A_BRIDGE_ENDPOINT_PATTERNS];

export function bridgeJobResultPath(jobId: string): string {
  return `/api/a2a/bridge/jobs/${encodePathSegment(jobId)}/result`;
}

export function bridgeHeartbeatPath(bridgeId: string): string {
  return `/api/a2a/bridge/heartbeats/${encodePathSegment(bridgeId)}`;
}

export function orchestrationHistoryPath(threadId: string, traceId: string): string {
  return `/api/a2a/orchestrate/${encodePathSegment(threadId)}/${encodePathSegment(traceId)}/history`;
}

export function orchestrationHistoryStreamPath(threadId: string, traceId: string): string {
  return `${orchestrationHistoryPath(threadId, traceId)}/stream`;
}

export function orchestrationOverridePath(threadId: string, traceId: string): string {
  return `/api/a2a/orchestrate/${encodePathSegment(threadId)}/${encodePathSegment(traceId)}/override`;
}

export function orchestrationRecomputePath(threadId: string, traceId: string): string {
  return `/api/a2a/orchestrate/${encodePathSegment(threadId)}/${encodePathSegment(traceId)}/recompute`;
}

export function isA2ABridgeEndpoint(path: string): path is A2ABridgeEndpoint {
  const endpoints = Object.values(A2A_BRIDGE_ENDPOINTS) as readonly string[];
  const patterns = Object.values(A2A_BRIDGE_ENDPOINT_PATTERNS) as readonly string[];
  return endpoints.includes(path) || patterns.includes(path);
}

export type BridgeAgentStatus = 'online' | 'degraded' | 'offline';

export type BridgeSessionStatus = 'paired' | 'online' | 'degraded' | 'stale' | 'offline' | 'revoked';

export type BridgeJobStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface BridgeOwnershipScope {
  agentId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  organizationId?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface BridgeJob {
  jobId: string;
  agentId: string;
  envelope: TaskEnvelope;
  traceId?: string;
  scope?: BridgeOwnershipScope;
  status?: BridgeJobStatus;
  attempts?: number;
  createdAt?: string;
  claimedAt?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface BridgeJobCreateRequest {
  agentId: string;
  envelope: TaskEnvelope;
  scope?: BridgeOwnershipScope;
  priority?: number;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface BridgeJobCreateResponse {
  job: BridgeJob;
  acceptedAt: string;
}

export interface BridgeJobResultRequest {
  bridgeId: string;
  jobId: string;
  traceId?: string | null;
  ok: boolean;
  resultEnvelope?: TaskEnvelope;
  result?: TaskResult;
  error?: TaskErrorInfo;
  artifacts?: TaskArtifact[];
  evidence?: RuntimeEvidence[];
  metadata?: Record<string, unknown>;
}

export interface BridgeJobResultResponse {
  jobId: string;
  accepted: boolean;
  status: BridgeJobStatus;
  receivedAt: string;
  historyEventId?: string;
  error?: TaskErrorInfo;
}

export interface BridgeHeartbeatRequest {
  bridgeId: string;
  agentId?: string;
  workspaceId?: string;
  projectId?: string;
  status?: BridgeAgentStatus;
  capabilities: string[];
  startedAt?: string;
  observedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface BridgeHeartbeatRecord extends BridgeHeartbeatRequest {
  heartbeatId: string;
  receivedAt: string;
  sessionId?: string;
}

export interface BridgePairRequest {
  bridgeId: string;
  pairingCode?: string;
  agentId?: string;
  workspaceId?: string;
  projectId?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface BridgePairResponse {
  bridgeId: string;
  sessionId: string;
  token: string;
  tokenExpiresAt: string;
  reused: boolean;
  scope: BridgeOwnershipScope;
  pairedAt: string;
}

export interface BridgeSession {
  sessionId: string;
  bridgeId: string;
  tokenId?: string;
  status: BridgeSessionStatus;
  scope: BridgeOwnershipScope;
  latestHeartbeat?: BridgeHeartbeatRecord;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface BridgeSessionListResponse {
  sessions: BridgeSession[];
  cursor?: string;
  hasMore: boolean;
}

export interface BridgeHeartbeatListResponse {
  heartbeats: BridgeHeartbeatRecord[];
  cursor?: string;
  hasMore: boolean;
}

export type BridgePolicyEffect = 'allow' | 'deny' | 'require_approval';

export interface BridgePolicyRule {
  id: string;
  effect: BridgePolicyEffect;
  action: string;
  reason: string;
  priority?: number;
  pathGlobs?: string[];
  agentIds?: string[];
  workspaceIds?: string[];
  runtimeKinds?: string[];
  metadata?: Record<string, unknown>;
}

export interface BridgePolicyDocument {
  version: string;
  updatedAt: string;
  updatedBy?: string;
  defaultEffect: BridgePolicyEffect;
  rules: BridgePolicyRule[];
  metadata?: Record<string, unknown>;
}

export type RuntimeEvidenceKind =
  | 'clone_provenance'
  | 'git_status'
  | 'stdout'
  | 'stderr'
  | 'file_mutation'
  | 'preview_link'
  | 'screenshot'
  | 'browser_trace'
  | 'desktop_artifact'
  | 'verification_output'
  | 'custom';

export interface RuntimeEvidenceArtifactRef {
  artifactId: string;
  key?: string;
  uri?: string;
  mimeType?: string;
}

export interface RuntimeEvidence {
  evidenceId: string;
  kind: RuntimeEvidenceKind;
  source: string;
  summary: string;
  capturedAt: string;
  workspaceId?: string;
  taskId?: string;
  runId?: string;
  traceId?: string;
  artifact?: RuntimeEvidenceArtifactRef;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type ApprovalCheckpointState = 'requested' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export interface ApprovalCheckpoint {
  approvalId: string;
  taskId: string;
  state: ApprovalCheckpointState;
  requestedBy: TaskAgentRef;
  requestedAt: string;
  reason: string;
  decidedBy?: TaskAgentRef;
  decidedAt?: string;
  decisionReason?: string;
  policy?: TaskPolicySnapshot;
  metadata?: Record<string, unknown>;
}

export type HandoffCheckpointState = 'requested' | 'accepted' | 'rejected' | 'completed' | 'cancelled';

export interface HandoffCheckpoint {
  handoffId: string;
  taskId: string;
  state: HandoffCheckpointState;
  from?: TaskAgentRef;
  to: TaskAgentRef;
  requestedAt: string;
  reason: string;
  decidedAt?: string;
  decisionReason?: string;
  metadata?: Record<string, unknown>;
}

export type RunHistoryEventKind =
  | 'envelope.received'
  | 'task.state_changed'
  | 'bridge.job_created'
  | 'bridge.job_claimed'
  | 'bridge.result_received'
  | 'bridge.heartbeat'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'approval.cancelled'
  | 'approval.expired'
  | 'handoff.requested'
  | 'handoff.accepted'
  | 'handoff.rejected'
  | 'handoff.completed'
  | 'handoff.cancelled'
  | 'artifact.created'
  | 'runtime.evidence'
  | 'policy.checked'
  | 'override.applied'
  | 'recompute.requested'
  | 'run.completed'
  | 'run.failed';

export interface RunHistoryEvent {
  eventId: string;
  kind: RunHistoryEventKind;
  workspaceId: string;
  threadId: string;
  traceId: string;
  createdAt: string;
  taskId?: string;
  runId?: string;
  envelopeId?: string;
  actor?: TaskAgentRef;
  state?: TaskState;
  bridgeSession?: Pick<BridgeSession, 'sessionId' | 'bridgeId' | 'status' | 'scope'>;
  bridgeJob?: Pick<BridgeJob, 'jobId' | 'agentId' | 'status' | 'attempts'>;
  approval?: ApprovalCheckpoint;
  handoff?: HandoffCheckpoint;
  evidence?: RuntimeEvidence;
  artifact?: TaskArtifact;
  policy?: TaskPolicySnapshot;
  auditEvent?: AuditEvent;
  metadata?: Record<string, unknown>;
}

export interface OrchestrationHistoryRequest {
  threadId: string;
  traceId: string;
  cursor?: string;
  limit?: number;
  eventTypes?: RunHistoryEventKind[];
  sinceAt?: string;
  lastEventId?: string;
}

export interface OrchestrationHistoryResponse {
  threadId: string;
  traceId: string;
  events: RunHistoryEvent[];
  cursor?: string;
  hasMore: boolean;
}

export interface OrchestrationOverrideRequest {
  threadId: string;
  traceId: string;
  requestedBy: TaskAgentRef;
  reason: string;
  targetState?: TaskState;
  assignee?: TaskAgentRef;
  policyOverride?: TaskPolicySnapshot;
  metadata?: Record<string, unknown>;
}

export interface OrchestrationOverrideResponse {
  accepted: boolean;
  historyEvent: RunHistoryEvent;
  updatedEnvelope?: TaskEnvelope;
}

export interface OrchestrationRecomputeRequest {
  threadId: string;
  traceId: string;
  requestedBy: TaskAgentRef;
  reason: string;
  fromEventId?: string;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OrchestrationRecomputeResponse {
  accepted: boolean;
  dryRun: boolean;
  historyEvents: RunHistoryEvent[];
  updatedEnvelope?: TaskEnvelope;
}

export interface CreateRuntimeEvidenceInput extends Omit<RuntimeEvidence, 'capturedAt'> {
  capturedAt?: string;
}

export function createRuntimeEvidence(input: CreateRuntimeEvidenceInput): RuntimeEvidence {
  return {
    ...input,
    capturedAt: input.capturedAt ?? nowIso(),
  };
}

export interface CreateApprovalCheckpointInput extends Omit<ApprovalCheckpoint, 'requestedAt'> {
  requestedAt?: string;
}

export function createApprovalCheckpoint(input: CreateApprovalCheckpointInput): ApprovalCheckpoint {
  return {
    ...input,
    requestedAt: input.requestedAt ?? nowIso(),
  };
}

export interface CreateHandoffCheckpointInput extends Omit<HandoffCheckpoint, 'requestedAt'> {
  requestedAt?: string;
}

export function createHandoffCheckpoint(input: CreateHandoffCheckpointInput): HandoffCheckpoint {
  return {
    ...input,
    requestedAt: input.requestedAt ?? nowIso(),
  };
}

export interface CreateRunHistoryEventInput extends Omit<RunHistoryEvent, 'createdAt'> {
  createdAt?: string;
}

export function createRunHistoryEvent(input: CreateRunHistoryEventInput): RunHistoryEvent {
  return {
    ...input,
    createdAt: input.createdAt ?? nowIso(),
  };
}

export function isBridgeJob(value: unknown): value is BridgeJob {
  return (
    isRecord(value) &&
    typeof value.jobId === 'string' &&
    typeof value.agentId === 'string' &&
    isTaskEnvelopeLike(value.envelope)
  );
}

export function isBridgeHeartbeatRequest(value: unknown): value is BridgeHeartbeatRequest {
  return (
    isRecord(value) &&
    typeof value.bridgeId === 'string' &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every((capability) => typeof capability === 'string')
  );
}

export function isRunHistoryEvent(value: unknown): value is RunHistoryEvent {
  return (
    isRecord(value) &&
    typeof value.eventId === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.workspaceId === 'string' &&
    typeof value.threadId === 'string' &&
    typeof value.traceId === 'string' &&
    typeof value.createdAt === 'string'
  );
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function isTaskEnvelopeLike(value: unknown): value is TaskEnvelope {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.workspace_id === 'string' &&
    typeof value.thread_id === 'string' &&
    typeof value.trace_id === 'string' &&
    typeof value.state === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
