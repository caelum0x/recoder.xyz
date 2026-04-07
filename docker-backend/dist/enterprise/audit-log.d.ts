/**
 * Enterprise Audit Log Module
 * Comprehensive audit logging for organization actions with secure storage and querying
 *
 * Features:
 * - Structured audit log entries
 * - Actor, action, resource tracking
 * - Change diffing for updates
 * - Flexible querying with filters
 * - Time-based retention policies
 * - Export capabilities
 */
/**
 * Audit log action categories
 */
export declare enum AuditAction {
    ORG_CREATED = "organization.created",
    ORG_UPDATED = "organization.updated",
    ORG_DELETED = "organization.deleted",
    ORG_SETTINGS_UPDATED = "organization.settings_updated",
    ORG_OWNERSHIP_TRANSFERRED = "organization.ownership_transferred",
    MEMBER_INVITED = "member.invited",
    MEMBER_JOINED = "member.joined",
    MEMBER_ROLE_CHANGED = "member.role_changed",
    MEMBER_REMOVED = "member.removed",
    MEMBER_LEFT = "member.left",
    TEAM_CREATED = "team.created",
    TEAM_UPDATED = "team.updated",
    TEAM_DELETED = "team.deleted",
    TEAM_MEMBER_ADDED = "team.member_added",
    TEAM_MEMBER_REMOVED = "team.member_removed",
    INVITATION_CREATED = "invitation.created",
    INVITATION_ACCEPTED = "invitation.accepted",
    INVITATION_REVOKED = "invitation.revoked",
    INVITATION_EXPIRED = "invitation.expired",
    INVITATION_RESENT = "invitation.resent",
    PROJECT_CREATED = "project.created",
    PROJECT_UPDATED = "project.updated",
    PROJECT_DELETED = "project.deleted",
    PROJECT_DEPLOYED = "project.deployed",
    PROJECT_SHARED = "project.shared",
    SECURITY_SSO_ENABLED = "security.sso_enabled",
    SECURITY_SSO_DISABLED = "security.sso_disabled",
    SECURITY_DOMAIN_ADDED = "security.domain_added",
    SECURITY_DOMAIN_REMOVED = "security.domain_removed",
    BILLING_PLAN_CHANGED = "billing.plan_changed",
    BILLING_SEATS_UPDATED = "billing.seats_updated",
    BILLING_PAYMENT_FAILED = "billing.payment_failed",
    API_KEY_CREATED = "api.key_created",
    API_KEY_REVOKED = "api.key_revoked",
    API_KEY_USED = "api.key_used",
    AUTH_LOGIN = "auth.login",
    AUTH_LOGOUT = "auth.logout",
    AUTH_LOGIN_FAILED = "auth.login_failed",
    AUTH_PASSWORD_CHANGED = "auth.password_changed",
    AUTH_MFA_ENABLED = "auth.mfa_enabled",
    AUTH_MFA_DISABLED = "auth.mfa_disabled"
}
/**
 * Audit log severity levels
 */
export declare enum AuditSeverity {
    INFO = "info",
    WARNING = "warning",
    CRITICAL = "critical"
}
/**
 * Severity mapping for actions
 */
export declare const ACTION_SEVERITY: Partial<Record<AuditAction, AuditSeverity>>;
/**
 * Resource type for audit entries
 */
export declare enum AuditResourceType {
    ORGANIZATION = "organization",
    MEMBER = "member",
    TEAM = "team",
    INVITATION = "invitation",
    PROJECT = "project",
    API_KEY = "api_key",
    SETTINGS = "settings",
    BILLING = "billing"
}
/**
 * Actor information - who performed the action
 */
export interface AuditActor {
    id: string;
    type: 'user' | 'system' | 'api_key';
    email?: string;
    displayName?: string;
    ipAddress?: string;
    userAgent?: string;
}
/**
 * Resource information - what was affected
 */
export interface AuditResource {
    type: AuditResourceType;
    id: string;
    name?: string;
    parentId?: string;
}
/**
 * Change record for tracking field changes
 */
export interface AuditChange {
    field: string;
    oldValue: unknown;
    newValue: unknown;
}
/**
 * Complete audit log entry
 */
export interface AuditLogEntry {
    id: string;
    orgId: string;
    timestamp: Date;
    action: AuditAction;
    severity: AuditSeverity;
    actor: AuditActor;
    resource: AuditResource;
    changes?: AuditChange[];
    metadata?: Record<string, unknown>;
    requestId?: string;
    success: boolean;
    errorMessage?: string;
}
/**
 * Input for creating audit log entry
 */
export interface CreateAuditLogInput {
    orgId: string;
    action: AuditAction;
    actor: AuditActor;
    resource: AuditResource;
    changes?: AuditChange[];
    metadata?: Record<string, unknown>;
    requestId?: string;
    success?: boolean;
    errorMessage?: string;
}
/**
 * Query filters for audit logs
 */
export interface AuditLogQuery {
    orgId: string;
    startDate?: Date;
    endDate?: Date;
    actions?: AuditAction[];
    actorIds?: string[];
    resourceTypes?: AuditResourceType[];
    resourceIds?: string[];
    severity?: AuditSeverity[];
    success?: boolean;
    searchText?: string;
    limit?: number;
    offset?: number;
    sortOrder?: 'asc' | 'desc';
}
/**
 * Query result with pagination
 */
export interface AuditLogQueryResult {
    entries: AuditLogEntry[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
}
/**
 * Aggregated audit statistics
 */
export interface AuditStats {
    totalEntries: number;
    byAction: Record<string, number>;
    byActor: Record<string, number>;
    byResourceType: Record<string, number>;
    bySeverity: Record<AuditSeverity, number>;
    successRate: number;
    recentActivity: {
        timestamp: Date;
        action: AuditAction;
        actorId: string;
    }[];
}
/**
 * In-memory audit log storage
 * In production, this should use a time-series database or append-only log
 */
declare class AuditLogStore {
    private logs;
    private logsByOrg;
    private retentionDays;
    /**
     * Create a new audit log entry
     */
    create(entry: AuditLogEntry): AuditLogEntry;
    /**
     * Get entry by ID
     */
    get(id: string): AuditLogEntry | undefined;
    /**
     * Query audit logs with filters
     */
    query(query: AuditLogQuery): AuditLogQueryResult;
    /**
     * Get statistics for audit logs
     */
    getStats(orgId: string, startDate?: Date, endDate?: Date): AuditStats;
    /**
     * Delete old entries based on retention policy
     */
    applyRetention(orgId: string, retentionDays: number): number;
    /**
     * Export logs for a date range
     */
    export(orgId: string, startDate: Date, endDate: Date): AuditLogEntry[];
    /**
     * Get count for an org
     */
    getCount(orgId: string): number;
    /**
     * Set retention days
     */
    setRetention(days: number): void;
}
export declare const auditLogStore: AuditLogStore;
/**
 * Create an audit log entry
 */
export declare function createAuditLog(input: CreateAuditLogInput): AuditLogEntry;
/**
 * Create system audit log (for automated actions)
 */
export declare function createSystemAuditLog(orgId: string, action: AuditAction, resource: AuditResource, metadata?: Record<string, unknown>): AuditLogEntry;
/**
 * Calculate changes between old and new objects
 */
export declare function calculateChanges(oldObj: Record<string, unknown>, newObj: Record<string, unknown>, fields?: string[]): AuditChange[];
/**
 * Query audit logs for an organization
 */
export declare function queryAuditLogs(orgId: string, userId: string, query: Omit<AuditLogQuery, 'orgId'>): AuditLogQueryResult;
/**
 * Get audit log entry by ID
 */
export declare function getAuditLogEntry(orgId: string, userId: string, entryId: string): AuditLogEntry;
/**
 * Get audit statistics
 */
export declare function getAuditStats(orgId: string, userId: string, startDate?: Date, endDate?: Date): AuditStats;
/**
 * Export audit logs
 */
export declare function exportAuditLogs(orgId: string, userId: string, startDate: Date, endDate: Date, format?: 'json' | 'csv'): {
    data: string;
    filename: string;
    mimeType: string;
};
/**
 * Apply retention policy to audit logs
 */
export declare function applyAuditRetention(orgId: string, retentionDays: number): number;
/**
 * Log organization action
 */
export declare function logOrganizationAction(orgId: string, action: AuditAction, actor: AuditActor, orgName?: string, changes?: AuditChange[], metadata?: Record<string, unknown>): AuditLogEntry;
/**
 * Log member action
 */
export declare function logMemberAction(orgId: string, action: AuditAction, actor: AuditActor, memberId: string, memberEmail?: string, changes?: AuditChange[], metadata?: Record<string, unknown>): AuditLogEntry;
/**
 * Log team action
 */
export declare function logTeamAction(orgId: string, action: AuditAction, actor: AuditActor, teamId: string, teamName?: string, changes?: AuditChange[], metadata?: Record<string, unknown>): AuditLogEntry;
/**
 * Log invitation action
 */
export declare function logInvitationAction(orgId: string, action: AuditAction, actor: AuditActor, invitationId: string, inviteeEmail?: string, metadata?: Record<string, unknown>): AuditLogEntry;
/**
 * Log security action
 */
export declare function logSecurityAction(orgId: string, action: AuditAction, actor: AuditActor, metadata?: Record<string, unknown>): AuditLogEntry;
/**
 * Log failed action
 */
export declare function logFailedAction(orgId: string, action: AuditAction, actor: AuditActor, resource: AuditResource, errorMessage: string, metadata?: Record<string, unknown>): AuditLogEntry;
export {};
