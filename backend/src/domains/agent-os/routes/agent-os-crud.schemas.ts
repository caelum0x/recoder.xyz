/**
 * Boundary zod schemas for the `/api/agent-os` CRUD edge table. Each schema
 * mirrors its frozen `@recoder/agent-os` domain type 1:1 (shape only — state
 * legality stays with the package's transition contracts). Kept in their own
 * file so the route table stays readable (api rule: validate at the boundary,
 * never trust external data).
 */
import { z } from 'zod';

// — Frozen union literals from `@recoder/agent-os` (kept in sync with the package) —

export const TASK_RUN_STATES = [
  'created', 'compiled', 'routed', 'claimed', 'running', 'needs_input',
  'verifying', 'waiting_for_approval', 'approved', 'delivered', 'completed',
  'failed', 'cancelled', 'rejected',
] as const;

const TASK_INTENTS = [
  'bugfix', 'feature_delivery', 'platform_hardening', 'refactor', 'code_review',
  'test_generation', 'verification', 'documentation', 'research', 'release',
  'incident_response', 'migration', 'handoff', 'custom',
] as const;

const AGENT_SURFACES = [
  'recoder_code', 'claude_code', 'codex', 'opencode', 'qwen_code', 'gemini_cli',
  'browser', 'custom',
] as const;

const RUNTIME_KINDS = ['local', 'sandbox', 'hosted', 'browser', 'external'] as const;

const CAPABILITY_KINDS = [
  'implementation', 'review', 'verification', 'browser', 'memory', 'deployment',
  'planning', 'custom',
] as const;

const MEMORY_SCOPES = ['none', 'space', 'repo', 'path', 'user', 'org', 'agent', 'task-type'] as const;

const MEMORY_ITEM_SCOPES = ['user', 'org', 'space', 'repo', 'path', 'agent', 'task-type'] as const;

const ARTIFACT_KINDS = [
  'summary', 'changed_files', 'test_output', 'preview', 'pull_request',
  'screenshot', 'verification', 'instruction_bundle', 'memory_candidate',
  'log', 'custom',
] as const;

const APPROVAL_GATE_POINTS = [
  'before_execution', 'before_write', 'before_push', 'before_pr',
  'before_sensitive_action', 'after_verification', 'custom',
] as const;

const PERMISSION_EFFECTS = ['allow', 'deny'] as const;

const metadata = z.record(z.unknown()).optional();

// — Spaces —

const spacePolicySchema = z.object({
  policyId: z.string().min(1),
  approvalRequiredFor: z.array(z.string()),
  forbiddenPaths: z.array(z.string()),
  defaultVerificationCommands: z.array(z.string()),
  allowNetworkByDefault: z.boolean(),
  allowShellByDefault: z.boolean(),
  metadata,
});

const spaceRepositoryRefSchema = z.object({
  repoId: z.string().min(1),
  provider: z.enum(['github', 'gitlab', 'bitbucket', 'local', 'custom']),
  owner: z.string(),
  name: z.string().min(1),
  defaultBranch: z.string().optional(),
  url: z.string().optional(),
});

export const spaceUpsertSchema = z.object({
  spaceId: z.string().min(1),
  displayName: z.string().min(1),
  ownerId: z.string().min(1),
  repositories: z.array(spaceRepositoryRefSchema).default([]),
  policy: spacePolicySchema,
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  metadata,
});

export const spacePolicyPutSchema = spacePolicySchema;

// — Agents —

const agentPermissionPolicySchema = z.object({
  defaultFileEffect: z.enum(PERMISSION_EFFECTS),
  pathRules: z.array(
    z.object({
      glob: z.string().min(1),
      effect: z.enum(PERMISSION_EFFECTS),
      reason: z.string().optional(),
      requiresApproval: z.boolean().optional(),
    }),
  ),
  toolRules: z.array(
    z.object({
      toolName: z.string().min(1),
      effect: z.enum(PERMISSION_EFFECTS),
      modes: z.array(z.string()).optional(),
      reason: z.string().optional(),
      requiresApproval: z.boolean().optional(),
    }),
  ),
  allowNetwork: z.boolean(),
  allowShell: z.boolean(),
  allowGitWrite: z.boolean(),
  allowPrCreation: z.boolean(),
  allowSecretsAccess: z.boolean(),
  maxParallelSubagents: z.number().int().min(0),
  writeLockRequired: z.boolean(),
});

const approvalPolicySchema = z.object({
  mode: z.enum(['manual', 'policy', 'auto']),
  requiredRules: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string(),
      when: z.enum(APPROVAL_GATE_POINTS),
      required: z.boolean(),
      pathGlobs: z.array(z.string()).optional(),
      capabilityIds: z.array(z.string()).optional(),
      detail: z.string().optional(),
    }),
  ),
  allowAutoApprovalForLowRisk: z.boolean(),
  escalationTarget: z.string().optional(),
});

export const agentUpsertSchema = z.object({
  agentId: z.string().min(1),
  displayName: z.string().min(1),
  vendorSurface: z.enum(AGENT_SURFACES),
  connectorId: z.string().min(1),
  runtimeKind: z.enum(RUNTIME_KINDS),
  capabilities: z.array(
    z.object({
      capabilityId: z.string().min(1),
      kind: z.enum(CAPABILITY_KINDS),
      label: z.string(),
      metadata,
    }),
  ),
  tools: z.array(
    z.object({
      toolName: z.string().min(1),
      modes: z.array(z.enum(['read', 'write', 'execute', 'network', 'custom'])),
      metadata,
    }),
  ),
  supportedTaskIntents: z.array(z.string()),
  permissions: agentPermissionPolicySchema,
  approvalPolicy: approvalPolicySchema,
  memoryScope: z.enum(MEMORY_SCOPES),
  cwdPolicy: z.object({
    mode: z.enum(['repo_root', 'workspace_root', 'task_path', 'custom']),
    allowedRoots: z.array(z.string()),
    preferredRoot: z.string().optional(),
  }),
  health: z.object({
    status: z.enum(['healthy', 'degraded', 'offline', 'error', 'unknown']),
    checkedAt: z.string().min(1),
    message: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
  lastSeenAt: z.string().min(1).optional(),
});

// — Tasks —

export const taskUpsertSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  intent: z.enum(TASK_INTENTS),
  goal: z.string().min(1),
  spaceId: z.string().min(1),
  repo: z.string().optional(),
  branchPolicy: z.enum(['reuse_branch', 'create_worktree_branch', 'no_git_write', 'custom']).optional(),
  targetPaths: z.array(z.string()).default([]),
  forbiddenPaths: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  verification: z.object({
    commands: z.array(z.string()),
    browserChecks: z.array(z.string()).optional(),
    evidenceRequired: z.array(z.string()).optional(),
  }),
  approvalRequired: z.array(z.string()).default([]),
  artifactRequired: z.array(z.string()).default([]),
  handoff: z
    .object({ reviewer: z.string().optional(), finalOwner: z.string().optional() })
    .optional(),
  metadata,
});

// — Runs (creation + state transition; legality is the package reducer's) —

export const runCreateSchema = z.object({
  runId: z.string().min(1).optional(),
  taskId: z.string().min(1),
  assigneeAgentId: z.string().min(1).optional(),
  instructionBundleId: z.string().min(1).optional(),
});

export const runTransitionSchema = z.object({
  to: z.enum(TASK_RUN_STATES),
  metadata: z.record(z.unknown()).optional(),
});

// — Artifacts —

export const artifactCreateSchema = z.object({
  artifactId: z.string().min(1).optional(),
  taskId: z.string().min(1),
  runId: z.string().min(1).optional(),
  kind: z.enum(ARTIFACT_KINDS),
  mimeType: z.string().min(1),
  path: z.string().optional(),
  contentHash: z.string().optional(),
  content: z.string().optional(),
  public: z.boolean().default(false),
  createdAt: z.string().min(1).optional(),
  createdBy: z.string().min(1).optional(),
  provenance: z
    .object({
      sourceTaskId: z.string().optional(),
      sourceRunId: z.string().optional(),
      sourceCommand: z.string().optional(),
      sourceUrl: z.string().optional(),
    })
    .optional(),
  metadata,
});

// — Memory candidates (evidence-backed proposals; promotion stays reviewed) —

export const memoryCandidateCreateSchema = z.object({
  candidateId: z.string().min(1).optional(),
  scope: z.enum(MEMORY_ITEM_SCOPES),
  title: z.string().min(1),
  body: z.string().min(1),
  evidence: z.object({ taskId: z.string().min(1), artifactId: z.string().min(1) }),
  proposedBy: z.string().min(1).optional(),
  proposedAt: z.string().min(1).optional(),
  expiresAt: z.string().nullable().optional(),
});

// — Shared params + query —

export const idParamSchema = (name: string): z.ZodObject<Record<string, z.ZodString>> =>
  z.object({ [name]: z.string().min(1) });

export const eventsQuerySchema = z.object({
  taskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
});
