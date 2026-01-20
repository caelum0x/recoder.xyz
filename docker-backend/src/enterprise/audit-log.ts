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

import { v4 as uuid } from 'uuid';
import { AppError, ErrorCode } from '../errors/index.js';
import { Permission, requirePermission } from './organization.js';

// ==================== Types & Interfaces ====================

/**
 * Audit log action categories
 */
export enum AuditAction {
  // Organization actions
  ORG_CREATED = 'organization.created',
  ORG_UPDATED = 'organization.updated',
  ORG_DELETED = 'organization.deleted',
  ORG_SETTINGS_UPDATED = 'organization.settings_updated',
  ORG_OWNERSHIP_TRANSFERRED = 'organization.ownership_transferred',

  // Member actions
  MEMBER_INVITED = 'member.invited',
  MEMBER_JOINED = 'member.joined',
  MEMBER_ROLE_CHANGED = 'member.role_changed',
  MEMBER_REMOVED = 'member.removed',
  MEMBER_LEFT = 'member.left',

  // Team actions
  TEAM_CREATED = 'team.created',
  TEAM_UPDATED = 'team.updated',
  TEAM_DELETED = 'team.deleted',
  TEAM_MEMBER_ADDED = 'team.member_added',
  TEAM_MEMBER_REMOVED = 'team.member_removed',

  // Invitation actions
  INVITATION_CREATED = 'invitation.created',
  INVITATION_ACCEPTED = 'invitation.accepted',
  INVITATION_REVOKED = 'invitation.revoked',
  INVITATION_EXPIRED = 'invitation.expired',
  INVITATION_RESENT = 'invitation.resent',

  // Project actions (for enterprise org projects)
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_DELETED = 'project.deleted',
  PROJECT_DEPLOYED = 'project.deployed',
  PROJECT_SHARED = 'project.shared',

  // Security actions
  SECURITY_SSO_ENABLED = 'security.sso_enabled',
  SECURITY_SSO_DISABLED = 'security.sso_disabled',
  SECURITY_DOMAIN_ADDED = 'security.domain_added',
  SECURITY_DOMAIN_REMOVED = 'security.domain_removed',

  // Billing actions
  BILLING_PLAN_CHANGED = 'billing.plan_changed',
  BILLING_SEATS_UPDATED = 'billing.seats_updated',
  BILLING_PAYMENT_FAILED = 'billing.payment_failed',

  // API actions
  API_KEY_CREATED = 'api.key_created',
  API_KEY_REVOKED = 'api.key_revoked',
  API_KEY_USED = 'api.key_used',

  // Authentication actions
  AUTH_LOGIN = 'auth.login',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_LOGIN_FAILED = 'auth.login_failed',
  AUTH_PASSWORD_CHANGED = 'auth.password_changed',
  AUTH_MFA_ENABLED = 'auth.mfa_enabled',
  AUTH_MFA_DISABLED = 'auth.mfa_disabled',
}

/**
 * Audit log severity levels
 */
export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Severity mapping for actions
 */
export const ACTION_SEVERITY: Partial<Record<AuditAction, AuditSeverity>> = {
  [AuditAction.ORG_DELETED]: AuditSeverity.CRITICAL,
  [AuditAction.ORG_OWNERSHIP_TRANSFERRED]: AuditSeverity.CRITICAL,
  [AuditAction.MEMBER_REMOVED]: AuditSeverity.WARNING,
  [AuditAction.TEAM_DELETED]: AuditSeverity.WARNING,
  [AuditAction.SECURITY_SSO_DISABLED]: AuditSeverity.CRITICAL,
  [AuditAction.BILLING_PAYMENT_FAILED]: AuditSeverity.CRITICAL,
  [AuditAction.API_KEY_REVOKED]: AuditSeverity.WARNING,
  [AuditAction.AUTH_LOGIN_FAILED]: AuditSeverity.WARNING,
  [AuditAction.AUTH_PASSWORD_CHANGED]: AuditSeverity.WARNING,
};

/**
 * Resource type for audit entries
 */
export enum AuditResourceType {
  ORGANIZATION = 'organization',
  MEMBER = 'member',
  TEAM = 'team',
  INVITATION = 'invitation',
  PROJECT = 'project',
  API_KEY = 'api_key',
  SETTINGS = 'settings',
  BILLING = 'billing',
}

/**
 * Actor information - who performed the action
 */
export interface AuditActor {
  id: string;                          // User ID or system identifier
  type: 'user' | 'system' | 'api_key'; // Actor type
  email?: string;                      // User email if available
  displayName?: string;                // Display name if available
  ipAddress?: string;                  // Request IP address
  userAgent?: string;                  // Request user agent
}

/**
 * Resource information - what was affected
 */
export interface AuditResource {
  type: AuditResourceType;
  id: string;
  name?: string;                       // Human-readable name
  parentId?: string;                   // Parent resource (e.g., org for team)
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
  changes?: AuditChange[];             // Field changes for updates
  metadata?: Record<string, unknown>;  // Additional context
  requestId?: string;                  // For correlating with requests
  success: boolean;                    // Whether action succeeded
  errorMessage?: string;               // Error message if failed
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

// ==================== In-Memory Storage ====================

/**
 * In-memory audit log storage
 * In production, this should use a time-series database or append-only log
 */
class AuditLogStore {
  private logs = new Map<string, AuditLogEntry>();          // entryId -> entry
  private logsByOrg = new Map<string, string[]>();          // orgId -> entryIds
  private retentionDays: number = 90;

  /**
   * Create a new audit log entry
   */
  create(entry: AuditLogEntry): AuditLogEntry {
    this.logs.set(entry.id, entry);

    // Index by org
    const orgLogs = this.logsByOrg.get(entry.orgId) || [];
    orgLogs.push(entry.id);
    this.logsByOrg.set(entry.orgId, orgLogs);

    return entry;
  }

  /**
   * Get entry by ID
   */
  get(id: string): AuditLogEntry | undefined {
    return this.logs.get(id);
  }

  /**
   * Query audit logs with filters
   */
  query(query: AuditLogQuery): AuditLogQueryResult {
    const orgLogs = this.logsByOrg.get(query.orgId) || [];
    let entries = orgLogs
      .map(id => this.logs.get(id))
      .filter((e): e is AuditLogEntry => e !== undefined);

    // Apply filters
    if (query.startDate) {
      entries = entries.filter(e => e.timestamp >= query.startDate!);
    }
    if (query.endDate) {
      entries = entries.filter(e => e.timestamp <= query.endDate!);
    }
    if (query.actions && query.actions.length > 0) {
      entries = entries.filter(e => query.actions!.includes(e.action));
    }
    if (query.actorIds && query.actorIds.length > 0) {
      entries = entries.filter(e => query.actorIds!.includes(e.actor.id));
    }
    if (query.resourceTypes && query.resourceTypes.length > 0) {
      entries = entries.filter(e => query.resourceTypes!.includes(e.resource.type));
    }
    if (query.resourceIds && query.resourceIds.length > 0) {
      entries = entries.filter(e => query.resourceIds!.includes(e.resource.id));
    }
    if (query.severity && query.severity.length > 0) {
      entries = entries.filter(e => query.severity!.includes(e.severity));
    }
    if (query.success !== undefined) {
      entries = entries.filter(e => e.success === query.success);
    }
    if (query.searchText) {
      const search = query.searchText.toLowerCase();
      entries = entries.filter(e =>
        e.action.toLowerCase().includes(search) ||
        e.actor.email?.toLowerCase().includes(search) ||
        e.actor.displayName?.toLowerCase().includes(search) ||
        e.resource.name?.toLowerCase().includes(search) ||
        JSON.stringify(e.metadata).toLowerCase().includes(search)
      );
    }

    // Sort by timestamp
    entries.sort((a, b) => {
      const order = query.sortOrder === 'asc' ? 1 : -1;
      return order * (a.timestamp.getTime() - b.timestamp.getTime());
    });

    const total = entries.length;
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    // Apply pagination
    entries = entries.slice(offset, offset + limit);

    return {
      entries,
      total,
      limit,
      offset,
      hasMore: offset + entries.length < total,
    };
  }

  /**
   * Get statistics for audit logs
   */
  getStats(orgId: string, startDate?: Date, endDate?: Date): AuditStats {
    const orgLogs = this.logsByOrg.get(orgId) || [];
    let entries = orgLogs
      .map(id => this.logs.get(id))
      .filter((e): e is AuditLogEntry => e !== undefined);

    if (startDate) {
      entries = entries.filter(e => e.timestamp >= startDate);
    }
    if (endDate) {
      entries = entries.filter(e => e.timestamp <= endDate);
    }

    const byAction: Record<string, number> = {};
    const byActor: Record<string, number> = {};
    const byResourceType: Record<string, number> = {};
    const bySeverity: Record<AuditSeverity, number> = {
      [AuditSeverity.INFO]: 0,
      [AuditSeverity.WARNING]: 0,
      [AuditSeverity.CRITICAL]: 0,
    };
    let successCount = 0;

    for (const entry of entries) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      byActor[entry.actor.id] = (byActor[entry.actor.id] || 0) + 1;
      byResourceType[entry.resource.type] = (byResourceType[entry.resource.type] || 0) + 1;
      bySeverity[entry.severity]++;
      if (entry.success) successCount++;
    }

    // Get recent activity
    const recentActivity = entries
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10)
      .map(e => ({
        timestamp: e.timestamp,
        action: e.action,
        actorId: e.actor.id,
      }));

    return {
      totalEntries: entries.length,
      byAction,
      byActor,
      byResourceType,
      bySeverity,
      successRate: entries.length > 0 ? (successCount / entries.length) * 100 : 100,
      recentActivity,
    };
  }

  /**
   * Delete old entries based on retention policy
   */
  applyRetention(orgId: string, retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const orgLogs = this.logsByOrg.get(orgId) || [];
    let deleted = 0;

    const remainingLogs: string[] = [];
    for (const id of orgLogs) {
      const entry = this.logs.get(id);
      if (entry && entry.timestamp < cutoff) {
        this.logs.delete(id);
        deleted++;
      } else {
        remainingLogs.push(id);
      }
    }

    this.logsByOrg.set(orgId, remainingLogs);
    return deleted;
  }

  /**
   * Export logs for a date range
   */
  export(orgId: string, startDate: Date, endDate: Date): AuditLogEntry[] {
    return this.query({
      orgId,
      startDate,
      endDate,
      limit: 100000, // High limit for export
      sortOrder: 'asc',
    }).entries;
  }

  /**
   * Get count for an org
   */
  getCount(orgId: string): number {
    return this.logsByOrg.get(orgId)?.length || 0;
  }

  /**
   * Set retention days
   */
  setRetention(days: number): void {
    this.retentionDays = days;
  }
}

// Singleton store instance
export const auditLogStore = new AuditLogStore();

// ==================== Audit Log Service ====================

/**
 * Create an audit log entry
 */
export function createAuditLog(input: CreateAuditLogInput): AuditLogEntry {
  const severity = ACTION_SEVERITY[input.action] || AuditSeverity.INFO;

  const entry: AuditLogEntry = {
    id: uuid(),
    orgId: input.orgId,
    timestamp: new Date(),
    action: input.action,
    severity,
    actor: input.actor,
    resource: input.resource,
    changes: input.changes,
    metadata: input.metadata,
    requestId: input.requestId,
    success: input.success !== undefined ? input.success : true,
    errorMessage: input.errorMessage,
  };

  return auditLogStore.create(entry);
}

/**
 * Create system audit log (for automated actions)
 */
export function createSystemAuditLog(
  orgId: string,
  action: AuditAction,
  resource: AuditResource,
  metadata?: Record<string, unknown>
): AuditLogEntry {
  return createAuditLog({
    orgId,
    action,
    actor: {
      id: 'system',
      type: 'system',
    },
    resource,
    metadata,
  });
}

/**
 * Calculate changes between old and new objects
 */
export function calculateChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields?: string[]
): AuditChange[] {
  const changes: AuditChange[] = [];
  const fieldsToCheck = fields || [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])];

  for (const field of fieldsToCheck) {
    const oldValue = oldObj[field];
    const newValue = newObj[field];

    // Skip functions
    if (typeof oldValue === 'function' || typeof newValue === 'function') {
      continue;
    }

    // Deep comparison for objects
    const oldStr = JSON.stringify(oldValue);
    const newStr = JSON.stringify(newValue);

    if (oldStr !== newStr) {
      changes.push({
        field,
        oldValue: sanitizeValue(oldValue),
        newValue: sanitizeValue(newValue),
      });
    }
  }

  return changes;
}

/**
 * Sanitize sensitive values for audit logging
 */
function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Redact sensitive fields
  const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'api_key', 'credentials'];

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(v => sanitizeValue(v));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(val);
      }
    }
    return sanitized;
  }

  // Check if string value looks like a secret
  if (typeof value === 'string' && value.length > 20) {
    // Simple heuristic: high entropy strings might be secrets
    const uniqueChars = new Set(value).size;
    if (uniqueChars / value.length > 0.7) {
      return '[REDACTED]';
    }
  }

  return value;
}

/**
 * Query audit logs for an organization
 */
export function queryAuditLogs(
  orgId: string,
  userId: string,
  query: Omit<AuditLogQuery, 'orgId'>
): AuditLogQueryResult {
  // Check permission
  requirePermission(userId, orgId, [Permission.AUDIT_VIEW]);

  return auditLogStore.query({ ...query, orgId });
}

/**
 * Get audit log entry by ID
 */
export function getAuditLogEntry(
  orgId: string,
  userId: string,
  entryId: string
): AuditLogEntry {
  requirePermission(userId, orgId, [Permission.AUDIT_VIEW]);

  const entry = auditLogStore.get(entryId);
  if (!entry || entry.orgId !== orgId) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Audit log entry not found',
      { details: { entryId } }
    );
  }

  return entry;
}

/**
 * Get audit statistics
 */
export function getAuditStats(
  orgId: string,
  userId: string,
  startDate?: Date,
  endDate?: Date
): AuditStats {
  requirePermission(userId, orgId, [Permission.AUDIT_VIEW]);
  return auditLogStore.getStats(orgId, startDate, endDate);
}

/**
 * Export audit logs
 */
export function exportAuditLogs(
  orgId: string,
  userId: string,
  startDate: Date,
  endDate: Date,
  format: 'json' | 'csv' = 'json'
): { data: string; filename: string; mimeType: string } {
  requirePermission(userId, orgId, [Permission.AUDIT_VIEW]);

  const entries = auditLogStore.export(orgId, startDate, endDate);
  const filename = `audit-log-${orgId}-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}`;

  if (format === 'csv') {
    const headers = [
      'id',
      'timestamp',
      'action',
      'severity',
      'actor_id',
      'actor_type',
      'actor_email',
      'resource_type',
      'resource_id',
      'resource_name',
      'success',
      'error_message',
    ];

    const rows = entries.map(e => [
      e.id,
      e.timestamp.toISOString(),
      e.action,
      e.severity,
      e.actor.id,
      e.actor.type,
      e.actor.email || '',
      e.resource.type,
      e.resource.id,
      e.resource.name || '',
      e.success ? 'true' : 'false',
      e.errorMessage || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    return {
      data: [headers.join(','), ...rows].join('\n'),
      filename: `${filename}.csv`,
      mimeType: 'text/csv',
    };
  }

  return {
    data: JSON.stringify(entries, null, 2),
    filename: `${filename}.json`,
    mimeType: 'application/json',
  };
}

/**
 * Apply retention policy to audit logs
 */
export function applyAuditRetention(orgId: string, retentionDays: number): number {
  return auditLogStore.applyRetention(orgId, retentionDays);
}

// ==================== Convenience Logging Functions ====================

/**
 * Log organization action
 */
export function logOrganizationAction(
  orgId: string,
  action: AuditAction,
  actor: AuditActor,
  orgName?: string,
  changes?: AuditChange[],
  metadata?: Record<string, unknown>
): AuditLogEntry {
  return createAuditLog({
    orgId,
    action,
    actor,
    resource: {
      type: AuditResourceType.ORGANIZATION,
      id: orgId,
      name: orgName,
    },
    changes,
    metadata,
  });
}

/**
 * Log member action
 */
export function logMemberAction(
  orgId: string,
  action: AuditAction,
  actor: AuditActor,
  memberId: string,
  memberEmail?: string,
  changes?: AuditChange[],
  metadata?: Record<string, unknown>
): AuditLogEntry {
  return createAuditLog({
    orgId,
    action,
    actor,
    resource: {
      type: AuditResourceType.MEMBER,
      id: memberId,
      name: memberEmail,
      parentId: orgId,
    },
    changes,
    metadata,
  });
}

/**
 * Log team action
 */
export function logTeamAction(
  orgId: string,
  action: AuditAction,
  actor: AuditActor,
  teamId: string,
  teamName?: string,
  changes?: AuditChange[],
  metadata?: Record<string, unknown>
): AuditLogEntry {
  return createAuditLog({
    orgId,
    action,
    actor,
    resource: {
      type: AuditResourceType.TEAM,
      id: teamId,
      name: teamName,
      parentId: orgId,
    },
    changes,
    metadata,
  });
}

/**
 * Log invitation action
 */
export function logInvitationAction(
  orgId: string,
  action: AuditAction,
  actor: AuditActor,
  invitationId: string,
  inviteeEmail?: string,
  metadata?: Record<string, unknown>
): AuditLogEntry {
  return createAuditLog({
    orgId,
    action,
    actor,
    resource: {
      type: AuditResourceType.INVITATION,
      id: invitationId,
      name: inviteeEmail,
      parentId: orgId,
    },
    metadata,
  });
}

/**
 * Log security action
 */
export function logSecurityAction(
  orgId: string,
  action: AuditAction,
  actor: AuditActor,
  metadata?: Record<string, unknown>
): AuditLogEntry {
  return createAuditLog({
    orgId,
    action,
    actor,
    resource: {
      type: AuditResourceType.SETTINGS,
      id: orgId,
      name: 'Security Settings',
      parentId: orgId,
    },
    metadata,
  });
}

/**
 * Log failed action
 */
export function logFailedAction(
  orgId: string,
  action: AuditAction,
  actor: AuditActor,
  resource: AuditResource,
  errorMessage: string,
  metadata?: Record<string, unknown>
): AuditLogEntry {
  return createAuditLog({
    orgId,
    action,
    actor,
    resource,
    success: false,
    errorMessage,
    metadata,
  });
}

// ==================== Helper Exports ====================

// auditLogStore is already exported above
