"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogStore = exports.AuditResourceType = exports.ACTION_SEVERITY = exports.AuditSeverity = exports.AuditAction = void 0;
exports.createAuditLog = createAuditLog;
exports.createSystemAuditLog = createSystemAuditLog;
exports.calculateChanges = calculateChanges;
exports.queryAuditLogs = queryAuditLogs;
exports.getAuditLogEntry = getAuditLogEntry;
exports.getAuditStats = getAuditStats;
exports.exportAuditLogs = exportAuditLogs;
exports.applyAuditRetention = applyAuditRetention;
exports.logOrganizationAction = logOrganizationAction;
exports.logMemberAction = logMemberAction;
exports.logTeamAction = logTeamAction;
exports.logInvitationAction = logInvitationAction;
exports.logSecurityAction = logSecurityAction;
exports.logFailedAction = logFailedAction;
const uuid_1 = require("uuid");
const index_js_1 = require("../errors/index.js");
const organization_js_1 = require("./organization.js");
// ==================== Types & Interfaces ====================
/**
 * Audit log action categories
 */
var AuditAction;
(function (AuditAction) {
    // Organization actions
    AuditAction["ORG_CREATED"] = "organization.created";
    AuditAction["ORG_UPDATED"] = "organization.updated";
    AuditAction["ORG_DELETED"] = "organization.deleted";
    AuditAction["ORG_SETTINGS_UPDATED"] = "organization.settings_updated";
    AuditAction["ORG_OWNERSHIP_TRANSFERRED"] = "organization.ownership_transferred";
    // Member actions
    AuditAction["MEMBER_INVITED"] = "member.invited";
    AuditAction["MEMBER_JOINED"] = "member.joined";
    AuditAction["MEMBER_ROLE_CHANGED"] = "member.role_changed";
    AuditAction["MEMBER_REMOVED"] = "member.removed";
    AuditAction["MEMBER_LEFT"] = "member.left";
    // Team actions
    AuditAction["TEAM_CREATED"] = "team.created";
    AuditAction["TEAM_UPDATED"] = "team.updated";
    AuditAction["TEAM_DELETED"] = "team.deleted";
    AuditAction["TEAM_MEMBER_ADDED"] = "team.member_added";
    AuditAction["TEAM_MEMBER_REMOVED"] = "team.member_removed";
    // Invitation actions
    AuditAction["INVITATION_CREATED"] = "invitation.created";
    AuditAction["INVITATION_ACCEPTED"] = "invitation.accepted";
    AuditAction["INVITATION_REVOKED"] = "invitation.revoked";
    AuditAction["INVITATION_EXPIRED"] = "invitation.expired";
    AuditAction["INVITATION_RESENT"] = "invitation.resent";
    // Project actions (for enterprise org projects)
    AuditAction["PROJECT_CREATED"] = "project.created";
    AuditAction["PROJECT_UPDATED"] = "project.updated";
    AuditAction["PROJECT_DELETED"] = "project.deleted";
    AuditAction["PROJECT_DEPLOYED"] = "project.deployed";
    AuditAction["PROJECT_SHARED"] = "project.shared";
    // Security actions
    AuditAction["SECURITY_SSO_ENABLED"] = "security.sso_enabled";
    AuditAction["SECURITY_SSO_DISABLED"] = "security.sso_disabled";
    AuditAction["SECURITY_DOMAIN_ADDED"] = "security.domain_added";
    AuditAction["SECURITY_DOMAIN_REMOVED"] = "security.domain_removed";
    // Billing actions
    AuditAction["BILLING_PLAN_CHANGED"] = "billing.plan_changed";
    AuditAction["BILLING_SEATS_UPDATED"] = "billing.seats_updated";
    AuditAction["BILLING_PAYMENT_FAILED"] = "billing.payment_failed";
    // API actions
    AuditAction["API_KEY_CREATED"] = "api.key_created";
    AuditAction["API_KEY_REVOKED"] = "api.key_revoked";
    AuditAction["API_KEY_USED"] = "api.key_used";
    // Authentication actions
    AuditAction["AUTH_LOGIN"] = "auth.login";
    AuditAction["AUTH_LOGOUT"] = "auth.logout";
    AuditAction["AUTH_LOGIN_FAILED"] = "auth.login_failed";
    AuditAction["AUTH_PASSWORD_CHANGED"] = "auth.password_changed";
    AuditAction["AUTH_MFA_ENABLED"] = "auth.mfa_enabled";
    AuditAction["AUTH_MFA_DISABLED"] = "auth.mfa_disabled";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
/**
 * Audit log severity levels
 */
var AuditSeverity;
(function (AuditSeverity) {
    AuditSeverity["INFO"] = "info";
    AuditSeverity["WARNING"] = "warning";
    AuditSeverity["CRITICAL"] = "critical";
})(AuditSeverity || (exports.AuditSeverity = AuditSeverity = {}));
/**
 * Severity mapping for actions
 */
exports.ACTION_SEVERITY = {
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
var AuditResourceType;
(function (AuditResourceType) {
    AuditResourceType["ORGANIZATION"] = "organization";
    AuditResourceType["MEMBER"] = "member";
    AuditResourceType["TEAM"] = "team";
    AuditResourceType["INVITATION"] = "invitation";
    AuditResourceType["PROJECT"] = "project";
    AuditResourceType["API_KEY"] = "api_key";
    AuditResourceType["SETTINGS"] = "settings";
    AuditResourceType["BILLING"] = "billing";
})(AuditResourceType || (exports.AuditResourceType = AuditResourceType = {}));
// ==================== In-Memory Storage ====================
/**
 * In-memory audit log storage
 * In production, this should use a time-series database or append-only log
 */
class AuditLogStore {
    logs = new Map(); // entryId -> entry
    logsByOrg = new Map(); // orgId -> entryIds
    retentionDays = 90;
    /**
     * Create a new audit log entry
     */
    create(entry) {
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
    get(id) {
        return this.logs.get(id);
    }
    /**
     * Query audit logs with filters
     */
    query(query) {
        const orgLogs = this.logsByOrg.get(query.orgId) || [];
        let entries = orgLogs
            .map(id => this.logs.get(id))
            .filter((e) => e !== undefined);
        // Apply filters
        if (query.startDate) {
            entries = entries.filter(e => e.timestamp >= query.startDate);
        }
        if (query.endDate) {
            entries = entries.filter(e => e.timestamp <= query.endDate);
        }
        if (query.actions && query.actions.length > 0) {
            entries = entries.filter(e => query.actions.includes(e.action));
        }
        if (query.actorIds && query.actorIds.length > 0) {
            entries = entries.filter(e => query.actorIds.includes(e.actor.id));
        }
        if (query.resourceTypes && query.resourceTypes.length > 0) {
            entries = entries.filter(e => query.resourceTypes.includes(e.resource.type));
        }
        if (query.resourceIds && query.resourceIds.length > 0) {
            entries = entries.filter(e => query.resourceIds.includes(e.resource.id));
        }
        if (query.severity && query.severity.length > 0) {
            entries = entries.filter(e => query.severity.includes(e.severity));
        }
        if (query.success !== undefined) {
            entries = entries.filter(e => e.success === query.success);
        }
        if (query.searchText) {
            const search = query.searchText.toLowerCase();
            entries = entries.filter(e => e.action.toLowerCase().includes(search) ||
                e.actor.email?.toLowerCase().includes(search) ||
                e.actor.displayName?.toLowerCase().includes(search) ||
                e.resource.name?.toLowerCase().includes(search) ||
                JSON.stringify(e.metadata).toLowerCase().includes(search));
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
    getStats(orgId, startDate, endDate) {
        const orgLogs = this.logsByOrg.get(orgId) || [];
        let entries = orgLogs
            .map(id => this.logs.get(id))
            .filter((e) => e !== undefined);
        if (startDate) {
            entries = entries.filter(e => e.timestamp >= startDate);
        }
        if (endDate) {
            entries = entries.filter(e => e.timestamp <= endDate);
        }
        const byAction = {};
        const byActor = {};
        const byResourceType = {};
        const bySeverity = {
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
            if (entry.success)
                successCount++;
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
    applyRetention(orgId, retentionDays) {
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        const orgLogs = this.logsByOrg.get(orgId) || [];
        let deleted = 0;
        const remainingLogs = [];
        for (const id of orgLogs) {
            const entry = this.logs.get(id);
            if (entry && entry.timestamp < cutoff) {
                this.logs.delete(id);
                deleted++;
            }
            else {
                remainingLogs.push(id);
            }
        }
        this.logsByOrg.set(orgId, remainingLogs);
        return deleted;
    }
    /**
     * Export logs for a date range
     */
    export(orgId, startDate, endDate) {
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
    getCount(orgId) {
        return this.logsByOrg.get(orgId)?.length || 0;
    }
    /**
     * Set retention days
     */
    setRetention(days) {
        this.retentionDays = days;
    }
}
// Singleton store instance
exports.auditLogStore = new AuditLogStore();
// ==================== Audit Log Service ====================
/**
 * Create an audit log entry
 */
function createAuditLog(input) {
    const severity = exports.ACTION_SEVERITY[input.action] || AuditSeverity.INFO;
    const entry = {
        id: (0, uuid_1.v4)(),
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
    return exports.auditLogStore.create(entry);
}
/**
 * Create system audit log (for automated actions)
 */
function createSystemAuditLog(orgId, action, resource, metadata) {
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
function calculateChanges(oldObj, newObj, fields) {
    const changes = [];
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
function sanitizeValue(value) {
    if (value === null || value === undefined) {
        return value;
    }
    // Redact sensitive fields
    const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'api_key', 'credentials'];
    if (typeof value === 'object') {
        if (Array.isArray(value)) {
            return value.map(v => sanitizeValue(v));
        }
        const sanitized = {};
        for (const [key, val] of Object.entries(value)) {
            if (sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
                sanitized[key] = '[REDACTED]';
            }
            else {
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
function queryAuditLogs(orgId, userId, query) {
    // Check permission
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.AUDIT_VIEW]);
    return exports.auditLogStore.query({ ...query, orgId });
}
/**
 * Get audit log entry by ID
 */
function getAuditLogEntry(orgId, userId, entryId) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.AUDIT_VIEW]);
    const entry = exports.auditLogStore.get(entryId);
    if (!entry || entry.orgId !== orgId) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Audit log entry not found', { details: { entryId } });
    }
    return entry;
}
/**
 * Get audit statistics
 */
function getAuditStats(orgId, userId, startDate, endDate) {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.AUDIT_VIEW]);
    return exports.auditLogStore.getStats(orgId, startDate, endDate);
}
/**
 * Export audit logs
 */
function exportAuditLogs(orgId, userId, startDate, endDate, format = 'json') {
    (0, organization_js_1.requirePermission)(userId, orgId, [organization_js_1.Permission.AUDIT_VIEW]);
    const entries = exports.auditLogStore.export(orgId, startDate, endDate);
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
function applyAuditRetention(orgId, retentionDays) {
    return exports.auditLogStore.applyRetention(orgId, retentionDays);
}
// ==================== Convenience Logging Functions ====================
/**
 * Log organization action
 */
function logOrganizationAction(orgId, action, actor, orgName, changes, metadata) {
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
function logMemberAction(orgId, action, actor, memberId, memberEmail, changes, metadata) {
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
function logTeamAction(orgId, action, actor, teamId, teamName, changes, metadata) {
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
function logInvitationAction(orgId, action, actor, invitationId, inviteeEmail, metadata) {
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
function logSecurityAction(orgId, action, actor, metadata) {
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
function logFailedAction(orgId, action, actor, resource, errorMessage, metadata) {
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
