/**
 * Admin Utilities Service
 * Provides admin permission checking, role management, and user administration
 * Adapted from Libra's admin-utils for Recoder
 */

// ==================== Types ====================

/**
 * Admin permission types
 */
export type AdminPermission =
  | 'user:create'
  | 'user:list'
  | 'user:ban'
  | 'user:unban'
  | 'user:delete'
  | 'user:impersonate'
  | 'user:set-role'
  | 'session:list'
  | 'session:revoke'
  | 'organization:manage'
  | 'project:view-all'
  | 'project:delete-any'
  | 'analytics:view'
  | 'settings:manage';

/**
 * Global user role types
 */
export type UserRole = 'user' | 'admin' | 'superadmin';

/**
 * Organization role types
 */
export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * User data for admin operations
 */
export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role: UserRole;
  emailVerified: boolean;
  banned: boolean;
  banReason?: string;
  banExpires?: Date;
  createdAt: Date;
  updatedAt?: Date;
  lastActiveAt?: Date;
}

/**
 * User roles response
 */
export interface UserRoles {
  globalRole: UserRole;
  organizationRole?: OrganizationRole;
}

/**
 * Admin action context
 */
export interface AdminActionContext {
  actorId: string;
  targetId: string;
  action: AdminPermission;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

// ==================== Role Hierarchy ====================

/**
 * Role hierarchy - higher number means more permissions
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  superadmin: 2,
};

/**
 * Default permissions for each role
 */
const ROLE_PERMISSIONS: Record<UserRole, AdminPermission[]> = {
  user: [],
  admin: [
    'user:list',
    'user:ban',
    'user:unban',
    'session:list',
    'session:revoke',
    'analytics:view',
    'project:view-all',
  ],
  superadmin: [
    'user:create',
    'user:list',
    'user:ban',
    'user:unban',
    'user:delete',
    'user:impersonate',
    'user:set-role',
    'session:list',
    'session:revoke',
    'organization:manage',
    'project:view-all',
    'project:delete-any',
    'analytics:view',
    'settings:manage',
  ],
};

// ==================== Permission Checking ====================

/**
 * Check if a role has at least the required role level
 */
export function hasRoleLevel(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if a user is a global admin (admin or superadmin)
 */
export function isGlobalAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'superadmin';
}

/**
 * Check if a user is a superadmin
 */
export function isSuperAdmin(role: UserRole): boolean {
  return role === 'superadmin';
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): AdminPermission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: AdminPermission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions?.includes(permission) ?? false;
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole, permissions: AdminPermission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: UserRole, permissions: AdminPermission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

// ==================== Admin Action Validation ====================

/**
 * Check if an admin can perform an action on another user
 */
export function canActOnUser(
  actorRole: UserRole,
  targetRole: UserRole,
  action: AdminPermission
): { allowed: boolean; reason?: string } {
  // Check if actor has the permission
  if (!hasPermission(actorRole, action)) {
    return { allowed: false, reason: 'Insufficient permissions for this action' };
  }

  // Superadmins can act on anyone except other superadmins
  if (actorRole === 'superadmin') {
    if (targetRole === 'superadmin' && ['user:delete', 'user:ban'].includes(action)) {
      return { allowed: false, reason: 'Cannot perform this action on another superadmin' };
    }
    return { allowed: true };
  }

  // Admins cannot act on other admins or superadmins
  if (actorRole === 'admin') {
    if (ROLE_HIERARCHY[targetRole] >= ROLE_HIERARCHY['admin']) {
      return { allowed: false, reason: 'Cannot act on users with equal or higher permissions' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Only admins can perform this action' };
}

/**
 * Validate admin action before execution
 */
export function validateAdminAction(context: AdminActionContext, actorRole: UserRole, targetRole?: UserRole): {
  valid: boolean;
  reason?: string;
} {
  // Cannot act on yourself for certain actions
  if (context.actorId === context.targetId) {
    if (['user:ban', 'user:delete'].includes(context.action)) {
      return { valid: false, reason: 'Cannot perform this action on yourself' };
    }
  }

  // Check permission
  if (!hasPermission(actorRole, context.action)) {
    return { valid: false, reason: 'Insufficient permissions' };
  }

  // If target role is provided, check hierarchy
  if (targetRole) {
    const canAct = canActOnUser(actorRole, targetRole, context.action);
    if (!canAct.allowed) {
      return { valid: false, reason: canAct.reason };
    }
  }

  return { valid: true };
}

// ==================== Role Management ====================

/**
 * Check if a role can be assigned by the actor
 */
export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  // Only superadmins can assign admin roles
  if (targetRole === 'admin' || targetRole === 'superadmin') {
    return actorRole === 'superadmin';
  }

  // Admins can assign user role
  return isGlobalAdmin(actorRole);
}

/**
 * Get roles that can be assigned by the actor
 */
export function getAssignableRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === 'superadmin') {
    return ['user', 'admin', 'superadmin'];
  }
  if (actorRole === 'admin') {
    return ['user'];
  }
  return [];
}

// ==================== User Management Utilities ====================

/**
 * Format ban duration to human-readable string
 */
export function formatBanDuration(expiresAt?: Date): string {
  if (!expiresAt) {
    return 'Permanent';
  }

  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return 'Expired';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours}h` : ''}`;
  }

  return `${hours} hour${hours > 1 ? 's' : ''}`;
}

/**
 * Check if a ban has expired
 */
export function isBanExpired(expiresAt?: Date): boolean {
  if (!expiresAt) {
    return false; // Permanent ban
  }
  return new Date() > expiresAt;
}

/**
 * Calculate ban expiration date from duration in days
 */
export function calculateBanExpiration(durationDays?: number): Date | undefined {
  if (!durationDays || durationDays <= 0) {
    return undefined; // Permanent ban
  }
  return new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
}

// ==================== Admin Dashboard Utilities ====================

/**
 * Get admin dashboard stats summary
 */
export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  adminCount: number;
  newUsersToday: number;
  newUsersThisWeek: number;
}

/**
 * Calculate admin statistics from user list
 */
export function calculateAdminStats(users: AdminUser[]): AdminStats {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    totalUsers: users.length,
    activeUsers: users.filter((u) => !u.banned).length,
    bannedUsers: users.filter((u) => u.banned).length,
    adminCount: users.filter((u) => isGlobalAdmin(u.role)).length,
    newUsersToday: users.filter((u) => new Date(u.createdAt) >= startOfDay).length,
    newUsersThisWeek: users.filter((u) => new Date(u.createdAt) >= startOfWeek).length,
  };
}

// ==================== Pagination Utilities ====================

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Apply pagination to a list
 */
export function paginate<T>(items: T[], params: PaginationParams): PaginatedResult<T> {
  const { page, pageSize } = params;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);

  return {
    data: items.slice(start, end),
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// ==================== Search Utilities ====================

/**
 * Search users by email or name
 */
export function searchUsers(users: AdminUser[], query: string, field?: 'email' | 'name'): AdminUser[] {
  const searchTerm = query.toLowerCase().trim();
  if (!searchTerm) {
    return users;
  }

  return users.filter((user) => {
    if (field === 'email') {
      return user.email.toLowerCase().includes(searchTerm);
    }
    if (field === 'name') {
      return user.name?.toLowerCase().includes(searchTerm);
    }
    // Search both fields
    return (
      user.email.toLowerCase().includes(searchTerm) ||
      user.name?.toLowerCase().includes(searchTerm)
    );
  });
}

/**
 * Filter users by role
 */
export function filterByRole(users: AdminUser[], role?: UserRole): AdminUser[] {
  if (!role) {
    return users;
  }
  return users.filter((user) => user.role === role);
}

/**
 * Filter users by banned status
 */
export function filterByBannedStatus(users: AdminUser[], banned?: boolean): AdminUser[] {
  if (banned === undefined) {
    return users;
  }
  return users.filter((user) => user.banned === banned);
}

export default {
  hasRoleLevel,
  isGlobalAdmin,
  isSuperAdmin,
  getRolePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canActOnUser,
  validateAdminAction,
  canAssignRole,
  getAssignableRoles,
  formatBanDuration,
  isBanExpired,
  calculateBanExpiration,
  calculateAdminStats,
  paginate,
  searchUsers,
  filterByRole,
  filterByBannedStatus,
};
