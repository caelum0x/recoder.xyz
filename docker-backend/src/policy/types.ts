/**
 * @module policy/types
 *
 * Canonical types for the A2A policy hook middleware system.
 *
 * Defines privileged action types, policy rules, approval records,
 * and policy decision structures used throughout the policy plane.
 *
 * Aligns with the canonical audit-event and error-taxonomy schemas
 * from @recoder/shared/a2a/schemas.
 */

// ---------------------------------------------------------------------------
// Privileged Action Types
// ---------------------------------------------------------------------------

/**
 * Enumeration of privileged action categories that require policy approval.
 *
 * Each action type maps to a class of operations that an agent or service
 * might attempt. The policy engine uses these to determine whether an
 * approval is required before the action can proceed.
 */
export const PrivilegedActionTypeEnum = {
  /** Writing, creating, or deleting files on the file system. */
  FileSystemWrite: 'file_system_write',
  /** Making outbound HTTP/API calls to external services. */
  ExternalApiCall: 'external_api_call',
  /** Deploying code, containers, or infrastructure changes. */
  Deployment: 'deployment',
  /** Mutating database records (INSERT, UPDATE, DELETE). */
  DatabaseMutation: 'database_mutation',
  /** Executing arbitrary code or shell commands. */
  CodeExecution: 'code_execution',
  /** Accessing secrets, credentials, or encryption keys. */
  SecretAccess: 'secret_access',
  /** Making outbound network connections (non-API). */
  NetworkEgress: 'network_egress',
  /** Modifying system configuration or environment variables. */
  ConfigChange: 'config_change',
  /** Accessing or modifying user data or PII. */
  UserDataAccess: 'user_data_access',
  /** Administrative operations (user management, billing, etc.). */
  AdminAction: 'admin_action',
} as const;

/** Union of all valid privileged action type string values. */
export type PrivilegedActionType =
  (typeof PrivilegedActionTypeEnum)[keyof typeof PrivilegedActionTypeEnum];

/** Ordered list of all privileged action types. */
export const PRIVILEGED_ACTION_TYPES: readonly PrivilegedActionType[] =
  Object.values(PrivilegedActionTypeEnum);

// ---------------------------------------------------------------------------
// Policy Rule
// ---------------------------------------------------------------------------

/**
 * How the policy engine should handle a given action type.
 *
 * - `auto`: The action is automatically approved (no human intervention).
 * - `prompt`: The action requires explicit approval before proceeding.
 * - `deny`: The action is always denied regardless of approvals.
 */
export type PolicyRuleDisposition = 'auto' | 'prompt' | 'deny';

/**
 * A single policy rule that governs how one action type is handled.
 */
export interface PolicyRule {
  /** The action type this rule governs. */
  action: PrivilegedActionType;

  /** How the action should be handled. */
  disposition: PolicyRuleDisposition;

  /** Human-readable reason or description for this rule. */
  reason: string;

  /** Optional: scopes/roles that can bypass this rule. */
  bypass_roles?: string[];

  /** Optional: maximum number of auto-approvals before requiring prompt. */
  auto_limit?: number;

  /** Optional: time-to-live for approvals under this rule (ms). */
  approval_ttl_ms?: number;
}

/**
 * The full policy ruleset used by the policy engine.
 * Maps action types to their corresponding rules.
 */
export type PolicyRuleset = Record<PrivilegedActionType, PolicyRule>;

// ---------------------------------------------------------------------------
// Approval Record
// ---------------------------------------------------------------------------

/**
 * The status of an approval record.
 */
export const ApprovalStatusEnum = {
  /** Approval is active and valid. */
  Active: 'active',
  /** Approval has been explicitly revoked. */
  Revoked: 'revoked',
  /** Approval has expired (past its TTL). */
  Expired: 'expired',
} as const;

/** Union of all valid approval status values. */
export type ApprovalStatus =
  (typeof ApprovalStatusEnum)[keyof typeof ApprovalStatusEnum];

/**
 * A record of an approval granted for a specific action on a specific task.
 *
 * Approvals are immutable once created. Revocation is modeled as a status
 * change, not a deletion, so the audit trail is preserved.
 */
export interface Approval {
  /** Unique approval identifier. */
  id: string;

  /** The task this approval is associated with. */
  task_id: string;

  /** The action type that was approved. */
  action: PrivilegedActionType;

  /** The specific resource being acted upon (e.g. file path, API endpoint). */
  resource: string;

  /** Current status of the approval. */
  status: ApprovalStatus;

  /** Who granted the approval (user ID, agent ID, or 'system'). */
  granted_by: string;

  /** ISO-8601 timestamp of when the approval was granted. */
  granted_at: string;

  /** ISO-8601 timestamp of when the approval expires (null = no expiry). */
  expires_at: string | null;

  /** ISO-8601 timestamp of when the approval was revoked (if revoked). */
  revoked_at: string | null;

  /** Who revoked the approval (if revoked). */
  revoked_by: string | null;

  /** Human-readable reason for the approval. */
  reason: string;

  /** The workspace this approval belongs to. */
  workspace_id: string;

  /** Distributed trace ID for correlation. */
  trace_id: string;

  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a new approval.
 */
export interface CreateApprovalInput {
  /** The task this approval is for. */
  task_id: string;

  /** The action type being approved. */
  action: PrivilegedActionType;

  /** The specific resource being acted upon. */
  resource: string;

  /** Who is granting the approval. */
  granted_by: string;

  /** Human-readable reason for the approval. */
  reason: string;

  /** The workspace this approval belongs to. */
  workspace_id: string;

  /** Distributed trace ID for correlation. */
  trace_id: string;

  /** Time-to-live for this approval in milliseconds (optional). */
  ttl_ms?: number;

  /** Additional metadata (optional). */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy Decision
// ---------------------------------------------------------------------------

/**
 * The outcome of a policy check.
 */
export const PolicyDecisionOutcomeEnum = {
  /** The action is allowed (auto-approved or has valid approval). */
  Allowed: 'allowed',
  /** The action is denied (no approval, or policy says deny). */
  Denied: 'denied',
  /** The action requires approval before it can proceed. */
  RequiresApproval: 'requires_approval',
} as const;

/** Union of all valid policy decision outcome values. */
export type PolicyDecisionOutcome =
  (typeof PolicyDecisionOutcomeEnum)[keyof typeof PolicyDecisionOutcomeEnum];

/**
 * The full result of a policy evaluation.
 *
 * Contains enough information for the middleware to decide whether to
 * allow, block, or request approval, and for the audit log to record
 * the full context of the decision.
 */
export interface PolicyDecision {
  /** The outcome of the policy check. */
  outcome: PolicyDecisionOutcome;

  /** The action that was checked. */
  action: PrivilegedActionType;

  /** The resource that was checked. */
  resource: string;

  /** The rule that was applied. */
  rule: PolicyRuleDisposition;

  /** Human-readable reason for the decision. */
  reason: string;

  /** The actor who triggered the action. */
  actor_id: string;

  /** The task ID (if applicable). */
  task_id?: string;

  /** The approval ID (if an existing approval was found). */
  approval_id?: string;

  /** ISO-8601 timestamp of the decision. */
  timestamp: string;

  /** Distributed trace ID. */
  trace_id: string;

  /** Duration of the policy check in milliseconds. */
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Policy Check Request
// ---------------------------------------------------------------------------

/**
 * Input for requesting a policy check from the policy engine.
 */
export interface PolicyCheckRequest {
  /** The action type being attempted. */
  action: PrivilegedActionType;

  /** The specific resource being acted upon. */
  resource: string;

  /** The actor attempting the action. */
  actor_id: string;

  /** The task ID (if applicable). */
  task_id?: string;

  /** The workspace ID. */
  workspace_id: string;

  /** Distributed trace ID. */
  trace_id: string;

  /** The actor's roles (for bypass checks). */
  actor_roles?: string[];
}

// ---------------------------------------------------------------------------
// Route-to-Action Mapping
// ---------------------------------------------------------------------------

/**
 * Maps an Express route pattern to its privileged action metadata.
 * Used by the middleware to determine which actions a request involves.
 */
export interface RouteActionMapping {
  /** HTTP method(s) this mapping applies to. */
  methods: string[];

  /** Express route pattern (e.g. '/api/file/:projectId'). */
  pattern: string;

  /** The privileged action type for this route. */
  action: PrivilegedActionType;

  /** How to extract the resource identifier from the request. */
  resource_extractor: 'params' | 'body' | 'query' | 'path';

  /** The key to extract the resource identifier from. */
  resource_key: string;
}
