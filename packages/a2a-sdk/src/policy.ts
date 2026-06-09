/**
 * Shared policy types for the Recoder Agent OS control plane.
 *
 * These contracts describe what an agent is allowed to do, when approval
 * is required, and how runtime safety constraints are represented across
 * Claude, Codex, Recoder Code, and future runtimes.
 */

export type PermissionEffect = 'allow' | 'deny';

export const PermissionEffectEnum = {
  Allow: 'allow' as const satisfies PermissionEffect,
  Deny: 'deny' as const satisfies PermissionEffect,
} as const;

export const PERMISSION_EFFECTS: readonly PermissionEffect[] = [
  PermissionEffectEnum.Allow,
  PermissionEffectEnum.Deny,
] as const;

export type ToolPermissionMode = 'read' | 'write' | 'execute' | 'network' | 'custom';

export const ToolPermissionModeEnum = {
  Read: 'read' as const satisfies ToolPermissionMode,
  Write: 'write' as const satisfies ToolPermissionMode,
  Execute: 'execute' as const satisfies ToolPermissionMode,
  Network: 'network' as const satisfies ToolPermissionMode,
  Custom: 'custom' as const satisfies ToolPermissionMode,
} as const;

export const TOOL_PERMISSION_MODES: readonly ToolPermissionMode[] = [
  ToolPermissionModeEnum.Read,
  ToolPermissionModeEnum.Write,
  ToolPermissionModeEnum.Execute,
  ToolPermissionModeEnum.Network,
  ToolPermissionModeEnum.Custom,
] as const;

export type ApprovalRequirementAt =
  | 'before_execution'
  | 'before_write'
  | 'before_push'
  | 'before_pr'
  | 'before_sensitive_action'
  | 'after_verification'
  | 'custom';

export const ApprovalRequirementAtEnum = {
  BeforeExecution: 'before_execution' as const satisfies ApprovalRequirementAt,
  BeforeWrite: 'before_write' as const satisfies ApprovalRequirementAt,
  BeforePush: 'before_push' as const satisfies ApprovalRequirementAt,
  BeforePr: 'before_pr' as const satisfies ApprovalRequirementAt,
  BeforeSensitiveAction: 'before_sensitive_action' as const satisfies ApprovalRequirementAt,
  AfterVerification: 'after_verification' as const satisfies ApprovalRequirementAt,
  Custom: 'custom' as const satisfies ApprovalRequirementAt,
} as const;

export const APPROVAL_REQUIREMENT_TIMINGS: readonly ApprovalRequirementAt[] = [
  ApprovalRequirementAtEnum.BeforeExecution,
  ApprovalRequirementAtEnum.BeforeWrite,
  ApprovalRequirementAtEnum.BeforePush,
  ApprovalRequirementAtEnum.BeforePr,
  ApprovalRequirementAtEnum.BeforeSensitiveAction,
  ApprovalRequirementAtEnum.AfterVerification,
  ApprovalRequirementAtEnum.Custom,
] as const;

export type ApprovalDecision = 'approved' | 'rejected';

export const ApprovalDecisionEnum = {
  Approved: 'approved' as const satisfies ApprovalDecision,
  Rejected: 'rejected' as const satisfies ApprovalDecision,
} as const;

export type ApprovalGateStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export const ApprovalGateStatusEnum = {
  Pending: 'pending' as const satisfies ApprovalGateStatus,
  Approved: 'approved' as const satisfies ApprovalGateStatus,
  Rejected: 'rejected' as const satisfies ApprovalGateStatus,
  Expired: 'expired' as const satisfies ApprovalGateStatus,
} as const;

export const APPROVAL_GATE_STATUSES: readonly ApprovalGateStatus[] = [
  ApprovalGateStatusEnum.Pending,
  ApprovalGateStatusEnum.Approved,
  ApprovalGateStatusEnum.Rejected,
  ApprovalGateStatusEnum.Expired,
] as const;

export type ApprovalPolicyMode = 'manual' | 'policy' | 'auto';

export const ApprovalPolicyModeEnum = {
  Manual: 'manual' as const satisfies ApprovalPolicyMode,
  Policy: 'policy' as const satisfies ApprovalPolicyMode,
  Auto: 'auto' as const satisfies ApprovalPolicyMode,
} as const;

export const APPROVAL_POLICY_MODES: readonly ApprovalPolicyMode[] = [
  ApprovalPolicyModeEnum.Manual,
  ApprovalPolicyModeEnum.Policy,
  ApprovalPolicyModeEnum.Auto,
] as const;

export type CwdPolicyMode = 'repo_root' | 'workspace_root' | 'task_path' | 'custom';

export const CwdPolicyModeEnum = {
  RepoRoot: 'repo_root' as const satisfies CwdPolicyMode,
  WorkspaceRoot: 'workspace_root' as const satisfies CwdPolicyMode,
  TaskPath: 'task_path' as const satisfies CwdPolicyMode,
  Custom: 'custom' as const satisfies CwdPolicyMode,
} as const;

export const CWD_POLICY_MODES: readonly CwdPolicyMode[] = [
  CwdPolicyModeEnum.RepoRoot,
  CwdPolicyModeEnum.WorkspaceRoot,
  CwdPolicyModeEnum.TaskPath,
  CwdPolicyModeEnum.Custom,
] as const;

export type RuntimeHealthStatus = 'healthy' | 'degraded' | 'offline' | 'error' | 'unknown';

export const RuntimeHealthStatusEnum = {
  Healthy: 'healthy' as const satisfies RuntimeHealthStatus,
  Degraded: 'degraded' as const satisfies RuntimeHealthStatus,
  Offline: 'offline' as const satisfies RuntimeHealthStatus,
  Error: 'error' as const satisfies RuntimeHealthStatus,
  Unknown: 'unknown' as const satisfies RuntimeHealthStatus,
} as const;

export const RUNTIME_HEALTH_STATUSES: readonly RuntimeHealthStatus[] = [
  RuntimeHealthStatusEnum.Healthy,
  RuntimeHealthStatusEnum.Degraded,
  RuntimeHealthStatusEnum.Offline,
  RuntimeHealthStatusEnum.Error,
  RuntimeHealthStatusEnum.Unknown,
] as const;

export interface PathPermissionRule {
  glob: string;
  effect: PermissionEffect;
  reason?: string;
  requires_approval?: boolean;
}

export interface ToolPermissionRule {
  tool_name: string;
  effect: PermissionEffect;
  modes?: ToolPermissionMode[];
  reason?: string;
  requires_approval?: boolean;
}

export interface AgentPermissionPolicy {
  default_file_effect: PermissionEffect;
  path_rules: PathPermissionRule[];
  tool_rules: ToolPermissionRule[];
  allow_network: boolean;
  allow_shell: boolean;
  allow_git_write: boolean;
  allow_pr_creation: boolean;
  allow_secrets_access: boolean;
  max_parallel_subagents: number;
  write_lock_required: boolean;
}

export interface ApprovalRule {
  id: string;
  label: string;
  when: ApprovalRequirementAt;
  required: boolean;
  path_globs?: string[];
  capability_ids?: string[];
  detail?: string;
}

export interface ApprovalPolicy {
  mode: ApprovalPolicyMode;
  required_rules: ApprovalRule[];
  allow_auto_approval_for_low_risk: boolean;
  escalation_target?: string;
}

export interface CwdPolicy {
  mode: CwdPolicyMode;
  allowed_roots: string[];
  preferred_root?: string;
}

export interface RuntimeHealth {
  status: RuntimeHealthStatus;
  checked_at: string;
  message?: string;
  details?: Record<string, unknown>;
  latency_ms?: number;
}

export interface ApprovalGate {
  approval_id: string;
  title: string;
  status: ApprovalGateStatus;
  required_at: ApprovalRequirementAt;
  reason: string;
  path_globs?: string[];
  capability_ids?: string[];
  approver?: string;
  decided_at?: string;
  metadata?: Record<string, unknown>;
}
