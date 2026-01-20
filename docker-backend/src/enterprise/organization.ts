/**
 * Enterprise Organization Module
 * Handles organization management, teams, roles, and RBAC for enterprise customers
 *
 * Features:
 * - Organization CRUD operations
 * - Team management with permissions
 * - Role-based access control (RBAC)
 * - Member invitation system
 * - Permission checks for resources
 */

import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { AppError, ErrorCode } from '../errors/index.js';

// ==================== Types & Interfaces ====================

/**
 * Organization roles with increasing permission levels
 */
export enum OrganizationRole {
  VIEWER = 'viewer',      // Read-only access
  MEMBER = 'member',      // Basic member access
  ADMIN = 'admin',        // Admin access (manage teams, members)
  OWNER = 'owner',        // Full access (billing, delete org)
}

/**
 * Role hierarchy for permission checking
 * Higher number = more permissions
 */
export const ROLE_HIERARCHY: Record<OrganizationRole, number> = {
  [OrganizationRole.VIEWER]: 0,
  [OrganizationRole.MEMBER]: 1,
  [OrganizationRole.ADMIN]: 2,
  [OrganizationRole.OWNER]: 3,
};

/**
 * Permission types for fine-grained access control
 */
export enum Permission {
  // Organization permissions
  ORG_VIEW = 'org:view',
  ORG_UPDATE = 'org:update',
  ORG_DELETE = 'org:delete',
  ORG_MANAGE_BILLING = 'org:manage_billing',

  // Team permissions
  TEAM_VIEW = 'team:view',
  TEAM_CREATE = 'team:create',
  TEAM_UPDATE = 'team:update',
  TEAM_DELETE = 'team:delete',
  TEAM_MANAGE_MEMBERS = 'team:manage_members',

  // Member permissions
  MEMBER_VIEW = 'member:view',
  MEMBER_INVITE = 'member:invite',
  MEMBER_REMOVE = 'member:remove',
  MEMBER_UPDATE_ROLE = 'member:update_role',

  // Project permissions
  PROJECT_VIEW = 'project:view',
  PROJECT_CREATE = 'project:create',
  PROJECT_UPDATE = 'project:update',
  PROJECT_DELETE = 'project:delete',
  PROJECT_DEPLOY = 'project:deploy',

  // Settings permissions
  SETTINGS_VIEW = 'settings:view',
  SETTINGS_UPDATE = 'settings:update',

  // Audit permissions
  AUDIT_VIEW = 'audit:view',
}

/**
 * Default permissions for each role
 */
export const ROLE_PERMISSIONS: Record<OrganizationRole, Permission[]> = {
  [OrganizationRole.VIEWER]: [
    Permission.ORG_VIEW,
    Permission.TEAM_VIEW,
    Permission.MEMBER_VIEW,
    Permission.PROJECT_VIEW,
    Permission.SETTINGS_VIEW,
  ],
  [OrganizationRole.MEMBER]: [
    Permission.ORG_VIEW,
    Permission.TEAM_VIEW,
    Permission.MEMBER_VIEW,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.SETTINGS_VIEW,
  ],
  [OrganizationRole.ADMIN]: [
    Permission.ORG_VIEW,
    Permission.ORG_UPDATE,
    Permission.TEAM_VIEW,
    Permission.TEAM_CREATE,
    Permission.TEAM_UPDATE,
    Permission.TEAM_DELETE,
    Permission.TEAM_MANAGE_MEMBERS,
    Permission.MEMBER_VIEW,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_REMOVE,
    Permission.MEMBER_UPDATE_ROLE,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_DEPLOY,
    Permission.SETTINGS_VIEW,
    Permission.SETTINGS_UPDATE,
    Permission.AUDIT_VIEW,
  ],
  [OrganizationRole.OWNER]: [
    // Owner has all permissions
    ...Object.values(Permission),
  ],
};

/**
 * Organization settings
 */
export interface OrganizationSettings {
  allowedDomains?: string[];           // Allowed email domains for auto-join
  defaultTeamId?: string;              // Default team for new members
  ssoEnabled?: boolean;                // SSO configuration enabled
  ssoProvider?: string;                // SAML/OIDC provider
  ssoConfig?: Record<string, unknown>; // Provider-specific config
  enforceSSO?: boolean;                // Require SSO for all members
  auditRetentionDays?: number;         // Days to keep audit logs
  maxProjects?: number;                // Max projects for org
  maxMembers?: number;                 // Max members for org
  features?: {                         // Feature flags
    customBranding?: boolean;
    prioritySupport?: boolean;
    advancedAnalytics?: boolean;
    multiRegion?: boolean;
  };
}

/**
 * Organization model
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;                        // URL-friendly unique identifier
  ownerId: string;                     // User ID of the owner
  settings: OrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;                    // Soft delete
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  trialEndsAt?: Date;
}

/**
 * Organization member
 */
export interface OrganizationMember {
  id: string;
  orgId: string;
  userId: string;
  email: string;
  displayName?: string;
  role: OrganizationRole;
  teamIds: string[];                   // Teams the member belongs to
  customPermissions?: Permission[];     // Additional permissions beyond role
  joinedAt: Date;
  invitedBy?: string;                  // User ID who invited
  lastActiveAt?: Date;
}

/**
 * Team model
 */
export interface Team {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  permissions: Permission[];           // Team-level permissions
  members: TeamMember[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;                   // User ID
  settings?: {
    defaultBranch?: string;
    codeReviewRequired?: boolean;
    deploymentEnvironments?: string[];
  };
}

/**
 * Team member with team-specific role
 */
export interface TeamMember {
  userId: string;
  email: string;
  displayName?: string;
  role: 'lead' | 'member';             // Team-specific role
  addedAt: Date;
  addedBy: string;
}

/**
 * Invitation model
 */
export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  role: OrganizationRole;
  teamIds?: string[];                  // Teams to add invitee to
  token: string;                       // Secure token for accepting
  expiresAt: Date;
  createdAt: Date;
  createdBy: string;                   // User ID who created invitation
  acceptedAt?: Date;
  acceptedBy?: string;                 // User ID who accepted
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

/**
 * Create organization input
 */
export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  ownerId: string;
  settings?: Partial<OrganizationSettings>;
}

/**
 * Update organization input
 */
export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  settings?: Partial<OrganizationSettings>;
}

/**
 * Create team input
 */
export interface CreateTeamInput {
  name: string;
  description?: string;
  permissions?: Permission[];
  settings?: Team['settings'];
}

/**
 * Update team input
 */
export interface UpdateTeamInput {
  name?: string;
  description?: string;
  permissions?: Permission[];
  settings?: Team['settings'];
}

/**
 * Create invitation input
 */
export interface CreateInvitationInput {
  email: string;
  role: OrganizationRole;
  teamIds?: string[];
  expiresInDays?: number;
}

// ==================== In-Memory Storage (Replace with DB in production) ====================

/**
 * In-memory storage for organizations
 * In production, this should be replaced with a proper database
 */
class OrganizationStore {
  private organizations = new Map<string, Organization>();
  private members = new Map<string, OrganizationMember>(); // memberId -> member
  private membersByOrg = new Map<string, Set<string>>();   // orgId -> Set<memberId>
  private membersByUser = new Map<string, Set<string>>();  // userId -> Set<memberId>
  private teams = new Map<string, Team>();
  private teamsByOrg = new Map<string, Set<string>>();     // orgId -> Set<teamId>
  private invitations = new Map<string, Invitation>();
  private invitationsByOrg = new Map<string, Set<string>>(); // orgId -> Set<invitationId>
  private slugIndex = new Map<string, string>();           // slug -> orgId

  // Organization operations
  createOrganization(org: Organization): Organization {
    this.organizations.set(org.id, org);
    this.slugIndex.set(org.slug, org.id);
    this.membersByOrg.set(org.id, new Set());
    this.teamsByOrg.set(org.id, new Set());
    this.invitationsByOrg.set(org.id, new Set());
    return org;
  }

  getOrganization(id: string): Organization | undefined {
    return this.organizations.get(id);
  }

  getOrganizationBySlug(slug: string): Organization | undefined {
    const orgId = this.slugIndex.get(slug);
    return orgId ? this.organizations.get(orgId) : undefined;
  }

  updateOrganization(id: string, updates: Partial<Organization>): Organization | undefined {
    const org = this.organizations.get(id);
    if (!org) return undefined;

    // Handle slug change
    if (updates.slug && updates.slug !== org.slug) {
      this.slugIndex.delete(org.slug);
      this.slugIndex.set(updates.slug, id);
    }

    const updated = { ...org, ...updates, updatedAt: new Date() };
    this.organizations.set(id, updated);
    return updated;
  }

  deleteOrganization(id: string): boolean {
    const org = this.organizations.get(id);
    if (!org) return false;

    // Soft delete
    org.deletedAt = new Date();
    this.organizations.set(id, org);
    this.slugIndex.delete(org.slug);
    return true;
  }

  listOrganizationsByUser(userId: string): Organization[] {
    const memberIds = this.membersByUser.get(userId) || new Set();
    const orgs: Organization[] = [];

    for (const memberId of memberIds) {
      const member = this.members.get(memberId);
      if (member) {
        const org = this.organizations.get(member.orgId);
        if (org && !org.deletedAt) {
          orgs.push(org);
        }
      }
    }

    return orgs;
  }

  // Member operations
  addMember(member: OrganizationMember): OrganizationMember {
    this.members.set(member.id, member);

    // Index by org
    const orgMembers = this.membersByOrg.get(member.orgId) || new Set();
    orgMembers.add(member.id);
    this.membersByOrg.set(member.orgId, orgMembers);

    // Index by user
    const userMembers = this.membersByUser.get(member.userId) || new Set();
    userMembers.add(member.id);
    this.membersByUser.set(member.userId, userMembers);

    return member;
  }

  getMember(id: string): OrganizationMember | undefined {
    return this.members.get(id);
  }

  getMemberByUserAndOrg(userId: string, orgId: string): OrganizationMember | undefined {
    const userMembers = this.membersByUser.get(userId) || new Set();
    for (const memberId of userMembers) {
      const member = this.members.get(memberId);
      if (member && member.orgId === orgId) {
        return member;
      }
    }
    return undefined;
  }

  updateMember(id: string, updates: Partial<OrganizationMember>): OrganizationMember | undefined {
    const member = this.members.get(id);
    if (!member) return undefined;

    const updated = { ...member, ...updates };
    this.members.set(id, updated);
    return updated;
  }

  removeMember(id: string): boolean {
    const member = this.members.get(id);
    if (!member) return false;

    this.members.delete(id);

    // Remove from org index
    const orgMembers = this.membersByOrg.get(member.orgId);
    if (orgMembers) {
      orgMembers.delete(id);
    }

    // Remove from user index
    const userMembers = this.membersByUser.get(member.userId);
    if (userMembers) {
      userMembers.delete(id);
    }

    return true;
  }

  listMembersByOrg(orgId: string): OrganizationMember[] {
    const memberIds = this.membersByOrg.get(orgId) || new Set();
    return Array.from(memberIds)
      .map(id => this.members.get(id))
      .filter((m): m is OrganizationMember => m !== undefined);
  }

  getMemberCount(orgId: string): number {
    return this.membersByOrg.get(orgId)?.size || 0;
  }

  // Team operations
  createTeam(team: Team): Team {
    this.teams.set(team.id, team);

    const orgTeams = this.teamsByOrg.get(team.orgId) || new Set();
    orgTeams.add(team.id);
    this.teamsByOrg.set(team.orgId, orgTeams);

    return team;
  }

  getTeam(id: string): Team | undefined {
    return this.teams.get(id);
  }

  updateTeam(id: string, updates: Partial<Team>): Team | undefined {
    const team = this.teams.get(id);
    if (!team) return undefined;

    const updated = { ...team, ...updates, updatedAt: new Date() };
    this.teams.set(id, updated);
    return updated;
  }

  deleteTeam(id: string): boolean {
    const team = this.teams.get(id);
    if (!team) return false;

    this.teams.delete(id);

    const orgTeams = this.teamsByOrg.get(team.orgId);
    if (orgTeams) {
      orgTeams.delete(id);
    }

    // Remove team from all members
    const memberIds = this.membersByOrg.get(team.orgId) || new Set();
    for (const memberId of memberIds) {
      const member = this.members.get(memberId);
      if (member && member.teamIds.includes(id)) {
        member.teamIds = member.teamIds.filter(tid => tid !== id);
        this.members.set(memberId, member);
      }
    }

    return true;
  }

  listTeamsByOrg(orgId: string): Team[] {
    const teamIds = this.teamsByOrg.get(orgId) || new Set();
    return Array.from(teamIds)
      .map(id => this.teams.get(id))
      .filter((t): t is Team => t !== undefined);
  }

  // Invitation operations
  createInvitation(invitation: Invitation): Invitation {
    this.invitations.set(invitation.id, invitation);

    const orgInvitations = this.invitationsByOrg.get(invitation.orgId) || new Set();
    orgInvitations.add(invitation.id);
    this.invitationsByOrg.set(invitation.orgId, orgInvitations);

    return invitation;
  }

  getInvitation(id: string): Invitation | undefined {
    return this.invitations.get(id);
  }

  getInvitationByToken(token: string): Invitation | undefined {
    for (const invitation of this.invitations.values()) {
      if (invitation.token === token) {
        return invitation;
      }
    }
    return undefined;
  }

  updateInvitation(id: string, updates: Partial<Invitation>): Invitation | undefined {
    const invitation = this.invitations.get(id);
    if (!invitation) return undefined;

    const updated = { ...invitation, ...updates };
    this.invitations.set(id, updated);
    return updated;
  }

  listInvitationsByOrg(orgId: string, status?: Invitation['status']): Invitation[] {
    const invitationIds = this.invitationsByOrg.get(orgId) || new Set();
    return Array.from(invitationIds)
      .map(id => this.invitations.get(id))
      .filter((i): i is Invitation => i !== undefined && (!status || i.status === status));
  }

  getPendingInvitationByEmail(orgId: string, email: string): Invitation | undefined {
    const invitations = this.listInvitationsByOrg(orgId, 'pending');
    return invitations.find(i => i.email.toLowerCase() === email.toLowerCase());
  }
}

// Singleton store instance
export const organizationStore = new OrganizationStore();

// ==================== RBAC Permission Checking ====================

/**
 * Check if a role has at least the required role level
 */
export function hasRoleLevel(userRole: OrganizationRole, requiredRole: OrganizationRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if a member has a specific permission
 */
export function hasPermission(member: OrganizationMember, permission: Permission): boolean {
  // Check role-based permissions
  const rolePermissions = ROLE_PERMISSIONS[member.role];
  if (rolePermissions.includes(permission)) {
    return true;
  }

  // Check custom permissions
  if (member.customPermissions?.includes(permission)) {
    return true;
  }

  return false;
}

/**
 * Check if a member has any of the specified permissions
 */
export function hasAnyPermission(member: OrganizationMember, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(member, p));
}

/**
 * Check if a member has all of the specified permissions
 */
export function hasAllPermissions(member: OrganizationMember, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(member, p));
}

/**
 * Get all permissions for a member (role + custom + team)
 */
export function getMemberPermissions(member: OrganizationMember): Permission[] {
  const permissions = new Set<Permission>(ROLE_PERMISSIONS[member.role]);

  // Add custom permissions
  if (member.customPermissions) {
    member.customPermissions.forEach(p => permissions.add(p));
  }

  // Add team permissions
  for (const teamId of member.teamIds) {
    const team = organizationStore.getTeam(teamId);
    if (team) {
      team.permissions.forEach(p => permissions.add(p));
    }
  }

  return Array.from(permissions);
}

/**
 * Permission check result with details
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  missingPermissions?: Permission[];
}

/**
 * Comprehensive permission check
 */
export function checkPermission(
  userId: string,
  orgId: string,
  requiredPermissions: Permission[]
): PermissionCheckResult {
  const member = organizationStore.getMemberByUserAndOrg(userId, orgId);

  if (!member) {
    return {
      allowed: false,
      reason: 'User is not a member of this organization',
    };
  }

  const memberPermissions = getMemberPermissions(member);
  const missingPermissions = requiredPermissions.filter(p => !memberPermissions.includes(p));

  if (missingPermissions.length > 0) {
    return {
      allowed: false,
      reason: 'Insufficient permissions',
      missingPermissions,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can perform action and throw if not
 */
export function requirePermission(
  userId: string,
  orgId: string,
  requiredPermissions: Permission[]
): OrganizationMember {
  const member = organizationStore.getMemberByUserAndOrg(userId, orgId);

  if (!member) {
    throw new AppError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'You are not a member of this organization',
      { details: { orgId } }
    );
  }

  const result = checkPermission(userId, orgId, requiredPermissions);
  if (!result.allowed) {
    throw new AppError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      result.reason || 'Permission denied',
      { details: { orgId, missingPermissions: result.missingPermissions } }
    );
  }

  return member;
}

// ==================== Organization Service ====================

/**
 * Generate URL-friendly slug from name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Ensure slug is unique by appending random suffix if needed
 */
function ensureUniqueSlug(slug: string): string {
  let candidate = slug;
  let attempts = 0;

  while (organizationStore.getOrganizationBySlug(candidate) && attempts < 10) {
    const suffix = crypto.randomBytes(3).toString('hex');
    candidate = `${slug}-${suffix}`;
    attempts++;
  }

  if (attempts >= 10) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Could not generate unique slug',
      { details: { slug } }
    );
  }

  return candidate;
}

/**
 * Validate organization slug format
 */
export function validateSlug(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length < 2) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Slug must contain only lowercase letters, numbers, and hyphens, and not start or end with a hyphen',
      { details: { slug } }
    );
  }

  // Reserved slugs
  const reserved = ['api', 'admin', 'www', 'app', 'dashboard', 'settings', 'help', 'support'];
  if (reserved.includes(slug)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'This slug is reserved',
      { details: { slug } }
    );
  }
}

/**
 * Create a new organization
 */
export function createOrganization(input: CreateOrganizationInput): Organization {
  // Validate name
  if (!input.name || input.name.trim().length < 2) {
    throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, 'name is required', { details: { field: 'name' } });
  }

  if (input.name.length > 100) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'name must be 100 characters or less', { details: { field: 'name' } });
  }

  // Generate or validate slug
  let slug = input.slug || generateSlug(input.name);
  if (input.slug) {
    validateSlug(input.slug);
    if (organizationStore.getOrganizationBySlug(input.slug)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'An organization with this slug already exists',
        { details: { slug: input.slug } }
      );
    }
  } else {
    slug = ensureUniqueSlug(slug);
  }

  const now = new Date();
  const org: Organization = {
    id: uuid(),
    name: input.name.trim(),
    slug,
    ownerId: input.ownerId,
    settings: {
      auditRetentionDays: 90,
      maxProjects: 10,
      maxMembers: 5,
      ...input.settings,
    },
    createdAt: now,
    updatedAt: now,
    subscriptionTier: 'free',
  };

  // Create organization
  organizationStore.createOrganization(org);

  // Add owner as first member
  const ownerMember: OrganizationMember = {
    id: uuid(),
    orgId: org.id,
    userId: input.ownerId,
    email: '', // Will be set from user profile
    role: OrganizationRole.OWNER,
    teamIds: [],
    joinedAt: now,
  };
  organizationStore.addMember(ownerMember);

  return org;
}

/**
 * Get organization by ID
 */
export function getOrganization(orgId: string, userId?: string): Organization {
  const org = organizationStore.getOrganization(orgId);

  if (!org || org.deletedAt) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Organization not found',
      { details: { orgId } }
    );
  }

  // Check access if userId provided
  if (userId) {
    const member = organizationStore.getMemberByUserAndOrg(userId, orgId);
    if (!member) {
      throw new AppError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        'You do not have access to this organization',
        { details: { orgId } }
      );
    }
  }

  return org;
}

/**
 * Get organization by slug
 */
export function getOrganizationBySlug(slug: string, userId?: string): Organization {
  const org = organizationStore.getOrganizationBySlug(slug);

  if (!org || org.deletedAt) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Organization not found',
      { details: { slug } }
    );
  }

  if (userId) {
    const member = organizationStore.getMemberByUserAndOrg(userId, org.id);
    if (!member) {
      throw new AppError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        'You do not have access to this organization',
        { details: { slug } }
      );
    }
  }

  return org;
}

/**
 * Update organization
 */
export function updateOrganization(
  orgId: string,
  userId: string,
  input: UpdateOrganizationInput
): Organization {
  // Check permission
  requirePermission(userId, orgId, [Permission.ORG_UPDATE]);

  const org = getOrganization(orgId);

  // Validate slug if changing
  if (input.slug && input.slug !== org.slug) {
    validateSlug(input.slug);
    if (organizationStore.getOrganizationBySlug(input.slug)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'An organization with this slug already exists',
        { details: { slug: input.slug } }
      );
    }
  }

  // Merge settings
  const updatedSettings = input.settings
    ? { ...org.settings, ...input.settings }
    : org.settings;

  const updated = organizationStore.updateOrganization(orgId, {
    name: input.name?.trim() || org.name,
    slug: input.slug || org.slug,
    settings: updatedSettings,
  });

  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to update organization');
  }

  return updated;
}

/**
 * Delete organization (soft delete)
 */
export function deleteOrganization(orgId: string, userId: string): void {
  // Only owner can delete
  const member = requirePermission(userId, orgId, [Permission.ORG_DELETE]);

  if (member.role !== OrganizationRole.OWNER) {
    throw new AppError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'Only the organization owner can delete the organization',
      { details: { orgId } }
    );
  }

  const org = getOrganization(orgId);

  // Check if this is the user's last organization
  const userOrgs = listUserOrganizations(userId);
  if (userOrgs.length <= 1) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Cannot delete your only organization',
      { details: { orgId } }
    );
  }

  organizationStore.deleteOrganization(orgId);
}

/**
 * List organizations for a user
 */
export function listUserOrganizations(userId: string): Organization[] {
  return organizationStore.listOrganizationsByUser(userId);
}

/**
 * Transfer organization ownership
 */
export function transferOwnership(
  orgId: string,
  currentOwnerId: string,
  newOwnerId: string
): void {
  // Verify current owner
  const currentMember = organizationStore.getMemberByUserAndOrg(currentOwnerId, orgId);
  if (!currentMember || currentMember.role !== OrganizationRole.OWNER) {
    throw new AppError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'Only the current owner can transfer ownership',
      { details: { orgId } }
    );
  }

  // Verify new owner is a member
  const newOwnerMember = organizationStore.getMemberByUserAndOrg(newOwnerId, orgId);
  if (!newOwnerMember) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'New owner must be a member of the organization',
      { details: { orgId, newOwnerId } }
    );
  }

  // Update roles
  organizationStore.updateMember(currentMember.id, { role: OrganizationRole.ADMIN });
  organizationStore.updateMember(newOwnerMember.id, { role: OrganizationRole.OWNER });
  organizationStore.updateOrganization(orgId, { ownerId: newOwnerId });
}

// ==================== Team Service ====================

/**
 * Create a new team
 */
export function createTeam(
  orgId: string,
  userId: string,
  input: CreateTeamInput
): Team {
  requirePermission(userId, orgId, [Permission.TEAM_CREATE]);

  // Validate name
  if (!input.name || input.name.trim().length < 2) {
    throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, 'name is required', { details: { field: 'name' } });
  }

  if (input.name.length > 50) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'name must be 50 characters or less', { details: { field: 'name' } });
  }

  // Check for duplicate team name
  const existingTeams = organizationStore.listTeamsByOrg(orgId);
  if (existingTeams.some(t => t.name.toLowerCase() === input.name.toLowerCase())) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'A team with this name already exists',
      { details: { name: input.name } }
    );
  }

  const now = new Date();
  const team: Team = {
    id: uuid(),
    orgId,
    name: input.name.trim(),
    description: input.description?.trim(),
    permissions: input.permissions || [],
    members: [],
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    settings: input.settings,
  };

  return organizationStore.createTeam(team);
}

/**
 * Get team by ID
 */
export function getTeam(teamId: string, userId?: string): Team {
  const team = organizationStore.getTeam(teamId);

  if (!team) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Team not found',
      { details: { teamId } }
    );
  }

  if (userId) {
    requirePermission(userId, team.orgId, [Permission.TEAM_VIEW]);
  }

  return team;
}

/**
 * Update team
 */
export function updateTeam(
  teamId: string,
  userId: string,
  input: UpdateTeamInput
): Team {
  const team = getTeam(teamId);
  requirePermission(userId, team.orgId, [Permission.TEAM_UPDATE]);

  // Check for duplicate team name if changing
  if (input.name && input.name.toLowerCase() !== team.name.toLowerCase()) {
    const existingTeams = organizationStore.listTeamsByOrg(team.orgId);
    if (existingTeams.some(t => t.name.toLowerCase() === input.name!.toLowerCase())) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'A team with this name already exists',
        { details: { name: input.name } }
      );
    }
  }

  const updated = organizationStore.updateTeam(teamId, {
    name: input.name?.trim() || team.name,
    description: input.description?.trim() ?? team.description,
    permissions: input.permissions ?? team.permissions,
    settings: input.settings ? { ...team.settings, ...input.settings } : team.settings,
  });

  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to update team');
  }

  return updated;
}

/**
 * Delete team
 */
export function deleteTeam(teamId: string, userId: string): void {
  const team = getTeam(teamId);
  requirePermission(userId, team.orgId, [Permission.TEAM_DELETE]);

  organizationStore.deleteTeam(teamId);
}

/**
 * List teams in organization
 */
export function listTeams(orgId: string, userId: string): Team[] {
  requirePermission(userId, orgId, [Permission.TEAM_VIEW]);
  return organizationStore.listTeamsByOrg(orgId);
}

/**
 * Add member to team
 */
export function addTeamMember(
  teamId: string,
  userId: string,
  targetUserId: string,
  role: 'lead' | 'member' = 'member'
): Team {
  const team = getTeam(teamId);
  requirePermission(userId, team.orgId, [Permission.TEAM_MANAGE_MEMBERS]);

  // Verify target is org member
  const targetMember = organizationStore.getMemberByUserAndOrg(targetUserId, team.orgId);
  if (!targetMember) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'User must be a member of the organization',
      { details: { userId: targetUserId } }
    );
  }

  // Check if already in team
  if (team.members.some(m => m.userId === targetUserId)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'User is already a member of this team',
      { details: { userId: targetUserId, teamId } }
    );
  }

  // Add to team
  const teamMember: TeamMember = {
    userId: targetUserId,
    email: targetMember.email,
    displayName: targetMember.displayName,
    role,
    addedAt: new Date(),
    addedBy: userId,
  };

  team.members.push(teamMember);
  organizationStore.updateTeam(teamId, { members: team.members });

  // Update member's teamIds
  targetMember.teamIds.push(teamId);
  organizationStore.updateMember(targetMember.id, { teamIds: targetMember.teamIds });

  return team;
}

/**
 * Remove member from team
 */
export function removeTeamMember(
  teamId: string,
  userId: string,
  targetUserId: string
): Team {
  const team = getTeam(teamId);
  requirePermission(userId, team.orgId, [Permission.TEAM_MANAGE_MEMBERS]);

  // Find and remove member
  const memberIndex = team.members.findIndex(m => m.userId === targetUserId);
  if (memberIndex === -1) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'User is not a member of this team',
      { details: { userId: targetUserId, teamId } }
    );
  }

  team.members.splice(memberIndex, 1);
  organizationStore.updateTeam(teamId, { members: team.members });

  // Update member's teamIds
  const targetMember = organizationStore.getMemberByUserAndOrg(targetUserId, team.orgId);
  if (targetMember) {
    targetMember.teamIds = targetMember.teamIds.filter(id => id !== teamId);
    organizationStore.updateMember(targetMember.id, { teamIds: targetMember.teamIds });
  }

  return team;
}

// ==================== Member Management ====================

/**
 * List organization members
 */
export function listMembers(orgId: string, userId: string): OrganizationMember[] {
  requirePermission(userId, orgId, [Permission.MEMBER_VIEW]);
  return organizationStore.listMembersByOrg(orgId);
}

/**
 * Get member details
 */
export function getMember(orgId: string, userId: string, targetUserId: string): OrganizationMember {
  requirePermission(userId, orgId, [Permission.MEMBER_VIEW]);

  const member = organizationStore.getMemberByUserAndOrg(targetUserId, orgId);
  if (!member) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Member not found',
      { details: { userId: targetUserId, orgId } }
    );
  }

  return member;
}

/**
 * Update member role
 */
export function updateMemberRole(
  orgId: string,
  userId: string,
  targetUserId: string,
  newRole: OrganizationRole
): OrganizationMember {
  requirePermission(userId, orgId, [Permission.MEMBER_UPDATE_ROLE]);

  const actor = organizationStore.getMemberByUserAndOrg(userId, orgId)!;
  const target = organizationStore.getMemberByUserAndOrg(targetUserId, orgId);

  if (!target) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Member not found',
      { details: { userId: targetUserId, orgId } }
    );
  }

  // Cannot change own role
  if (userId === targetUserId) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Cannot change your own role',
      { details: { userId } }
    );
  }

  // Cannot promote to or demote from owner (use transfer)
  if (newRole === OrganizationRole.OWNER || target.role === OrganizationRole.OWNER) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Use transfer ownership to change owner',
      { details: { orgId } }
    );
  }

  // Can only change roles of members with lower permissions
  if (ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[actor.role]) {
    throw new AppError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'Cannot change role of member with equal or higher permissions',
      { details: { targetRole: target.role, actorRole: actor.role } }
    );
  }

  // Cannot promote to role higher than own
  if (ROLE_HIERARCHY[newRole] >= ROLE_HIERARCHY[actor.role]) {
    throw new AppError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'Cannot promote to role equal to or higher than your own',
      { details: { newRole, actorRole: actor.role } }
    );
  }

  const updated = organizationStore.updateMember(target.id, { role: newRole });
  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to update member role');
  }

  return updated;
}

/**
 * Remove member from organization
 */
export function removeMember(
  orgId: string,
  userId: string,
  targetUserId: string
): void {
  requirePermission(userId, orgId, [Permission.MEMBER_REMOVE]);

  const actor = organizationStore.getMemberByUserAndOrg(userId, orgId)!;
  const target = organizationStore.getMemberByUserAndOrg(targetUserId, orgId);

  if (!target) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Member not found',
      { details: { userId: targetUserId, orgId } }
    );
  }

  // Cannot remove yourself (use leave)
  if (userId === targetUserId) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Cannot remove yourself. Use leave organization instead.',
      { details: { userId } }
    );
  }

  // Cannot remove owner
  if (target.role === OrganizationRole.OWNER) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Cannot remove the organization owner',
      { details: { orgId } }
    );
  }

  // Can only remove members with lower permissions
  if (ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[actor.role]) {
    throw new AppError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'Cannot remove member with equal or higher permissions',
      { details: { targetRole: target.role, actorRole: actor.role } }
    );
  }

  organizationStore.removeMember(target.id);
}

/**
 * Leave organization
 */
export function leaveOrganization(orgId: string, userId: string): void {
  const member = organizationStore.getMemberByUserAndOrg(userId, orgId);

  if (!member) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'You are not a member of this organization',
      { details: { orgId } }
    );
  }

  // Owner cannot leave without transferring ownership
  if (member.role === OrganizationRole.OWNER) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Owner cannot leave. Transfer ownership first.',
      { details: { orgId } }
    );
  }

  organizationStore.removeMember(member.id);
}

// ==================== Invitation System ====================

/**
 * Generate secure invitation token
 */
function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create an invitation
 */
export function createInvitation(
  orgId: string,
  userId: string,
  input: CreateInvitationInput
): Invitation {
  requirePermission(userId, orgId, [Permission.MEMBER_INVITE]);

  const org = getOrganization(orgId);
  const actor = organizationStore.getMemberByUserAndOrg(userId, orgId)!;

  // Validate email
  const email = input.email.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Invalid email format', { details: { field: 'email' } });
  }

  // Check domain restrictions
  if (org.settings.allowedDomains && org.settings.allowedDomains.length > 0) {
    const domain = email.split('@')[1];
    if (!org.settings.allowedDomains.includes(domain)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Email domain not allowed for this organization',
        { details: { domain, allowedDomains: org.settings.allowedDomains } }
      );
    }
  }

  // Check if already a member
  const existingMembers = organizationStore.listMembersByOrg(orgId);
  if (existingMembers.some(m => m.email.toLowerCase() === email)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'User is already a member of this organization',
      { details: { email } }
    );
  }

  // Check for existing pending invitation
  const existingInvite = organizationStore.getPendingInvitationByEmail(orgId, email);
  if (existingInvite) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'An invitation is already pending for this email',
      { details: { email, invitationId: existingInvite.id } }
    );
  }

  // Check member limits
  const memberCount = organizationStore.getMemberCount(orgId);
  const maxMembers = org.settings.maxMembers || 5;
  if (memberCount >= maxMembers) {
    throw new AppError(
      ErrorCode.QUOTA_EXCEEDED,
      `Organization has reached the maximum number of members (${maxMembers})`,
      { details: { current: memberCount, max: maxMembers } }
    );
  }

  // Cannot invite with role higher than own
  if (ROLE_HIERARCHY[input.role] >= ROLE_HIERARCHY[actor.role]) {
    throw new AppError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'Cannot invite with role equal to or higher than your own',
      { details: { requestedRole: input.role, actorRole: actor.role } }
    );
  }

  // Validate teams exist
  if (input.teamIds) {
    for (const teamId of input.teamIds) {
      const team = organizationStore.getTeam(teamId);
      if (!team || team.orgId !== orgId) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Invalid team ID',
          { details: { teamId } }
        );
      }
    }
  }

  const expiresInDays = input.expiresInDays || 7;
  const now = new Date();

  const invitation: Invitation = {
    id: uuid(),
    orgId,
    email,
    role: input.role,
    teamIds: input.teamIds,
    token: generateInvitationToken(),
    expiresAt: new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000),
    createdAt: now,
    createdBy: userId,
    status: 'pending',
  };

  return organizationStore.createInvitation(invitation);
}

/**
 * Accept an invitation
 */
export function acceptInvitation(
  token: string,
  userId: string,
  userEmail: string,
  displayName?: string
): OrganizationMember {
  const invitation = organizationStore.getInvitationByToken(token);

  if (!invitation) {
    throw new AppError(
      ErrorCode.AUTH_INVALID_TOKEN,
      'Invalid invitation token',
      { details: { token: token.substring(0, 8) + '...' } }
    );
  }

  // Check status
  if (invitation.status !== 'pending') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invitation is ${invitation.status}`,
      { details: { status: invitation.status } }
    );
  }

  // Check expiry
  if (new Date() > invitation.expiresAt) {
    organizationStore.updateInvitation(invitation.id, { status: 'expired' });
    throw new AppError(
      ErrorCode.AUTH_TOKEN_EXPIRED,
      'Invitation has expired',
      { details: { expiresAt: invitation.expiresAt.toISOString() } }
    );
  }

  // Verify email matches (case insensitive)
  if (userEmail.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Email does not match invitation',
      { details: { expected: invitation.email } }
    );
  }

  // Check if already a member
  const existingMember = organizationStore.getMemberByUserAndOrg(userId, invitation.orgId);
  if (existingMember) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'You are already a member of this organization',
      { details: { orgId: invitation.orgId } }
    );
  }

  // Create member
  const now = new Date();
  const member: OrganizationMember = {
    id: uuid(),
    orgId: invitation.orgId,
    userId,
    email: invitation.email,
    displayName,
    role: invitation.role,
    teamIds: invitation.teamIds || [],
    joinedAt: now,
    invitedBy: invitation.createdBy,
  };

  organizationStore.addMember(member);

  // Update invitation
  organizationStore.updateInvitation(invitation.id, {
    status: 'accepted',
    acceptedAt: now,
    acceptedBy: userId,
  });

  // Add to teams
  if (invitation.teamIds) {
    for (const teamId of invitation.teamIds) {
      const team = organizationStore.getTeam(teamId);
      if (team) {
        const teamMember: TeamMember = {
          userId,
          email: member.email,
          displayName: member.displayName,
          role: 'member',
          addedAt: now,
          addedBy: invitation.createdBy,
        };
        team.members.push(teamMember);
        organizationStore.updateTeam(teamId, { members: team.members });
      }
    }
  }

  return member;
}

/**
 * Revoke an invitation
 */
export function revokeInvitation(
  orgId: string,
  userId: string,
  invitationId: string
): void {
  requirePermission(userId, orgId, [Permission.MEMBER_INVITE]);

  const invitation = organizationStore.getInvitation(invitationId);

  if (!invitation || invitation.orgId !== orgId) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Invitation not found',
      { details: { invitationId } }
    );
  }

  if (invitation.status !== 'pending') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Cannot revoke ${invitation.status} invitation`,
      { details: { status: invitation.status } }
    );
  }

  organizationStore.updateInvitation(invitationId, { status: 'revoked' });
}

/**
 * List invitations for organization
 */
export function listInvitations(
  orgId: string,
  userId: string,
  status?: Invitation['status']
): Invitation[] {
  requirePermission(userId, orgId, [Permission.MEMBER_VIEW]);
  return organizationStore.listInvitationsByOrg(orgId, status);
}

/**
 * Resend invitation (create new token)
 */
export function resendInvitation(
  orgId: string,
  userId: string,
  invitationId: string
): Invitation {
  requirePermission(userId, orgId, [Permission.MEMBER_INVITE]);

  const invitation = organizationStore.getInvitation(invitationId);

  if (!invitation || invitation.orgId !== orgId) {
    throw new AppError(
      ErrorCode.CONTAINER_NOT_FOUND,
      'Invitation not found',
      { details: { invitationId } }
    );
  }

  if (invitation.status !== 'pending' && invitation.status !== 'expired') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Cannot resend ${invitation.status} invitation`,
      { details: { status: invitation.status } }
    );
  }

  // Generate new token and extend expiry
  const updated = organizationStore.updateInvitation(invitationId, {
    token: generateInvitationToken(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'pending',
  });

  if (!updated) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to resend invitation');
  }

  return updated;
}

// ==================== Helper Exports ====================

// organizationStore, generateSlug, and validateSlug are already exported above
