"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationStore = exports.ROLE_PERMISSIONS = exports.Permission = exports.ROLE_HIERARCHY = exports.OrganizationRole = void 0;
exports.hasRoleLevel = hasRoleLevel;
exports.hasPermission = hasPermission;
exports.hasAnyPermission = hasAnyPermission;
exports.hasAllPermissions = hasAllPermissions;
exports.getMemberPermissions = getMemberPermissions;
exports.checkPermission = checkPermission;
exports.requirePermission = requirePermission;
exports.generateSlug = generateSlug;
exports.validateSlug = validateSlug;
exports.createOrganization = createOrganization;
exports.getOrganization = getOrganization;
exports.getOrganizationBySlug = getOrganizationBySlug;
exports.updateOrganization = updateOrganization;
exports.deleteOrganization = deleteOrganization;
exports.listUserOrganizations = listUserOrganizations;
exports.transferOwnership = transferOwnership;
exports.createTeam = createTeam;
exports.getTeam = getTeam;
exports.updateTeam = updateTeam;
exports.deleteTeam = deleteTeam;
exports.listTeams = listTeams;
exports.addTeamMember = addTeamMember;
exports.removeTeamMember = removeTeamMember;
exports.listMembers = listMembers;
exports.getMember = getMember;
exports.updateMemberRole = updateMemberRole;
exports.removeMember = removeMember;
exports.leaveOrganization = leaveOrganization;
exports.createInvitation = createInvitation;
exports.acceptInvitation = acceptInvitation;
exports.revokeInvitation = revokeInvitation;
exports.listInvitations = listInvitations;
exports.resendInvitation = resendInvitation;
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const index_js_1 = require("../errors/index.js");
// ==================== Types & Interfaces ====================
/**
 * Organization roles with increasing permission levels
 */
var OrganizationRole;
(function (OrganizationRole) {
    OrganizationRole["VIEWER"] = "viewer";
    OrganizationRole["MEMBER"] = "member";
    OrganizationRole["ADMIN"] = "admin";
    OrganizationRole["OWNER"] = "owner";
})(OrganizationRole || (exports.OrganizationRole = OrganizationRole = {}));
/**
 * Role hierarchy for permission checking
 * Higher number = more permissions
 */
exports.ROLE_HIERARCHY = {
    [OrganizationRole.VIEWER]: 0,
    [OrganizationRole.MEMBER]: 1,
    [OrganizationRole.ADMIN]: 2,
    [OrganizationRole.OWNER]: 3,
};
/**
 * Permission types for fine-grained access control
 */
var Permission;
(function (Permission) {
    // Organization permissions
    Permission["ORG_VIEW"] = "org:view";
    Permission["ORG_UPDATE"] = "org:update";
    Permission["ORG_DELETE"] = "org:delete";
    Permission["ORG_MANAGE_BILLING"] = "org:manage_billing";
    // Team permissions
    Permission["TEAM_VIEW"] = "team:view";
    Permission["TEAM_CREATE"] = "team:create";
    Permission["TEAM_UPDATE"] = "team:update";
    Permission["TEAM_DELETE"] = "team:delete";
    Permission["TEAM_MANAGE_MEMBERS"] = "team:manage_members";
    // Member permissions
    Permission["MEMBER_VIEW"] = "member:view";
    Permission["MEMBER_INVITE"] = "member:invite";
    Permission["MEMBER_REMOVE"] = "member:remove";
    Permission["MEMBER_UPDATE_ROLE"] = "member:update_role";
    // Project permissions
    Permission["PROJECT_VIEW"] = "project:view";
    Permission["PROJECT_CREATE"] = "project:create";
    Permission["PROJECT_UPDATE"] = "project:update";
    Permission["PROJECT_DELETE"] = "project:delete";
    Permission["PROJECT_DEPLOY"] = "project:deploy";
    // Settings permissions
    Permission["SETTINGS_VIEW"] = "settings:view";
    Permission["SETTINGS_UPDATE"] = "settings:update";
    // Audit permissions
    Permission["AUDIT_VIEW"] = "audit:view";
})(Permission || (exports.Permission = Permission = {}));
/**
 * Default permissions for each role
 */
exports.ROLE_PERMISSIONS = {
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
// ==================== In-Memory Storage (Replace with DB in production) ====================
/**
 * In-memory storage for organizations
 * In production, this should be replaced with a proper database
 */
class OrganizationStore {
    organizations = new Map();
    members = new Map(); // memberId -> member
    membersByOrg = new Map(); // orgId -> Set<memberId>
    membersByUser = new Map(); // userId -> Set<memberId>
    teams = new Map();
    teamsByOrg = new Map(); // orgId -> Set<teamId>
    invitations = new Map();
    invitationsByOrg = new Map(); // orgId -> Set<invitationId>
    slugIndex = new Map(); // slug -> orgId
    // Organization operations
    createOrganization(org) {
        this.organizations.set(org.id, org);
        this.slugIndex.set(org.slug, org.id);
        this.membersByOrg.set(org.id, new Set());
        this.teamsByOrg.set(org.id, new Set());
        this.invitationsByOrg.set(org.id, new Set());
        return org;
    }
    getOrganization(id) {
        return this.organizations.get(id);
    }
    getOrganizationBySlug(slug) {
        const orgId = this.slugIndex.get(slug);
        return orgId ? this.organizations.get(orgId) : undefined;
    }
    updateOrganization(id, updates) {
        const org = this.organizations.get(id);
        if (!org)
            return undefined;
        // Handle slug change
        if (updates.slug && updates.slug !== org.slug) {
            this.slugIndex.delete(org.slug);
            this.slugIndex.set(updates.slug, id);
        }
        const updated = { ...org, ...updates, updatedAt: new Date() };
        this.organizations.set(id, updated);
        return updated;
    }
    deleteOrganization(id) {
        const org = this.organizations.get(id);
        if (!org)
            return false;
        // Soft delete
        org.deletedAt = new Date();
        this.organizations.set(id, org);
        this.slugIndex.delete(org.slug);
        return true;
    }
    listOrganizationsByUser(userId) {
        const memberIds = this.membersByUser.get(userId) || new Set();
        const orgs = [];
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
    addMember(member) {
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
    getMember(id) {
        return this.members.get(id);
    }
    getMemberByUserAndOrg(userId, orgId) {
        const userMembers = this.membersByUser.get(userId) || new Set();
        for (const memberId of userMembers) {
            const member = this.members.get(memberId);
            if (member && member.orgId === orgId) {
                return member;
            }
        }
        return undefined;
    }
    updateMember(id, updates) {
        const member = this.members.get(id);
        if (!member)
            return undefined;
        const updated = { ...member, ...updates };
        this.members.set(id, updated);
        return updated;
    }
    removeMember(id) {
        const member = this.members.get(id);
        if (!member)
            return false;
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
    listMembersByOrg(orgId) {
        const memberIds = this.membersByOrg.get(orgId) || new Set();
        return Array.from(memberIds)
            .map(id => this.members.get(id))
            .filter((m) => m !== undefined);
    }
    getMemberCount(orgId) {
        return this.membersByOrg.get(orgId)?.size || 0;
    }
    // Team operations
    createTeam(team) {
        this.teams.set(team.id, team);
        const orgTeams = this.teamsByOrg.get(team.orgId) || new Set();
        orgTeams.add(team.id);
        this.teamsByOrg.set(team.orgId, orgTeams);
        return team;
    }
    getTeam(id) {
        return this.teams.get(id);
    }
    updateTeam(id, updates) {
        const team = this.teams.get(id);
        if (!team)
            return undefined;
        const updated = { ...team, ...updates, updatedAt: new Date() };
        this.teams.set(id, updated);
        return updated;
    }
    deleteTeam(id) {
        const team = this.teams.get(id);
        if (!team)
            return false;
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
    listTeamsByOrg(orgId) {
        const teamIds = this.teamsByOrg.get(orgId) || new Set();
        return Array.from(teamIds)
            .map(id => this.teams.get(id))
            .filter((t) => t !== undefined);
    }
    // Invitation operations
    createInvitation(invitation) {
        this.invitations.set(invitation.id, invitation);
        const orgInvitations = this.invitationsByOrg.get(invitation.orgId) || new Set();
        orgInvitations.add(invitation.id);
        this.invitationsByOrg.set(invitation.orgId, orgInvitations);
        return invitation;
    }
    getInvitation(id) {
        return this.invitations.get(id);
    }
    getInvitationByToken(token) {
        for (const invitation of this.invitations.values()) {
            if (invitation.token === token) {
                return invitation;
            }
        }
        return undefined;
    }
    updateInvitation(id, updates) {
        const invitation = this.invitations.get(id);
        if (!invitation)
            return undefined;
        const updated = { ...invitation, ...updates };
        this.invitations.set(id, updated);
        return updated;
    }
    listInvitationsByOrg(orgId, status) {
        const invitationIds = this.invitationsByOrg.get(orgId) || new Set();
        return Array.from(invitationIds)
            .map(id => this.invitations.get(id))
            .filter((i) => i !== undefined && (!status || i.status === status));
    }
    getPendingInvitationByEmail(orgId, email) {
        const invitations = this.listInvitationsByOrg(orgId, 'pending');
        return invitations.find(i => i.email.toLowerCase() === email.toLowerCase());
    }
}
// Singleton store instance
exports.organizationStore = new OrganizationStore();
// ==================== RBAC Permission Checking ====================
/**
 * Check if a role has at least the required role level
 */
function hasRoleLevel(userRole, requiredRole) {
    return exports.ROLE_HIERARCHY[userRole] >= exports.ROLE_HIERARCHY[requiredRole];
}
/**
 * Check if a member has a specific permission
 */
function hasPermission(member, permission) {
    // Check role-based permissions
    const rolePermissions = exports.ROLE_PERMISSIONS[member.role];
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
function hasAnyPermission(member, permissions) {
    return permissions.some(p => hasPermission(member, p));
}
/**
 * Check if a member has all of the specified permissions
 */
function hasAllPermissions(member, permissions) {
    return permissions.every(p => hasPermission(member, p));
}
/**
 * Get all permissions for a member (role + custom + team)
 */
function getMemberPermissions(member) {
    const permissions = new Set(exports.ROLE_PERMISSIONS[member.role]);
    // Add custom permissions
    if (member.customPermissions) {
        member.customPermissions.forEach(p => permissions.add(p));
    }
    // Add team permissions
    for (const teamId of member.teamIds) {
        const team = exports.organizationStore.getTeam(teamId);
        if (team) {
            team.permissions.forEach(p => permissions.add(p));
        }
    }
    return Array.from(permissions);
}
/**
 * Comprehensive permission check
 */
function checkPermission(userId, orgId, requiredPermissions) {
    const member = exports.organizationStore.getMemberByUserAndOrg(userId, orgId);
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
function requirePermission(userId, orgId, requiredPermissions) {
    const member = exports.organizationStore.getMemberByUserAndOrg(userId, orgId);
    if (!member) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You are not a member of this organization', { details: { orgId } });
    }
    const result = checkPermission(userId, orgId, requiredPermissions);
    if (!result.allowed) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, result.reason || 'Permission denied', { details: { orgId, missingPermissions: result.missingPermissions } });
    }
    return member;
}
// ==================== Organization Service ====================
/**
 * Generate URL-friendly slug from name
 */
function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}
/**
 * Ensure slug is unique by appending random suffix if needed
 */
function ensureUniqueSlug(slug) {
    let candidate = slug;
    let attempts = 0;
    while (exports.organizationStore.getOrganizationBySlug(candidate) && attempts < 10) {
        const suffix = crypto_1.default.randomBytes(3).toString('hex');
        candidate = `${slug}-${suffix}`;
        attempts++;
    }
    if (attempts >= 10) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Could not generate unique slug', { details: { slug } });
    }
    return candidate;
}
/**
 * Validate organization slug format
 */
function validateSlug(slug) {
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length < 2) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Slug must contain only lowercase letters, numbers, and hyphens, and not start or end with a hyphen', { details: { slug } });
    }
    // Reserved slugs
    const reserved = ['api', 'admin', 'www', 'app', 'dashboard', 'settings', 'help', 'support'];
    if (reserved.includes(slug)) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'This slug is reserved', { details: { slug } });
    }
}
/**
 * Create a new organization
 */
function createOrganization(input) {
    // Validate name
    if (!input.name || input.name.trim().length < 2) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.MISSING_REQUIRED_FIELD, 'name is required', { details: { field: 'name' } });
    }
    if (input.name.length > 100) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INVALID_INPUT, 'name must be 100 characters or less', { details: { field: 'name' } });
    }
    // Generate or validate slug
    let slug = input.slug || generateSlug(input.name);
    if (input.slug) {
        validateSlug(input.slug);
        if (exports.organizationStore.getOrganizationBySlug(input.slug)) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'An organization with this slug already exists', { details: { slug: input.slug } });
        }
    }
    else {
        slug = ensureUniqueSlug(slug);
    }
    const now = new Date();
    const org = {
        id: (0, uuid_1.v4)(),
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
    exports.organizationStore.createOrganization(org);
    // Add owner as first member
    const ownerMember = {
        id: (0, uuid_1.v4)(),
        orgId: org.id,
        userId: input.ownerId,
        email: '', // Will be set from user profile
        role: OrganizationRole.OWNER,
        teamIds: [],
        joinedAt: now,
    };
    exports.organizationStore.addMember(ownerMember);
    return org;
}
/**
 * Get organization by ID
 */
function getOrganization(orgId, userId) {
    const org = exports.organizationStore.getOrganization(orgId);
    if (!org || org.deletedAt) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Organization not found', { details: { orgId } });
    }
    // Check access if userId provided
    if (userId) {
        const member = exports.organizationStore.getMemberByUserAndOrg(userId, orgId);
        if (!member) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this organization', { details: { orgId } });
        }
    }
    return org;
}
/**
 * Get organization by slug
 */
function getOrganizationBySlug(slug, userId) {
    const org = exports.organizationStore.getOrganizationBySlug(slug);
    if (!org || org.deletedAt) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Organization not found', { details: { slug } });
    }
    if (userId) {
        const member = exports.organizationStore.getMemberByUserAndOrg(userId, org.id);
        if (!member) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'You do not have access to this organization', { details: { slug } });
        }
    }
    return org;
}
/**
 * Update organization
 */
function updateOrganization(orgId, userId, input) {
    // Check permission
    requirePermission(userId, orgId, [Permission.ORG_UPDATE]);
    const org = getOrganization(orgId);
    // Validate slug if changing
    if (input.slug && input.slug !== org.slug) {
        validateSlug(input.slug);
        if (exports.organizationStore.getOrganizationBySlug(input.slug)) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'An organization with this slug already exists', { details: { slug: input.slug } });
        }
    }
    // Merge settings
    const updatedSettings = input.settings
        ? { ...org.settings, ...input.settings }
        : org.settings;
    const updated = exports.organizationStore.updateOrganization(orgId, {
        name: input.name?.trim() || org.name,
        slug: input.slug || org.slug,
        settings: updatedSettings,
    });
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to update organization');
    }
    return updated;
}
/**
 * Delete organization (soft delete)
 */
function deleteOrganization(orgId, userId) {
    // Only owner can delete
    const member = requirePermission(userId, orgId, [Permission.ORG_DELETE]);
    if (member.role !== OrganizationRole.OWNER) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Only the organization owner can delete the organization', { details: { orgId } });
    }
    const org = getOrganization(orgId);
    // Check if this is the user's last organization
    const userOrgs = listUserOrganizations(userId);
    if (userOrgs.length <= 1) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Cannot delete your only organization', { details: { orgId } });
    }
    exports.organizationStore.deleteOrganization(orgId);
}
/**
 * List organizations for a user
 */
function listUserOrganizations(userId) {
    return exports.organizationStore.listOrganizationsByUser(userId);
}
/**
 * Transfer organization ownership
 */
function transferOwnership(orgId, currentOwnerId, newOwnerId) {
    // Verify current owner
    const currentMember = exports.organizationStore.getMemberByUserAndOrg(currentOwnerId, orgId);
    if (!currentMember || currentMember.role !== OrganizationRole.OWNER) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Only the current owner can transfer ownership', { details: { orgId } });
    }
    // Verify new owner is a member
    const newOwnerMember = exports.organizationStore.getMemberByUserAndOrg(newOwnerId, orgId);
    if (!newOwnerMember) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'New owner must be a member of the organization', { details: { orgId, newOwnerId } });
    }
    // Update roles
    exports.organizationStore.updateMember(currentMember.id, { role: OrganizationRole.ADMIN });
    exports.organizationStore.updateMember(newOwnerMember.id, { role: OrganizationRole.OWNER });
    exports.organizationStore.updateOrganization(orgId, { ownerId: newOwnerId });
}
// ==================== Team Service ====================
/**
 * Create a new team
 */
function createTeam(orgId, userId, input) {
    requirePermission(userId, orgId, [Permission.TEAM_CREATE]);
    // Validate name
    if (!input.name || input.name.trim().length < 2) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.MISSING_REQUIRED_FIELD, 'name is required', { details: { field: 'name' } });
    }
    if (input.name.length > 50) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INVALID_INPUT, 'name must be 50 characters or less', { details: { field: 'name' } });
    }
    // Check for duplicate team name
    const existingTeams = exports.organizationStore.listTeamsByOrg(orgId);
    if (existingTeams.some(t => t.name.toLowerCase() === input.name.toLowerCase())) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'A team with this name already exists', { details: { name: input.name } });
    }
    const now = new Date();
    const team = {
        id: (0, uuid_1.v4)(),
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
    return exports.organizationStore.createTeam(team);
}
/**
 * Get team by ID
 */
function getTeam(teamId, userId) {
    const team = exports.organizationStore.getTeam(teamId);
    if (!team) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Team not found', { details: { teamId } });
    }
    if (userId) {
        requirePermission(userId, team.orgId, [Permission.TEAM_VIEW]);
    }
    return team;
}
/**
 * Update team
 */
function updateTeam(teamId, userId, input) {
    const team = getTeam(teamId);
    requirePermission(userId, team.orgId, [Permission.TEAM_UPDATE]);
    // Check for duplicate team name if changing
    if (input.name && input.name.toLowerCase() !== team.name.toLowerCase()) {
        const existingTeams = exports.organizationStore.listTeamsByOrg(team.orgId);
        if (existingTeams.some(t => t.name.toLowerCase() === input.name.toLowerCase())) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'A team with this name already exists', { details: { name: input.name } });
        }
    }
    const updated = exports.organizationStore.updateTeam(teamId, {
        name: input.name?.trim() || team.name,
        description: input.description?.trim() ?? team.description,
        permissions: input.permissions ?? team.permissions,
        settings: input.settings ? { ...team.settings, ...input.settings } : team.settings,
    });
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to update team');
    }
    return updated;
}
/**
 * Delete team
 */
function deleteTeam(teamId, userId) {
    const team = getTeam(teamId);
    requirePermission(userId, team.orgId, [Permission.TEAM_DELETE]);
    exports.organizationStore.deleteTeam(teamId);
}
/**
 * List teams in organization
 */
function listTeams(orgId, userId) {
    requirePermission(userId, orgId, [Permission.TEAM_VIEW]);
    return exports.organizationStore.listTeamsByOrg(orgId);
}
/**
 * Add member to team
 */
function addTeamMember(teamId, userId, targetUserId, role = 'member') {
    const team = getTeam(teamId);
    requirePermission(userId, team.orgId, [Permission.TEAM_MANAGE_MEMBERS]);
    // Verify target is org member
    const targetMember = exports.organizationStore.getMemberByUserAndOrg(targetUserId, team.orgId);
    if (!targetMember) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'User must be a member of the organization', { details: { userId: targetUserId } });
    }
    // Check if already in team
    if (team.members.some(m => m.userId === targetUserId)) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'User is already a member of this team', { details: { userId: targetUserId, teamId } });
    }
    // Add to team
    const teamMember = {
        userId: targetUserId,
        email: targetMember.email,
        displayName: targetMember.displayName,
        role,
        addedAt: new Date(),
        addedBy: userId,
    };
    team.members.push(teamMember);
    exports.organizationStore.updateTeam(teamId, { members: team.members });
    // Update member's teamIds
    targetMember.teamIds.push(teamId);
    exports.organizationStore.updateMember(targetMember.id, { teamIds: targetMember.teamIds });
    return team;
}
/**
 * Remove member from team
 */
function removeTeamMember(teamId, userId, targetUserId) {
    const team = getTeam(teamId);
    requirePermission(userId, team.orgId, [Permission.TEAM_MANAGE_MEMBERS]);
    // Find and remove member
    const memberIndex = team.members.findIndex(m => m.userId === targetUserId);
    if (memberIndex === -1) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'User is not a member of this team', { details: { userId: targetUserId, teamId } });
    }
    team.members.splice(memberIndex, 1);
    exports.organizationStore.updateTeam(teamId, { members: team.members });
    // Update member's teamIds
    const targetMember = exports.organizationStore.getMemberByUserAndOrg(targetUserId, team.orgId);
    if (targetMember) {
        targetMember.teamIds = targetMember.teamIds.filter(id => id !== teamId);
        exports.organizationStore.updateMember(targetMember.id, { teamIds: targetMember.teamIds });
    }
    return team;
}
// ==================== Member Management ====================
/**
 * List organization members
 */
function listMembers(orgId, userId) {
    requirePermission(userId, orgId, [Permission.MEMBER_VIEW]);
    return exports.organizationStore.listMembersByOrg(orgId);
}
/**
 * Get member details
 */
function getMember(orgId, userId, targetUserId) {
    requirePermission(userId, orgId, [Permission.MEMBER_VIEW]);
    const member = exports.organizationStore.getMemberByUserAndOrg(targetUserId, orgId);
    if (!member) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Member not found', { details: { userId: targetUserId, orgId } });
    }
    return member;
}
/**
 * Update member role
 */
function updateMemberRole(orgId, userId, targetUserId, newRole) {
    requirePermission(userId, orgId, [Permission.MEMBER_UPDATE_ROLE]);
    const actor = exports.organizationStore.getMemberByUserAndOrg(userId, orgId);
    const target = exports.organizationStore.getMemberByUserAndOrg(targetUserId, orgId);
    if (!target) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Member not found', { details: { userId: targetUserId, orgId } });
    }
    // Cannot change own role
    if (userId === targetUserId) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Cannot change your own role', { details: { userId } });
    }
    // Cannot promote to or demote from owner (use transfer)
    if (newRole === OrganizationRole.OWNER || target.role === OrganizationRole.OWNER) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Use transfer ownership to change owner', { details: { orgId } });
    }
    // Can only change roles of members with lower permissions
    if (exports.ROLE_HIERARCHY[target.role] >= exports.ROLE_HIERARCHY[actor.role]) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Cannot change role of member with equal or higher permissions', { details: { targetRole: target.role, actorRole: actor.role } });
    }
    // Cannot promote to role higher than own
    if (exports.ROLE_HIERARCHY[newRole] >= exports.ROLE_HIERARCHY[actor.role]) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Cannot promote to role equal to or higher than your own', { details: { newRole, actorRole: actor.role } });
    }
    const updated = exports.organizationStore.updateMember(target.id, { role: newRole });
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to update member role');
    }
    return updated;
}
/**
 * Remove member from organization
 */
function removeMember(orgId, userId, targetUserId) {
    requirePermission(userId, orgId, [Permission.MEMBER_REMOVE]);
    const actor = exports.organizationStore.getMemberByUserAndOrg(userId, orgId);
    const target = exports.organizationStore.getMemberByUserAndOrg(targetUserId, orgId);
    if (!target) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Member not found', { details: { userId: targetUserId, orgId } });
    }
    // Cannot remove yourself (use leave)
    if (userId === targetUserId) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Cannot remove yourself. Use leave organization instead.', { details: { userId } });
    }
    // Cannot remove owner
    if (target.role === OrganizationRole.OWNER) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Cannot remove the organization owner', { details: { orgId } });
    }
    // Can only remove members with lower permissions
    if (exports.ROLE_HIERARCHY[target.role] >= exports.ROLE_HIERARCHY[actor.role]) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Cannot remove member with equal or higher permissions', { details: { targetRole: target.role, actorRole: actor.role } });
    }
    exports.organizationStore.removeMember(target.id);
}
/**
 * Leave organization
 */
function leaveOrganization(orgId, userId) {
    const member = exports.organizationStore.getMemberByUserAndOrg(userId, orgId);
    if (!member) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'You are not a member of this organization', { details: { orgId } });
    }
    // Owner cannot leave without transferring ownership
    if (member.role === OrganizationRole.OWNER) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Owner cannot leave. Transfer ownership first.', { details: { orgId } });
    }
    exports.organizationStore.removeMember(member.id);
}
// ==================== Invitation System ====================
/**
 * Generate secure invitation token
 */
function generateInvitationToken() {
    return crypto_1.default.randomBytes(32).toString('hex');
}
/**
 * Create an invitation
 */
function createInvitation(orgId, userId, input) {
    requirePermission(userId, orgId, [Permission.MEMBER_INVITE]);
    const org = getOrganization(orgId);
    const actor = exports.organizationStore.getMemberByUserAndOrg(userId, orgId);
    // Validate email
    const email = input.email.toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INVALID_INPUT, 'Invalid email format', { details: { field: 'email' } });
    }
    // Check domain restrictions
    if (org.settings.allowedDomains && org.settings.allowedDomains.length > 0) {
        const domain = email.split('@')[1];
        if (!org.settings.allowedDomains.includes(domain)) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Email domain not allowed for this organization', { details: { domain, allowedDomains: org.settings.allowedDomains } });
        }
    }
    // Check if already a member
    const existingMembers = exports.organizationStore.listMembersByOrg(orgId);
    if (existingMembers.some(m => m.email.toLowerCase() === email)) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'User is already a member of this organization', { details: { email } });
    }
    // Check for existing pending invitation
    const existingInvite = exports.organizationStore.getPendingInvitationByEmail(orgId, email);
    if (existingInvite) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'An invitation is already pending for this email', { details: { email, invitationId: existingInvite.id } });
    }
    // Check member limits
    const memberCount = exports.organizationStore.getMemberCount(orgId);
    const maxMembers = org.settings.maxMembers || 5;
    if (memberCount >= maxMembers) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.QUOTA_EXCEEDED, `Organization has reached the maximum number of members (${maxMembers})`, { details: { current: memberCount, max: maxMembers } });
    }
    // Cannot invite with role higher than own
    if (exports.ROLE_HIERARCHY[input.role] >= exports.ROLE_HIERARCHY[actor.role]) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Cannot invite with role equal to or higher than your own', { details: { requestedRole: input.role, actorRole: actor.role } });
    }
    // Validate teams exist
    if (input.teamIds) {
        for (const teamId of input.teamIds) {
            const team = exports.organizationStore.getTeam(teamId);
            if (!team || team.orgId !== orgId) {
                throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Invalid team ID', { details: { teamId } });
            }
        }
    }
    const expiresInDays = input.expiresInDays || 7;
    const now = new Date();
    const invitation = {
        id: (0, uuid_1.v4)(),
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
    return exports.organizationStore.createInvitation(invitation);
}
/**
 * Accept an invitation
 */
function acceptInvitation(token, userId, userEmail, displayName) {
    const invitation = exports.organizationStore.getInvitationByToken(token);
    if (!invitation) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTH_INVALID_TOKEN, 'Invalid invitation token', { details: { token: token.substring(0, 8) + '...' } });
    }
    // Check status
    if (invitation.status !== 'pending') {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, `Invitation is ${invitation.status}`, { details: { status: invitation.status } });
    }
    // Check expiry
    if (new Date() > invitation.expiresAt) {
        exports.organizationStore.updateInvitation(invitation.id, { status: 'expired' });
        throw new index_js_1.AppError(index_js_1.ErrorCode.AUTH_TOKEN_EXPIRED, 'Invitation has expired', { details: { expiresAt: invitation.expiresAt.toISOString() } });
    }
    // Verify email matches (case insensitive)
    if (userEmail.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'Email does not match invitation', { details: { expected: invitation.email } });
    }
    // Check if already a member
    const existingMember = exports.organizationStore.getMemberByUserAndOrg(userId, invitation.orgId);
    if (existingMember) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, 'You are already a member of this organization', { details: { orgId: invitation.orgId } });
    }
    // Create member
    const now = new Date();
    const member = {
        id: (0, uuid_1.v4)(),
        orgId: invitation.orgId,
        userId,
        email: invitation.email,
        displayName,
        role: invitation.role,
        teamIds: invitation.teamIds || [],
        joinedAt: now,
        invitedBy: invitation.createdBy,
    };
    exports.organizationStore.addMember(member);
    // Update invitation
    exports.organizationStore.updateInvitation(invitation.id, {
        status: 'accepted',
        acceptedAt: now,
        acceptedBy: userId,
    });
    // Add to teams
    if (invitation.teamIds) {
        for (const teamId of invitation.teamIds) {
            const team = exports.organizationStore.getTeam(teamId);
            if (team) {
                const teamMember = {
                    userId,
                    email: member.email,
                    displayName: member.displayName,
                    role: 'member',
                    addedAt: now,
                    addedBy: invitation.createdBy,
                };
                team.members.push(teamMember);
                exports.organizationStore.updateTeam(teamId, { members: team.members });
            }
        }
    }
    return member;
}
/**
 * Revoke an invitation
 */
function revokeInvitation(orgId, userId, invitationId) {
    requirePermission(userId, orgId, [Permission.MEMBER_INVITE]);
    const invitation = exports.organizationStore.getInvitation(invitationId);
    if (!invitation || invitation.orgId !== orgId) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Invitation not found', { details: { invitationId } });
    }
    if (invitation.status !== 'pending') {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, `Cannot revoke ${invitation.status} invitation`, { details: { status: invitation.status } });
    }
    exports.organizationStore.updateInvitation(invitationId, { status: 'revoked' });
}
/**
 * List invitations for organization
 */
function listInvitations(orgId, userId, status) {
    requirePermission(userId, orgId, [Permission.MEMBER_VIEW]);
    return exports.organizationStore.listInvitationsByOrg(orgId, status);
}
/**
 * Resend invitation (create new token)
 */
function resendInvitation(orgId, userId, invitationId) {
    requirePermission(userId, orgId, [Permission.MEMBER_INVITE]);
    const invitation = exports.organizationStore.getInvitation(invitationId);
    if (!invitation || invitation.orgId !== orgId) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.CONTAINER_NOT_FOUND, 'Invitation not found', { details: { invitationId } });
    }
    if (invitation.status !== 'pending' && invitation.status !== 'expired') {
        throw new index_js_1.AppError(index_js_1.ErrorCode.VALIDATION_ERROR, `Cannot resend ${invitation.status} invitation`, { details: { status: invitation.status } });
    }
    // Generate new token and extend expiry
    const updated = exports.organizationStore.updateInvitation(invitationId, {
        token: generateInvitationToken(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'pending',
    });
    if (!updated) {
        throw new index_js_1.AppError(index_js_1.ErrorCode.INTERNAL_ERROR, 'Failed to resend invitation');
    }
    return updated;
}
// ==================== Helper Exports ====================
// organizationStore, generateSlug, and validateSlug are already exported above
