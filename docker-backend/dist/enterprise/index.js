"use strict";
/**
 * Enterprise Module
 * Re-exports all enterprise functionality for organization management,
 * team collaboration, RBAC, audit logging, and billing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAuditRetention = exports.exportAuditLogs = exports.getAuditStats = exports.getAuditLogEntry = exports.queryAuditLogs = exports.calculateChanges = exports.createSystemAuditLog = exports.createAuditLog = exports.ACTION_SEVERITY = exports.AuditResourceType = exports.AuditSeverity = exports.AuditAction = exports.validateSlug = exports.generateSlug = exports.organizationStore = exports.resendInvitation = exports.listInvitations = exports.revokeInvitation = exports.acceptInvitation = exports.createInvitation = exports.leaveOrganization = exports.removeMember = exports.updateMemberRole = exports.getMember = exports.listMembers = exports.removeTeamMember = exports.addTeamMember = exports.listTeams = exports.deleteTeam = exports.updateTeam = exports.getTeam = exports.createTeam = exports.transferOwnership = exports.listUserOrganizations = exports.deleteOrganization = exports.updateOrganization = exports.getOrganizationBySlug = exports.getOrganization = exports.createOrganization = exports.requirePermission = exports.checkPermission = exports.getMemberPermissions = exports.hasAllPermissions = exports.hasAnyPermission = exports.hasPermission = exports.hasRoleLevel = exports.ROLE_PERMISSIONS = exports.ROLE_HIERARCHY = exports.Permission = exports.OrganizationRole = void 0;
exports.billingStore = exports.getInvoice = exports.getInvoices = exports.syncMemberCount = exports.enforceMemberLimit = exports.canAddMembers = exports.updateSeats = exports.getUsageHistory = exports.getUsageSnapshot = exports.setUsage = exports.decrementUsage = exports.incrementUsage = exports.recordUsage = exports.enforceFeature = exports.enforceLimit = exports.isWithinLimit = exports.reactivateSubscription = exports.cancelSubscription = exports.downgradeTier = exports.upgradeTier = exports.getLimit = exports.hasFeature = exports.getTierLimits = exports.getSubscription = exports.getOrCreateSubscription = exports.TIER_LIMITS = exports.UsageMetric = exports.BillingCycle = exports.SubscriptionTier = exports.auditLogStore = exports.logFailedAction = exports.logSecurityAction = exports.logInvitationAction = exports.logTeamAction = exports.logMemberAction = exports.logOrganizationAction = void 0;
// ==================== Organization Module ====================
var organization_js_1 = require("./organization.js");
// Enums
Object.defineProperty(exports, "OrganizationRole", { enumerable: true, get: function () { return organization_js_1.OrganizationRole; } });
Object.defineProperty(exports, "Permission", { enumerable: true, get: function () { return organization_js_1.Permission; } });
Object.defineProperty(exports, "ROLE_HIERARCHY", { enumerable: true, get: function () { return organization_js_1.ROLE_HIERARCHY; } });
Object.defineProperty(exports, "ROLE_PERMISSIONS", { enumerable: true, get: function () { return organization_js_1.ROLE_PERMISSIONS; } });
// RBAC Functions
Object.defineProperty(exports, "hasRoleLevel", { enumerable: true, get: function () { return organization_js_1.hasRoleLevel; } });
Object.defineProperty(exports, "hasPermission", { enumerable: true, get: function () { return organization_js_1.hasPermission; } });
Object.defineProperty(exports, "hasAnyPermission", { enumerable: true, get: function () { return organization_js_1.hasAnyPermission; } });
Object.defineProperty(exports, "hasAllPermissions", { enumerable: true, get: function () { return organization_js_1.hasAllPermissions; } });
Object.defineProperty(exports, "getMemberPermissions", { enumerable: true, get: function () { return organization_js_1.getMemberPermissions; } });
Object.defineProperty(exports, "checkPermission", { enumerable: true, get: function () { return organization_js_1.checkPermission; } });
Object.defineProperty(exports, "requirePermission", { enumerable: true, get: function () { return organization_js_1.requirePermission; } });
// Organization Service
Object.defineProperty(exports, "createOrganization", { enumerable: true, get: function () { return organization_js_1.createOrganization; } });
Object.defineProperty(exports, "getOrganization", { enumerable: true, get: function () { return organization_js_1.getOrganization; } });
Object.defineProperty(exports, "getOrganizationBySlug", { enumerable: true, get: function () { return organization_js_1.getOrganizationBySlug; } });
Object.defineProperty(exports, "updateOrganization", { enumerable: true, get: function () { return organization_js_1.updateOrganization; } });
Object.defineProperty(exports, "deleteOrganization", { enumerable: true, get: function () { return organization_js_1.deleteOrganization; } });
Object.defineProperty(exports, "listUserOrganizations", { enumerable: true, get: function () { return organization_js_1.listUserOrganizations; } });
Object.defineProperty(exports, "transferOwnership", { enumerable: true, get: function () { return organization_js_1.transferOwnership; } });
// Team Service
Object.defineProperty(exports, "createTeam", { enumerable: true, get: function () { return organization_js_1.createTeam; } });
Object.defineProperty(exports, "getTeam", { enumerable: true, get: function () { return organization_js_1.getTeam; } });
Object.defineProperty(exports, "updateTeam", { enumerable: true, get: function () { return organization_js_1.updateTeam; } });
Object.defineProperty(exports, "deleteTeam", { enumerable: true, get: function () { return organization_js_1.deleteTeam; } });
Object.defineProperty(exports, "listTeams", { enumerable: true, get: function () { return organization_js_1.listTeams; } });
Object.defineProperty(exports, "addTeamMember", { enumerable: true, get: function () { return organization_js_1.addTeamMember; } });
Object.defineProperty(exports, "removeTeamMember", { enumerable: true, get: function () { return organization_js_1.removeTeamMember; } });
// Member Service
Object.defineProperty(exports, "listMembers", { enumerable: true, get: function () { return organization_js_1.listMembers; } });
Object.defineProperty(exports, "getMember", { enumerable: true, get: function () { return organization_js_1.getMember; } });
Object.defineProperty(exports, "updateMemberRole", { enumerable: true, get: function () { return organization_js_1.updateMemberRole; } });
Object.defineProperty(exports, "removeMember", { enumerable: true, get: function () { return organization_js_1.removeMember; } });
Object.defineProperty(exports, "leaveOrganization", { enumerable: true, get: function () { return organization_js_1.leaveOrganization; } });
// Invitation Service
Object.defineProperty(exports, "createInvitation", { enumerable: true, get: function () { return organization_js_1.createInvitation; } });
Object.defineProperty(exports, "acceptInvitation", { enumerable: true, get: function () { return organization_js_1.acceptInvitation; } });
Object.defineProperty(exports, "revokeInvitation", { enumerable: true, get: function () { return organization_js_1.revokeInvitation; } });
Object.defineProperty(exports, "listInvitations", { enumerable: true, get: function () { return organization_js_1.listInvitations; } });
Object.defineProperty(exports, "resendInvitation", { enumerable: true, get: function () { return organization_js_1.resendInvitation; } });
// Store & Utilities
Object.defineProperty(exports, "organizationStore", { enumerable: true, get: function () { return organization_js_1.organizationStore; } });
Object.defineProperty(exports, "generateSlug", { enumerable: true, get: function () { return organization_js_1.generateSlug; } });
Object.defineProperty(exports, "validateSlug", { enumerable: true, get: function () { return organization_js_1.validateSlug; } });
// ==================== Audit Log Module ====================
var audit_log_js_1 = require("./audit-log.js");
// Enums
Object.defineProperty(exports, "AuditAction", { enumerable: true, get: function () { return audit_log_js_1.AuditAction; } });
Object.defineProperty(exports, "AuditSeverity", { enumerable: true, get: function () { return audit_log_js_1.AuditSeverity; } });
Object.defineProperty(exports, "AuditResourceType", { enumerable: true, get: function () { return audit_log_js_1.AuditResourceType; } });
Object.defineProperty(exports, "ACTION_SEVERITY", { enumerable: true, get: function () { return audit_log_js_1.ACTION_SEVERITY; } });
// Service Functions
Object.defineProperty(exports, "createAuditLog", { enumerable: true, get: function () { return audit_log_js_1.createAuditLog; } });
Object.defineProperty(exports, "createSystemAuditLog", { enumerable: true, get: function () { return audit_log_js_1.createSystemAuditLog; } });
Object.defineProperty(exports, "calculateChanges", { enumerable: true, get: function () { return audit_log_js_1.calculateChanges; } });
Object.defineProperty(exports, "queryAuditLogs", { enumerable: true, get: function () { return audit_log_js_1.queryAuditLogs; } });
Object.defineProperty(exports, "getAuditLogEntry", { enumerable: true, get: function () { return audit_log_js_1.getAuditLogEntry; } });
Object.defineProperty(exports, "getAuditStats", { enumerable: true, get: function () { return audit_log_js_1.getAuditStats; } });
Object.defineProperty(exports, "exportAuditLogs", { enumerable: true, get: function () { return audit_log_js_1.exportAuditLogs; } });
Object.defineProperty(exports, "applyAuditRetention", { enumerable: true, get: function () { return audit_log_js_1.applyAuditRetention; } });
// Convenience Logging Functions
Object.defineProperty(exports, "logOrganizationAction", { enumerable: true, get: function () { return audit_log_js_1.logOrganizationAction; } });
Object.defineProperty(exports, "logMemberAction", { enumerable: true, get: function () { return audit_log_js_1.logMemberAction; } });
Object.defineProperty(exports, "logTeamAction", { enumerable: true, get: function () { return audit_log_js_1.logTeamAction; } });
Object.defineProperty(exports, "logInvitationAction", { enumerable: true, get: function () { return audit_log_js_1.logInvitationAction; } });
Object.defineProperty(exports, "logSecurityAction", { enumerable: true, get: function () { return audit_log_js_1.logSecurityAction; } });
Object.defineProperty(exports, "logFailedAction", { enumerable: true, get: function () { return audit_log_js_1.logFailedAction; } });
// Store
Object.defineProperty(exports, "auditLogStore", { enumerable: true, get: function () { return audit_log_js_1.auditLogStore; } });
// ==================== Billing Module ====================
var billing_js_1 = require("./billing.js");
// Enums
Object.defineProperty(exports, "SubscriptionTier", { enumerable: true, get: function () { return billing_js_1.SubscriptionTier; } });
Object.defineProperty(exports, "BillingCycle", { enumerable: true, get: function () { return billing_js_1.BillingCycle; } });
Object.defineProperty(exports, "UsageMetric", { enumerable: true, get: function () { return billing_js_1.UsageMetric; } });
Object.defineProperty(exports, "TIER_LIMITS", { enumerable: true, get: function () { return billing_js_1.TIER_LIMITS; } });
// Subscription Service
Object.defineProperty(exports, "getOrCreateSubscription", { enumerable: true, get: function () { return billing_js_1.getOrCreateSubscription; } });
Object.defineProperty(exports, "getSubscription", { enumerable: true, get: function () { return billing_js_1.getSubscription; } });
Object.defineProperty(exports, "getTierLimits", { enumerable: true, get: function () { return billing_js_1.getTierLimits; } });
Object.defineProperty(exports, "hasFeature", { enumerable: true, get: function () { return billing_js_1.hasFeature; } });
Object.defineProperty(exports, "getLimit", { enumerable: true, get: function () { return billing_js_1.getLimit; } });
Object.defineProperty(exports, "upgradeTier", { enumerable: true, get: function () { return billing_js_1.upgradeTier; } });
Object.defineProperty(exports, "downgradeTier", { enumerable: true, get: function () { return billing_js_1.downgradeTier; } });
Object.defineProperty(exports, "cancelSubscription", { enumerable: true, get: function () { return billing_js_1.cancelSubscription; } });
Object.defineProperty(exports, "reactivateSubscription", { enumerable: true, get: function () { return billing_js_1.reactivateSubscription; } });
// Limit Checking
Object.defineProperty(exports, "isWithinLimit", { enumerable: true, get: function () { return billing_js_1.isWithinLimit; } });
Object.defineProperty(exports, "enforceLimit", { enumerable: true, get: function () { return billing_js_1.enforceLimit; } });
Object.defineProperty(exports, "enforceFeature", { enumerable: true, get: function () { return billing_js_1.enforceFeature; } });
// Usage Tracking
Object.defineProperty(exports, "recordUsage", { enumerable: true, get: function () { return billing_js_1.recordUsage; } });
Object.defineProperty(exports, "incrementUsage", { enumerable: true, get: function () { return billing_js_1.incrementUsage; } });
Object.defineProperty(exports, "decrementUsage", { enumerable: true, get: function () { return billing_js_1.decrementUsage; } });
Object.defineProperty(exports, "setUsage", { enumerable: true, get: function () { return billing_js_1.setUsage; } });
Object.defineProperty(exports, "getUsageSnapshot", { enumerable: true, get: function () { return billing_js_1.getUsageSnapshot; } });
Object.defineProperty(exports, "getUsageHistory", { enumerable: true, get: function () { return billing_js_1.getUsageHistory; } });
// Seat Management
Object.defineProperty(exports, "updateSeats", { enumerable: true, get: function () { return billing_js_1.updateSeats; } });
Object.defineProperty(exports, "canAddMembers", { enumerable: true, get: function () { return billing_js_1.canAddMembers; } });
Object.defineProperty(exports, "enforceMemberLimit", { enumerable: true, get: function () { return billing_js_1.enforceMemberLimit; } });
Object.defineProperty(exports, "syncMemberCount", { enumerable: true, get: function () { return billing_js_1.syncMemberCount; } });
// Invoice Service
Object.defineProperty(exports, "getInvoices", { enumerable: true, get: function () { return billing_js_1.getInvoices; } });
Object.defineProperty(exports, "getInvoice", { enumerable: true, get: function () { return billing_js_1.getInvoice; } });
// Store
Object.defineProperty(exports, "billingStore", { enumerable: true, get: function () { return billing_js_1.billingStore; } });
