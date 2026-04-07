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
/**
 * Organization roles with increasing permission levels
 */
export declare enum OrganizationRole {
    VIEWER = "viewer",// Read-only access
    MEMBER = "member",// Basic member access
    ADMIN = "admin",// Admin access (manage teams, members)
    OWNER = "owner"
}
/**
 * Role hierarchy for permission checking
 * Higher number = more permissions
 */
export declare const ROLE_HIERARCHY: Record<OrganizationRole, number>;
/**
 * Permission types for fine-grained access control
 */
export declare enum Permission {
    ORG_VIEW = "org:view",
    ORG_UPDATE = "org:update",
    ORG_DELETE = "org:delete",
    ORG_MANAGE_BILLING = "org:manage_billing",
    TEAM_VIEW = "team:view",
    TEAM_CREATE = "team:create",
    TEAM_UPDATE = "team:update",
    TEAM_DELETE = "team:delete",
    TEAM_MANAGE_MEMBERS = "team:manage_members",
    MEMBER_VIEW = "member:view",
    MEMBER_INVITE = "member:invite",
    MEMBER_REMOVE = "member:remove",
    MEMBER_UPDATE_ROLE = "member:update_role",
    PROJECT_VIEW = "project:view",
    PROJECT_CREATE = "project:create",
    PROJECT_UPDATE = "project:update",
    PROJECT_DELETE = "project:delete",
    PROJECT_DEPLOY = "project:deploy",
    SETTINGS_VIEW = "settings:view",
    SETTINGS_UPDATE = "settings:update",
    AUDIT_VIEW = "audit:view"
}
/**
 * Default permissions for each role
 */
export declare const ROLE_PERMISSIONS: Record<OrganizationRole, Permission[]>;
/**
 * Organization settings
 */
export interface OrganizationSettings {
    allowedDomains?: string[];
    defaultTeamId?: string;
    ssoEnabled?: boolean;
    ssoProvider?: string;
    ssoConfig?: Record<string, unknown>;
    enforceSSO?: boolean;
    auditRetentionDays?: number;
    maxProjects?: number;
    maxMembers?: number;
    features?: {
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
    slug: string;
    ownerId: string;
    settings: OrganizationSettings;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
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
    teamIds: string[];
    customPermissions?: Permission[];
    joinedAt: Date;
    invitedBy?: string;
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
    permissions: Permission[];
    members: TeamMember[];
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
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
    role: 'lead' | 'member';
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
    teamIds?: string[];
    token: string;
    expiresAt: Date;
    createdAt: Date;
    createdBy: string;
    acceptedAt?: Date;
    acceptedBy?: string;
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
/**
 * In-memory storage for organizations
 * In production, this should be replaced with a proper database
 */
declare class OrganizationStore {
    private organizations;
    private members;
    private membersByOrg;
    private membersByUser;
    private teams;
    private teamsByOrg;
    private invitations;
    private invitationsByOrg;
    private slugIndex;
    createOrganization(org: Organization): Organization;
    getOrganization(id: string): Organization | undefined;
    getOrganizationBySlug(slug: string): Organization | undefined;
    updateOrganization(id: string, updates: Partial<Organization>): Organization | undefined;
    deleteOrganization(id: string): boolean;
    listOrganizationsByUser(userId: string): Organization[];
    addMember(member: OrganizationMember): OrganizationMember;
    getMember(id: string): OrganizationMember | undefined;
    getMemberByUserAndOrg(userId: string, orgId: string): OrganizationMember | undefined;
    updateMember(id: string, updates: Partial<OrganizationMember>): OrganizationMember | undefined;
    removeMember(id: string): boolean;
    listMembersByOrg(orgId: string): OrganizationMember[];
    getMemberCount(orgId: string): number;
    createTeam(team: Team): Team;
    getTeam(id: string): Team | undefined;
    updateTeam(id: string, updates: Partial<Team>): Team | undefined;
    deleteTeam(id: string): boolean;
    listTeamsByOrg(orgId: string): Team[];
    createInvitation(invitation: Invitation): Invitation;
    getInvitation(id: string): Invitation | undefined;
    getInvitationByToken(token: string): Invitation | undefined;
    updateInvitation(id: string, updates: Partial<Invitation>): Invitation | undefined;
    listInvitationsByOrg(orgId: string, status?: Invitation['status']): Invitation[];
    getPendingInvitationByEmail(orgId: string, email: string): Invitation | undefined;
}
export declare const organizationStore: OrganizationStore;
/**
 * Check if a role has at least the required role level
 */
export declare function hasRoleLevel(userRole: OrganizationRole, requiredRole: OrganizationRole): boolean;
/**
 * Check if a member has a specific permission
 */
export declare function hasPermission(member: OrganizationMember, permission: Permission): boolean;
/**
 * Check if a member has any of the specified permissions
 */
export declare function hasAnyPermission(member: OrganizationMember, permissions: Permission[]): boolean;
/**
 * Check if a member has all of the specified permissions
 */
export declare function hasAllPermissions(member: OrganizationMember, permissions: Permission[]): boolean;
/**
 * Get all permissions for a member (role + custom + team)
 */
export declare function getMemberPermissions(member: OrganizationMember): Permission[];
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
export declare function checkPermission(userId: string, orgId: string, requiredPermissions: Permission[]): PermissionCheckResult;
/**
 * Check if user can perform action and throw if not
 */
export declare function requirePermission(userId: string, orgId: string, requiredPermissions: Permission[]): OrganizationMember;
/**
 * Generate URL-friendly slug from name
 */
export declare function generateSlug(name: string): string;
/**
 * Validate organization slug format
 */
export declare function validateSlug(slug: string): void;
/**
 * Create a new organization
 */
export declare function createOrganization(input: CreateOrganizationInput): Organization;
/**
 * Get organization by ID
 */
export declare function getOrganization(orgId: string, userId?: string): Organization;
/**
 * Get organization by slug
 */
export declare function getOrganizationBySlug(slug: string, userId?: string): Organization;
/**
 * Update organization
 */
export declare function updateOrganization(orgId: string, userId: string, input: UpdateOrganizationInput): Organization;
/**
 * Delete organization (soft delete)
 */
export declare function deleteOrganization(orgId: string, userId: string): void;
/**
 * List organizations for a user
 */
export declare function listUserOrganizations(userId: string): Organization[];
/**
 * Transfer organization ownership
 */
export declare function transferOwnership(orgId: string, currentOwnerId: string, newOwnerId: string): void;
/**
 * Create a new team
 */
export declare function createTeam(orgId: string, userId: string, input: CreateTeamInput): Team;
/**
 * Get team by ID
 */
export declare function getTeam(teamId: string, userId?: string): Team;
/**
 * Update team
 */
export declare function updateTeam(teamId: string, userId: string, input: UpdateTeamInput): Team;
/**
 * Delete team
 */
export declare function deleteTeam(teamId: string, userId: string): void;
/**
 * List teams in organization
 */
export declare function listTeams(orgId: string, userId: string): Team[];
/**
 * Add member to team
 */
export declare function addTeamMember(teamId: string, userId: string, targetUserId: string, role?: 'lead' | 'member'): Team;
/**
 * Remove member from team
 */
export declare function removeTeamMember(teamId: string, userId: string, targetUserId: string): Team;
/**
 * List organization members
 */
export declare function listMembers(orgId: string, userId: string): OrganizationMember[];
/**
 * Get member details
 */
export declare function getMember(orgId: string, userId: string, targetUserId: string): OrganizationMember;
/**
 * Update member role
 */
export declare function updateMemberRole(orgId: string, userId: string, targetUserId: string, newRole: OrganizationRole): OrganizationMember;
/**
 * Remove member from organization
 */
export declare function removeMember(orgId: string, userId: string, targetUserId: string): void;
/**
 * Leave organization
 */
export declare function leaveOrganization(orgId: string, userId: string): void;
/**
 * Create an invitation
 */
export declare function createInvitation(orgId: string, userId: string, input: CreateInvitationInput): Invitation;
/**
 * Accept an invitation
 */
export declare function acceptInvitation(token: string, userId: string, userEmail: string, displayName?: string): OrganizationMember;
/**
 * Revoke an invitation
 */
export declare function revokeInvitation(orgId: string, userId: string, invitationId: string): void;
/**
 * List invitations for organization
 */
export declare function listInvitations(orgId: string, userId: string, status?: Invitation['status']): Invitation[];
/**
 * Resend invitation (create new token)
 */
export declare function resendInvitation(orgId: string, userId: string, invitationId: string): Invitation;
export {};
