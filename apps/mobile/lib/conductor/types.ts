/**
 * Conductor / Agent OS control-plane types (mobile monitor + approve surface).
 *
 * Mobile is a READ-ONLY monitor + approve client, not an authoring surface.
 * These types mirror the canonical Recoder control-plane contracts exposed by
 * docker-backend:
 *   - Workspace / RunEvent  -> @recoder/agent-os domain (GET /api/conductor/*)
 *   - Approval              -> @recoder/agent-os domain (/api/agent-os/approvals)
 *
 * They are intentionally permissive ("?" everywhere a backend field may be
 * absent) so the mobile parsers can degrade gracefully on partial payloads
 * instead of throwing. The canonical state of record stays in Recoder; this is
 * a projection for display + decision only.
 */

// ---------------------------------------------------------------------------
// Workspaces (Conductor)
// ---------------------------------------------------------------------------

export type WorkspaceState =
  | 'created'
  | 'setting_up'
  | 'ready'
  | 'running'
  | 'awaiting_approval'
  | 'awaiting_review'
  | 'changes_requested'
  | 'merging'
  | 'merged'
  | 'failed'
  | 'cancelled'
  | 'archived';

export const WORKSPACE_STATES: ReadonlySet<WorkspaceState> = new Set([
  'created',
  'setting_up',
  'ready',
  'running',
  'awaiting_approval',
  'awaiting_review',
  'changes_requested',
  'merging',
  'merged',
  'failed',
  'cancelled',
  'archived',
]);

export type WorkspaceSubstrate = 'tmux_worktree' | 'daytona' | 'in_process';

export interface ConductorWorkspace {
  workspaceId: string;
  spaceId: string;
  projectId: string;
  taskId: string;
  runId?: string;
  runtimeId: string;
  substrate: WorkspaceSubstrate;
  branch: string;
  baseRef: string;
  worktreePath?: string;
  sessionName?: string;
  state: WorkspaceState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// RunEvents
// ---------------------------------------------------------------------------

export type RunEventType =
  | 'started'
  | 'state_transition'
  | 'log'
  | 'artifact'
  | 'needs_input'
  | 'verified'
  | 'approval_requested'
  | 'handoff'
  | 'failed'
  | 'completed';

export interface ConductorRunEvent {
  eventId: string;
  type: RunEventType;
  taskId: string;
  runId?: string;
  agentId?: string;
  state?: string;
  message?: string;
  artifactId?: string;
  createdAt: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Approvals (Agent OS)
// ---------------------------------------------------------------------------

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'escalated';

export const PENDING_APPROVAL_STATUSES: ReadonlySet<ApprovalStatus> = new Set([
  'pending',
  'escalated',
]);

export type ApprovalRequiredAt =
  | 'before_execution'
  | 'before_write'
  | 'before_push'
  | 'before_pr'
  | 'before_sensitive_action'
  | 'after_verification'
  | 'custom';

export interface ApprovalTarget {
  path?: string;
  command?: string;
  toolName?: string;
}

export interface AgentOsApproval {
  approvalId: string;
  taskId: string;
  runId?: string;
  status: ApprovalStatus;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  requiredAt: ApprovalRequiredAt;
  target?: ApprovalTarget;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of an approve/reject decision. The backend returns both the decided
 * approval and (optionally) the run it advanced.
 */
export interface ApprovalDecisionResult {
  approval: AgentOsApproval;
  runId?: string;
}
