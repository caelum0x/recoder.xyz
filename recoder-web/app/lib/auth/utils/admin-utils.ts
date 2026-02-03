/**
 * Admin Utilities
 * Helper functions for admin operations
 */

import { getAdminUserIds } from '../env';

/**
 * Check if a user ID is in the admin list
 */
export function isAdmin(userId: string): boolean {
  const adminIds = getAdminUserIds();
  return adminIds.includes(userId);
}

/**
 * Require admin access (throws if not admin)
 */
export function requireAdmin(userId: string): void {
  if (!isAdmin(userId)) {
    throw new Error('Admin access required');
  }
}

/**
 * Check admin access and return boolean (safe version)
 */
export function checkAdminAccess(userId: string | null | undefined): boolean {
  if (!userId) {
    return false;
  }
  return isAdmin(userId);
}

/**
 * Admin action wrapper
 * Ensures action is only performed by admins
 */
export async function adminAction<T>(
  userId: string,
  action: () => Promise<T>
): Promise<{ success: boolean; data?: T; error?: string }> {
  if (!isAdmin(userId)) {
    return {
      success: false,
      error: 'Admin access required',
    };
  }

  try {
    const data = await action();
    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('[Admin] Action failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Admin log entry
 */
export interface AdminLogEntry {
  timestamp: Date;
  adminId: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, any>;
}

/**
 * Log admin action (placeholder - implement actual logging)
 */
export function logAdminAction(entry: Omit<AdminLogEntry, 'timestamp'>): void {
  const logEntry: AdminLogEntry = {
    ...entry,
    timestamp: new Date(),
  };

  console.log('[Admin Action]', JSON.stringify(logEntry));

  // In production, this should write to a proper audit log
  // e.g., database, external logging service, etc.
}

/**
 * Admin action types for logging
 */
export const ADMIN_ACTIONS = {
  // User management
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_SUSPENDED: 'user.suspended',
  USER_UNSUSPENDED: 'user.unsuspended',

  // Subscription management
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_UPDATED: 'subscription.updated',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  SUBSCRIPTION_REFUNDED: 'subscription.refunded',

  // Organization management
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  ORGANIZATION_DELETED: 'organization.deleted',
  MEMBER_ADDED: 'organization.member.added',
  MEMBER_REMOVED: 'organization.member.removed',
  MEMBER_ROLE_UPDATED: 'organization.member.role_updated',

  // Quota management
  QUOTA_ADJUSTED: 'quota.adjusted',
  QUOTA_RESET: 'quota.reset',

  // System
  SYSTEM_CONFIG_UPDATED: 'system.config.updated',
  SYSTEM_MAINTENANCE: 'system.maintenance',
} as const;

/**
 * Log user management action
 */
export function logUserAction(
  adminId: string,
  action: keyof typeof ADMIN_ACTIONS,
  userId: string,
  details?: Record<string, any>
): void {
  logAdminAction({
    adminId,
    action: ADMIN_ACTIONS[action],
    targetId: userId,
    targetType: 'user',
    details,
  });
}

/**
 * Log subscription action
 */
export function logSubscriptionAction(
  adminId: string,
  action: keyof typeof ADMIN_ACTIONS,
  subscriptionId: string,
  details?: Record<string, any>
): void {
  logAdminAction({
    adminId,
    action: ADMIN_ACTIONS[action],
    targetId: subscriptionId,
    targetType: 'subscription',
    details,
  });
}

/**
 * Log organization action
 */
export function logOrganizationAction(
  adminId: string,
  action: keyof typeof ADMIN_ACTIONS,
  organizationId: string,
  details?: Record<string, any>
): void {
  logAdminAction({
    adminId,
    action: ADMIN_ACTIONS[action],
    targetId: organizationId,
    targetType: 'organization',
    details,
  });
}
