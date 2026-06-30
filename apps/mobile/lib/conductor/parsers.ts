/**
 * Pure, dependency-free parsers for the Conductor / Agent OS control-plane
 * payloads. Kept separate from api.ts (which imports react-native config) so the
 * normalisation logic stays unit-testable in isolation.
 *
 * Every parser is defensive: a malformed item returns null (callers filter it
 * out) rather than throwing, so a partial backend payload still renders.
 */

import {
  TASK_RUN_STATES,
  WORKSPACE_STATES,
  type AgentOsApproval,
  type AgentOsRun,
  type ApprovalRequiredAt,
  type ApprovalStatus,
  type ApprovalTarget,
  type ConductorRunEvent,
  type ConductorWorkspace,
  type RunEventType,
  type TaskRunState,
  type WorkspaceState,
  type WorkspaceSubstrate,
} from './types';

type Envelope = { success?: unknown; data?: unknown; error?: unknown };

/** Unwrap a Recoder `{ success, data }` envelope to its `data`, else passthrough. */
export function unwrapEnvelope(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const env = payload as Envelope;
    if ('data' in env) {
      return env.data;
    }
  }
  return payload;
}

export function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const SUBSTRATES: ReadonlySet<WorkspaceSubstrate> = new Set([
  'tmux_worktree',
  'daytona',
  'in_process',
]);

export function parseWorkspace(raw: unknown): ConductorWorkspace | null {
  const r = record(raw);
  if (!r) return null;

  const workspaceId = str(r.workspaceId);
  const state = str(r.state);
  if (!workspaceId || !state || !WORKSPACE_STATES.has(state as WorkspaceState)) {
    return null;
  }

  const substrate = str(r.substrate);

  return {
    workspaceId,
    spaceId: str(r.spaceId) ?? '',
    projectId: str(r.projectId) ?? '',
    taskId: str(r.taskId) ?? '',
    runId: str(r.runId),
    runtimeId: str(r.runtimeId) ?? 'unknown',
    substrate:
      substrate && SUBSTRATES.has(substrate as WorkspaceSubstrate)
        ? (substrate as WorkspaceSubstrate)
        : 'tmux_worktree',
    branch: str(r.branch) ?? '',
    baseRef: str(r.baseRef) ?? '',
    worktreePath: str(r.worktreePath),
    sessionName: str(r.sessionName),
    state: state as WorkspaceState,
    createdBy: str(r.createdBy) ?? '',
    createdAt: str(r.createdAt) ?? new Date().toISOString(),
    updatedAt: str(r.updatedAt) ?? str(r.createdAt) ?? new Date().toISOString(),
    archivedAt: str(r.archivedAt),
    metadata: record(r.metadata) ?? undefined,
  };
}

/**
 * Parse a canonical Agent OS TaskRun (GET /api/agent-os/runs). Drops items
 * missing a runId or carrying an unknown state rather than throwing, so a
 * partial control-plane payload still renders in the monitor.
 */
export function parseRun(raw: unknown): AgentOsRun | null {
  const r = record(raw);
  if (!r) return null;

  const runId = str(r.runId);
  const state = str(r.state);
  if (!runId || !state || !TASK_RUN_STATES.has(state as TaskRunState)) {
    return null;
  }

  return {
    runId,
    taskId: str(r.taskId) ?? '',
    spaceId: str(r.spaceId) ?? '',
    state: state as TaskRunState,
    assigneeAgentId: str(r.assigneeAgentId),
    instructionBundleId: str(r.instructionBundleId),
    startedAt: str(r.startedAt),
    updatedAt: str(r.updatedAt) ?? str(r.startedAt) ?? new Date().toISOString(),
    completedAt: str(r.completedAt),
    metadata: record(r.metadata) ?? undefined,
  };
}

const RUN_EVENT_TYPES: ReadonlySet<RunEventType> = new Set([
  'started',
  'state_transition',
  'log',
  'artifact',
  'needs_input',
  'verified',
  'approval_requested',
  'handoff',
  'failed',
  'completed',
]);

export function parseRunEvent(raw: unknown): ConductorRunEvent | null {
  const r = record(raw);
  if (!r) return null;

  const eventId = str(r.eventId);
  const type = str(r.type);
  if (!eventId || !type) return null;

  return {
    eventId,
    type: RUN_EVENT_TYPES.has(type as RunEventType) ? (type as RunEventType) : 'log',
    taskId: str(r.taskId) ?? '',
    runId: str(r.runId),
    agentId: str(r.agentId),
    state: str(r.state),
    message: str(r.message),
    artifactId: str(r.artifactId),
    createdAt: str(r.createdAt) ?? new Date().toISOString(),
    data: record(r.data) ?? undefined,
  };
}

const APPROVAL_STATUSES: ReadonlySet<ApprovalStatus> = new Set([
  'pending',
  'approved',
  'rejected',
  'expired',
  'escalated',
]);

const REQUIRED_AT_VALUES: ReadonlySet<ApprovalRequiredAt> = new Set([
  'before_execution',
  'before_write',
  'before_push',
  'before_pr',
  'before_sensitive_action',
  'after_verification',
  'custom',
]);

export function parseApprovalTarget(raw: unknown): ApprovalTarget | undefined {
  const r = record(raw);
  if (!r) return undefined;
  const target: ApprovalTarget = {
    path: str(r.path),
    command: str(r.command),
    toolName: str(r.toolName),
  };
  if (!target.path && !target.command && !target.toolName) return undefined;
  return target;
}

export function parseApproval(raw: unknown): AgentOsApproval | null {
  const r = record(raw);
  if (!r) return null;

  const approvalId = str(r.approvalId);
  const status = str(r.status);
  if (!approvalId || !status || !APPROVAL_STATUSES.has(status as ApprovalStatus)) {
    return null;
  }

  const requiredAt = str(r.requiredAt);

  return {
    approvalId,
    taskId: str(r.taskId) ?? '',
    runId: str(r.runId),
    status: status as ApprovalStatus,
    reason: str(r.reason) ?? '',
    requestedBy: str(r.requestedBy) ?? '',
    requestedAt: str(r.requestedAt) ?? new Date().toISOString(),
    requiredAt:
      requiredAt && REQUIRED_AT_VALUES.has(requiredAt as ApprovalRequiredAt)
        ? (requiredAt as ApprovalRequiredAt)
        : 'custom',
    target: parseApprovalTarget(r.target),
    decidedBy: str(r.decidedBy),
    decidedAt: str(r.decidedAt),
    decisionReason: str(r.decisionReason),
    metadata: record(r.metadata) ?? undefined,
  };
}

export function parseRunId(raw: unknown): string | undefined {
  const r = record(raw);
  return r ? str(r.runId) : undefined;
}
