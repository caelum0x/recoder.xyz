"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyDecisionOutcomeEnum = exports.ApprovalStatusEnum = exports.PRIVILEGED_ACTION_TYPES = exports.PrivilegedActionTypeEnum = void 0;
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
exports.PrivilegedActionTypeEnum = {
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
};
/** Ordered list of all privileged action types. */
exports.PRIVILEGED_ACTION_TYPES = Object.values(exports.PrivilegedActionTypeEnum);
// ---------------------------------------------------------------------------
// Approval Record
// ---------------------------------------------------------------------------
/**
 * The status of an approval record.
 */
exports.ApprovalStatusEnum = {
    /** Approval is active and valid. */
    Active: 'active',
    /** Approval has been explicitly revoked. */
    Revoked: 'revoked',
    /** Approval has expired (past its TTL). */
    Expired: 'expired',
};
// ---------------------------------------------------------------------------
// Policy Decision
// ---------------------------------------------------------------------------
/**
 * The outcome of a policy check.
 */
exports.PolicyDecisionOutcomeEnum = {
    /** The action is allowed (auto-approved or has valid approval). */
    Allowed: 'allowed',
    /** The action is denied (no approval, or policy says deny). */
    Denied: 'denied',
    /** The action requires approval before it can proceed. */
    RequiresApproval: 'requires_approval',
};
