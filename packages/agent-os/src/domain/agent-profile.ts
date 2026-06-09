export type AgentSurface =
  | 'recoder_code'
  | 'claude_code'
  | 'codex'
  | 'opencode'
  | 'qwen_code'
  | 'gemini_cli'
  | 'browser'
  | 'custom';

export type RuntimeKind = 'local' | 'sandbox' | 'hosted' | 'browser' | 'external';

export type AgentCapabilityKind =
  | 'implementation'
  | 'review'
  | 'verification'
  | 'browser'
  | 'memory'
  | 'deployment'
  | 'planning'
  | 'custom';

export type AgentCapability = {
  capabilityId: string;
  kind: AgentCapabilityKind;
  label: string;
  metadata?: Record<string, unknown>;
};

export type ToolCapability = {
  toolName: string;
  modes: Array<'read' | 'write' | 'execute' | 'network' | 'custom'>;
  metadata?: Record<string, unknown>;
};

export type RuntimeHealth = {
  status: 'healthy' | 'degraded' | 'offline' | 'error' | 'unknown';
  checkedAt: string;
  message?: string;
  details?: Record<string, unknown>;
};

export type AgentProfile = {
  agentId: string;
  displayName: string;
  vendorSurface: AgentSurface;
  connectorId: string;
  runtimeKind: RuntimeKind;
  capabilities: AgentCapability[];
  tools: ToolCapability[];
  supportedTaskIntents: string[];
  permissions: AgentPermissionPolicy;
  approvalPolicy: ApprovalPolicy;
  memoryScope: MemoryScope;
  cwdPolicy: CwdPolicy;
  health: RuntimeHealth;
  lastSeenAt: string;
};

export type PermissionEffect = 'allow' | 'deny';

export type AgentPermissionPolicy = {
  defaultFileEffect: PermissionEffect;
  pathRules: Array<{
    glob: string;
    effect: PermissionEffect;
    reason?: string;
    requiresApproval?: boolean;
  }>;
  toolRules: Array<{
    toolName: string;
    effect: PermissionEffect;
    modes?: string[];
    reason?: string;
    requiresApproval?: boolean;
  }>;
  allowNetwork: boolean;
  allowShell: boolean;
  allowGitWrite: boolean;
  allowPrCreation: boolean;
  allowSecretsAccess: boolean;
  maxParallelSubagents: number;
  writeLockRequired: boolean;
};

export type ApprovalPolicy = {
  mode: 'manual' | 'policy' | 'auto';
  requiredRules: ApprovalRule[];
  allowAutoApprovalForLowRisk: boolean;
  escalationTarget?: string;
};

export type ApprovalRule = {
  id: string;
  label: string;
  when:
    | 'before_execution'
    | 'before_write'
    | 'before_push'
    | 'before_pr'
    | 'before_sensitive_action'
    | 'after_verification'
    | 'custom';
  required: boolean;
  pathGlobs?: string[];
  capabilityIds?: string[];
  detail?: string;
};

export type MemoryScope = 'none' | 'space' | 'repo' | 'path' | 'user' | 'org' | 'agent' | 'task-type';

export type CwdPolicy = {
  mode: 'repo_root' | 'workspace_root' | 'task_path' | 'custom';
  allowedRoots: string[];
  preferredRoot?: string;
};
