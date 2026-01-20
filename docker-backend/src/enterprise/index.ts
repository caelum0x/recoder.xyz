/**
 * Enterprise Module
 * Re-exports all enterprise functionality for organization management,
 * team collaboration, RBAC, audit logging, and billing.
 */

// ==================== Organization Module ====================
export {
  // Enums
  OrganizationRole,
  Permission,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,

  // Types
  type Organization,
  type OrganizationSettings,
  type OrganizationMember,
  type Team,
  type TeamMember,
  type Invitation,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type CreateTeamInput,
  type UpdateTeamInput,
  type CreateInvitationInput,
  type PermissionCheckResult,

  // RBAC Functions
  hasRoleLevel,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getMemberPermissions,
  checkPermission,
  requirePermission,

  // Organization Service
  createOrganization,
  getOrganization,
  getOrganizationBySlug,
  updateOrganization,
  deleteOrganization,
  listUserOrganizations,
  transferOwnership,

  // Team Service
  createTeam,
  getTeam,
  updateTeam,
  deleteTeam,
  listTeams,
  addTeamMember,
  removeTeamMember,

  // Member Service
  listMembers,
  getMember,
  updateMemberRole,
  removeMember,
  leaveOrganization,

  // Invitation Service
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listInvitations,
  resendInvitation,

  // Store & Utilities
  organizationStore,
  generateSlug,
  validateSlug,
} from './organization.js';

// ==================== Audit Log Module ====================
export {
  // Enums
  AuditAction,
  AuditSeverity,
  AuditResourceType,
  ACTION_SEVERITY,

  // Types
  type AuditActor,
  type AuditResource,
  type AuditChange,
  type AuditLogEntry,
  type CreateAuditLogInput,
  type AuditLogQuery,
  type AuditLogQueryResult,
  type AuditStats,

  // Service Functions
  createAuditLog,
  createSystemAuditLog,
  calculateChanges,
  queryAuditLogs,
  getAuditLogEntry,
  getAuditStats,
  exportAuditLogs,
  applyAuditRetention,

  // Convenience Logging Functions
  logOrganizationAction,
  logMemberAction,
  logTeamAction,
  logInvitationAction,
  logSecurityAction,
  logFailedAction,

  // Store
  auditLogStore,
} from './audit-log.js';

// ==================== Billing Module ====================
export {
  // Enums
  SubscriptionTier,
  BillingCycle,
  UsageMetric,
  TIER_LIMITS,

  // Types
  type TierLimits,
  type Subscription,
  type UsageRecord,
  type UsageSnapshot,
  type UsageAlert,
  type Invoice,
  type InvoiceLineItem,
  type SeatChangeRequest,

  // Subscription Service
  getOrCreateSubscription,
  getSubscription,
  getTierLimits,
  hasFeature,
  getLimit,
  upgradeTier,
  downgradeTier,
  cancelSubscription,
  reactivateSubscription,

  // Limit Checking
  isWithinLimit,
  enforceLimit,
  enforceFeature,

  // Usage Tracking
  recordUsage,
  incrementUsage,
  decrementUsage,
  setUsage,
  getUsageSnapshot,
  getUsageHistory,

  // Seat Management
  updateSeats,
  canAddMembers,
  enforceMemberLimit,
  syncMemberCount,

  // Invoice Service
  getInvoices,
  getInvoice,

  // Store
  billingStore,
} from './billing.js';
