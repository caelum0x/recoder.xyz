/**
 * Auth Utilities Index
 * Export all utility modules
 */

// Email service
export {
  sendWelcomeEmail,
  sendCancellationEmail,
  sendOrganizationInvitation,
  sendEmail,
  emailTemplates,
} from './email-service';

// Subscription utils
export {
  getSubscription,
  getOrganizationSubscription,
  hasPaidSubscription,
  hasMinimumPlan,
  getActiveOrganization as getActiveOrganizationForUser,
  getOrganizationOwnerUserId,
  hasOrganizationRole,
  getSubscriptionPlanDisplayName,
  getSubscriptionStatusDisplay,
  isSubscriptionActive,
  subscriptionNeedsAttention,
} from './subscription-utils';

// Organization utils
export {
  getActiveOrganization,
  createDefaultOrganization,
  getOrganizationById,
  getOrganizationMembers,
  getOrganizationOwner,
  isOrganizationMember,
  isOrganizationOwner,
  addOrganizationMember,
  removeOrganizationMember,
  updateMemberRole,
  getUserOrganizations,
  generateOrganizationSlug,
} from './organization-utils';

// Admin utils
export {
  isAdmin,
  requireAdmin,
  checkAdminAccess,
  adminAction,
  logAdminAction,
  logUserAction,
  logSubscriptionAction,
  logOrganizationAction,
  ADMIN_ACTIONS,
  type AdminLogEntry,
} from './admin-utils';
