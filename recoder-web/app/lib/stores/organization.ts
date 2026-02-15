/**
 * Organization Store
 * Manages enterprise organization state including teams, members, invitations, and audit logs.
 * Uses nanostores for reactive state management.
 */

import { atom, map, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('OrganizationStore');

// ============================================================================
// API Response Types (for type-safe JSON parsing)
// ============================================================================

interface ApiErrorResponse {
  error?: string;
}

interface ApiResponse<T = unknown> extends ApiErrorResponse {
  [key: string]: T | string | undefined;
}

// ============================================================================
// Types
// ============================================================================

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';
export type TeamRole = 'lead' | 'member' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export type AuditActionType =
  | 'org.created'
  | 'org.updated'
  | 'org.deleted'
  | 'member.invited'
  | 'member.joined'
  | 'member.removed'
  | 'member.role_changed'
  | 'team.created'
  | 'team.updated'
  | 'team.deleted'
  | 'team.member_added'
  | 'team.member_removed'
  | 'project.created'
  | 'project.transferred'
  | 'project.deleted'
  | 'settings.updated'
  | 'billing.updated'
  | 'api_key.created'
  | 'api_key.revoked';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  website?: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  plan: 'free' | 'team' | 'enterprise';
  settings: OrganizationSettings;
  stats: OrganizationStats;
}

export interface OrganizationSettings {
  allowMemberInvites: boolean;
  requireTwoFactor: boolean;
  defaultMemberRole: OrganizationRole;
  allowedDomains: string[];
  ssoEnabled: boolean;
  ssoProvider?: 'google' | 'okta' | 'azure' | 'custom';
  auditLogRetentionDays: number;
  maxTeams: number;
  maxMembers: number;
  maxProjects: number;
}

export interface OrganizationStats {
  memberCount: number;
  teamCount: number;
  projectCount: number;
  storageUsedMb: number;
  apiCallsThisMonth: number;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: OrganizationRole;
  joinedAt: string;
  lastActiveAt?: string;
  twoFactorEnabled: boolean;
  teams: string[]; // Team IDs
}

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  memberCount: number;
  projectCount: number;
  isDefault: boolean;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: TeamRole;
  addedAt: string;
  addedBy: string;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  teams: string[];
  status: InvitationStatus;
  invitedBy: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  token: string;
}

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  action: AuditActionType;
  actorId: string;
  actorName: string;
  actorEmail: string;
  targetType: 'organization' | 'member' | 'team' | 'project' | 'settings' | 'billing' | 'api_key';
  targetId?: string;
  targetName?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface OrganizationActivity {
  id: string;
  type: 'member_joined' | 'member_left' | 'team_created' | 'project_created' | 'settings_changed';
  actorName: string;
  actorAvatarUrl?: string;
  description: string;
  timestamp: string;
}

// ============================================================================
// Permission Definitions
// ============================================================================

export const ORGANIZATION_PERMISSIONS = {
  owner: {
    canManageOrg: true,
    canManageBilling: true,
    canDeleteOrg: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canCreateTeams: true,
    canDeleteTeams: true,
    canManageTeams: true,
    canViewAuditLog: true,
    canManageSettings: true,
    canTransferOwnership: true,
    canManageApiKeys: true,
    canCreateProjects: true,
    canDeleteAnyProject: true,
  },
  admin: {
    canManageOrg: true,
    canManageBilling: false,
    canDeleteOrg: false,
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canCreateTeams: true,
    canDeleteTeams: true,
    canManageTeams: true,
    canViewAuditLog: true,
    canManageSettings: true,
    canTransferOwnership: false,
    canManageApiKeys: true,
    canCreateProjects: true,
    canDeleteAnyProject: true,
  },
  member: {
    canManageOrg: false,
    canManageBilling: false,
    canDeleteOrg: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canCreateTeams: false,
    canDeleteTeams: false,
    canManageTeams: false,
    canViewAuditLog: false,
    canManageSettings: false,
    canTransferOwnership: false,
    canManageApiKeys: false,
    canCreateProjects: true,
    canDeleteAnyProject: false,
  },
  viewer: {
    canManageOrg: false,
    canManageBilling: false,
    canDeleteOrg: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canCreateTeams: false,
    canDeleteTeams: false,
    canManageTeams: false,
    canViewAuditLog: false,
    canManageSettings: false,
    canTransferOwnership: false,
    canManageApiKeys: false,
    canCreateProjects: false,
    canDeleteAnyProject: false,
  },
} as const;

export const TEAM_PERMISSIONS = {
  lead: {
    canManageTeam: true,
    canAddMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canDeleteTeam: false,
    canManageProjects: true,
  },
  member: {
    canManageTeam: false,
    canAddMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canDeleteTeam: false,
    canManageProjects: true,
  },
  viewer: {
    canManageTeam: false,
    canAddMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canDeleteTeam: false,
    canManageProjects: false,
  },
} as const;

export type OrganizationPermission = keyof typeof ORGANIZATION_PERMISSIONS.owner;
export type TeamPermission = keyof typeof TEAM_PERMISSIONS.lead;

// ============================================================================
// State Atoms
// ============================================================================

// Current organization
export const currentOrganizationAtom = atom<Organization | null>(null);

// All organizations the user belongs to
export const organizationsAtom = atom<Organization[]>([]);

// Members of the current organization
export const membersAtom = map<Record<string, OrganizationMember>>({});

// Teams in the current organization
export const teamsAtom = map<Record<string, Team>>({});

// Team members indexed by team ID
export const teamMembersAtom = map<Record<string, TeamMember[]>>({});

// Pending invitations
export const invitationsAtom = atom<Invitation[]>([]);

// Audit log entries (paginated)
export const auditLogAtom = atom<AuditLogEntry[]>([]);
export const auditLogCursorAtom = atom<string | null>(null);
export const auditLogHasMoreAtom = atom<boolean>(true);

// Recent activity feed
export const activityFeedAtom = atom<OrganizationActivity[]>([]);

// Loading states
export const organizationLoadingAtom = atom<boolean>(false);
export const membersLoadingAtom = atom<boolean>(false);
export const teamsLoadingAtom = atom<boolean>(false);
export const invitationsLoadingAtom = atom<boolean>(false);
export const auditLogLoadingAtom = atom<boolean>(false);

// Error states
export const organizationErrorAtom = atom<string | null>(null);

// Current user's membership
export const currentMembershipAtom = atom<OrganizationMember | null>(null);

// ============================================================================
// Computed Values
// ============================================================================

export const memberListAtom = computed(membersAtom, (members) => {
  return Object.values(members).sort((a, b) => {
    // Sort by role priority, then by name
    const rolePriority: Record<OrganizationRole, number> = {
      owner: 0,
      admin: 1,
      member: 2,
      viewer: 3,
    };
    const roleCompare = rolePriority[a.role] - rolePriority[b.role];
    if (roleCompare !== 0) return roleCompare;
    return a.name.localeCompare(b.name);
  });
});

export const teamListAtom = computed(teamsAtom, (teams) => {
  return Object.values(teams).sort((a, b) => {
    // Default team first, then alphabetically
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
});

export const pendingInvitationsAtom = computed(invitationsAtom, (invitations) => {
  return invitations.filter((inv) => inv.status === 'pending');
});

export const currentUserPermissionsAtom = computed(currentMembershipAtom, (membership) => {
  if (!membership) return ORGANIZATION_PERMISSIONS.viewer;
  return ORGANIZATION_PERMISSIONS[membership.role];
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Fetch organization details by ID or slug
 */
export async function fetchOrganization(idOrSlug: string): Promise<Organization | null> {
  organizationLoadingAtom.set(true);
  organizationErrorAtom.set(null);

  try {
    const response = await fetch(`/api/organizations/${idOrSlug}`);
    if (!response.ok) {
      if (response.status === 404) {
        organizationErrorAtom.set('Organization not found');
        return null;
      }
      throw new Error('Failed to fetch organization');
    }

    const data = (await response.json()) as { organization: Organization };
    const org = data.organization;
    currentOrganizationAtom.set(org);
    return org;
  } catch (error) {
    organizationErrorAtom.set(error instanceof Error ? error.message : 'Unknown error');
    return null;
  } finally {
    organizationLoadingAtom.set(false);
  }
}

/**
 * Fetch all organizations for the current user
 */
export async function fetchUserOrganizations(): Promise<Organization[]> {
  organizationLoadingAtom.set(true);
  organizationErrorAtom.set(null);

  try {
    const response = await fetch('/api/organizations');
    if (!response.ok) {
      throw new Error('Failed to fetch organizations');
    }

    const data = (await response.json()) as { organizations: Organization[] };
    const orgs = data.organizations;
    organizationsAtom.set(orgs);
    return orgs;
  } catch (error) {
    organizationErrorAtom.set(error instanceof Error ? error.message : 'Unknown error');
    return [];
  } finally {
    organizationLoadingAtom.set(false);
  }
}

/**
 * Create a new organization
 */
export async function createOrganization(params: {
  name: string;
  slug: string;
  description?: string;
}): Promise<Organization | null> {
  organizationLoadingAtom.set(true);
  organizationErrorAtom.set(null);

  try {
    const response = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to create organization');
    }

    const data = (await response.json()) as { organization: Organization };
    const org = data.organization;

    // Update stores
    organizationsAtom.set([...organizationsAtom.get(), org]);
    currentOrganizationAtom.set(org);

    return org;
  } catch (error) {
    organizationErrorAtom.set(error instanceof Error ? error.message : 'Unknown error');
    return null;
  } finally {
    organizationLoadingAtom.set(false);
  }
}

/**
 * Update organization details
 */
export async function updateOrganization(
  orgId: string,
  updates: Partial<Pick<Organization, 'name' | 'description' | 'logoUrl' | 'website'>>
): Promise<boolean> {
  organizationLoadingAtom.set(true);
  organizationErrorAtom.set(null);

  try {
    const response = await fetch(`/api/organizations/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to update organization');
    }

    const data = (await response.json()) as { organization: Organization };
    const org = data.organization;

    // Update stores
    currentOrganizationAtom.set(org);
    organizationsAtom.set(
      organizationsAtom.get().map((o) => (o.id === org.id ? org : o))
    );

    return true;
  } catch (error) {
    organizationErrorAtom.set(error instanceof Error ? error.message : 'Unknown error');
    return false;
  } finally {
    organizationLoadingAtom.set(false);
  }
}

/**
 * Update organization settings
 */
export async function updateOrganizationSettings(
  orgId: string,
  settings: Partial<OrganizationSettings>
): Promise<boolean> {
  organizationLoadingAtom.set(true);
  organizationErrorAtom.set(null);

  try {
    const response = await fetch(`/api/organizations/${orgId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to update settings');
    }

    const data = (await response.json()) as { settings: OrganizationSettings };
    const org = currentOrganizationAtom.get();
    if (org) {
      currentOrganizationAtom.set({ ...org, settings: data.settings });
    }

    return true;
  } catch (error) {
    organizationErrorAtom.set(error instanceof Error ? error.message : 'Unknown error');
    return false;
  } finally {
    organizationLoadingAtom.set(false);
  }
}

/**
 * Delete organization (owner only)
 */
export async function deleteOrganization(orgId: string): Promise<boolean> {
  organizationLoadingAtom.set(true);
  organizationErrorAtom.set(null);

  try {
    const response = await fetch(`/api/organizations/${orgId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to delete organization');
    }

    // Update stores
    organizationsAtom.set(organizationsAtom.get().filter((o) => o.id !== orgId));
    if (currentOrganizationAtom.get()?.id === orgId) {
      currentOrganizationAtom.set(null);
    }

    return true;
  } catch (error) {
    organizationErrorAtom.set(error instanceof Error ? error.message : 'Unknown error');
    return false;
  } finally {
    organizationLoadingAtom.set(false);
  }
}

// ============================================================================
// Member Actions
// ============================================================================

/**
 * Fetch organization members
 */
export async function fetchMembers(orgId: string): Promise<OrganizationMember[]> {
  membersLoadingAtom.set(true);

  try {
    const response = await fetch(`/api/organizations/${orgId}/members`);
    if (!response.ok) {
      throw new Error('Failed to fetch members');
    }

    const data = (await response.json()) as { members: OrganizationMember[] };
    const memberList = data.members;

    // Convert to map
    const memberMap: Record<string, OrganizationMember> = {};
    for (const member of memberList) {
      memberMap[member.id] = member;
    }
    membersAtom.set(memberMap);

    return memberList;
  } catch (error) {
    logger.error('Failed to fetch members:', error);
    return [];
  } finally {
    membersLoadingAtom.set(false);
  }
}

/**
 * Change member role
 */
export async function changeMemberRole(
  orgId: string,
  memberId: string,
  newRole: OrganizationRole
): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/members/${memberId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to change role');
    }

    // Update local state
    const members = membersAtom.get();
    if (members[memberId]) {
      membersAtom.setKey(memberId, { ...members[memberId], role: newRole });
    }

    return true;
  } catch (error) {
    logger.error('Failed to change member role:', error);
    return false;
  }
}

/**
 * Remove member from organization
 */
export async function removeMember(orgId: string, memberId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to remove member');
    }

    // Update local state
    const members = { ...membersAtom.get() };
    delete members[memberId];
    membersAtom.set(members);

    return true;
  } catch (error) {
    logger.error('Failed to remove member:', error);
    return false;
  }
}

// ============================================================================
// Invitation Actions
// ============================================================================

/**
 * Fetch pending invitations
 */
export async function fetchInvitations(orgId: string): Promise<Invitation[]> {
  invitationsLoadingAtom.set(true);

  try {
    const response = await fetch(`/api/organizations/${orgId}/invitations`);
    if (!response.ok) {
      throw new Error('Failed to fetch invitations');
    }

    const data = (await response.json()) as { invitations: Invitation[] };
    const invitations = data.invitations;
    invitationsAtom.set(invitations);

    return invitations;
  } catch (error) {
    logger.error('Failed to fetch invitations:', error);
    return [];
  } finally {
    invitationsLoadingAtom.set(false);
  }
}

/**
 * Send invitation to new member
 */
export async function sendInvitation(
  orgId: string,
  params: {
    email: string;
    role: OrganizationRole;
    teams?: string[];
    message?: string;
  }
): Promise<Invitation | null> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to send invitation');
    }

    const data = (await response.json()) as { invitation: Invitation };
    const invitation = data.invitation;

    // Update local state
    invitationsAtom.set([...invitationsAtom.get(), invitation]);

    return invitation;
  } catch (error) {
    logger.error('Failed to send invitation:', error);
    return null;
  }
}

/**
 * Resend invitation email
 */
export async function resendInvitation(orgId: string, invitationId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/invitations/${invitationId}/resend`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to resend invitation');
    }

    return true;
  } catch (error) {
    logger.error('Failed to resend invitation:', error);
    return false;
  }
}

/**
 * Revoke invitation
 */
export async function revokeInvitation(orgId: string, invitationId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to revoke invitation');
    }

    // Update local state
    invitationsAtom.set(
      invitationsAtom.get().map((inv) =>
        inv.id === invitationId ? { ...inv, status: 'revoked' as const } : inv
      )
    );

    return true;
  } catch (error) {
    logger.error('Failed to revoke invitation:', error);
    return false;
  }
}

// ============================================================================
// Team Actions
// ============================================================================

/**
 * Fetch teams for organization
 */
export async function fetchTeams(orgId: string): Promise<Team[]> {
  teamsLoadingAtom.set(true);

  try {
    const response = await fetch(`/api/organizations/${orgId}/teams`);
    if (!response.ok) {
      throw new Error('Failed to fetch teams');
    }

    const data = (await response.json()) as { teams: Team[] };
    const teamList = data.teams;

    // Convert to map
    const teamMap: Record<string, Team> = {};
    for (const team of teamList) {
      teamMap[team.id] = team;
    }
    teamsAtom.set(teamMap);

    return teamList;
  } catch (error) {
    logger.error('Failed to fetch teams:', error);
    return [];
  } finally {
    teamsLoadingAtom.set(false);
  }
}

/**
 * Create a new team
 */
export async function createTeam(
  orgId: string,
  params: {
    name: string;
    description?: string;
    color?: string;
  }
): Promise<Team | null> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to create team');
    }

    const data = (await response.json()) as { team: Team };
    const team = data.team;

    // Update local state
    teamsAtom.setKey(team.id, team);

    return team;
  } catch (error) {
    logger.error('Failed to create team:', error);
    return null;
  }
}

/**
 * Update team
 */
export async function updateTeam(
  orgId: string,
  teamId: string,
  updates: Partial<Pick<Team, 'name' | 'description' | 'color'>>
): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to update team');
    }

    const data = (await response.json()) as { team: Team };
    const team = data.team;

    // Update local state
    teamsAtom.setKey(teamId, team);

    return true;
  } catch (error) {
    logger.error('Failed to update team:', error);
    return false;
  }
}

/**
 * Delete team
 */
export async function deleteTeam(orgId: string, teamId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/teams/${teamId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to delete team');
    }

    // Update local state
    const teams = { ...teamsAtom.get() };
    delete teams[teamId];
    teamsAtom.set(teams);

    return true;
  } catch (error) {
    logger.error('Failed to delete team:', error);
    return false;
  }
}

/**
 * Fetch team members
 */
export async function fetchTeamMembers(orgId: string, teamId: string): Promise<TeamMember[]> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/teams/${teamId}/members`);
    if (!response.ok) {
      throw new Error('Failed to fetch team members');
    }

    const data = (await response.json()) as { members: TeamMember[] };
    const members = data.members;

    // Update local state
    teamMembersAtom.setKey(teamId, members);

    return members;
  } catch (error) {
    logger.error('Failed to fetch team members:', error);
    return [];
  }
}

/**
 * Add member to team
 */
export async function addTeamMember(
  orgId: string,
  teamId: string,
  params: {
    userId: string;
    role: TeamRole;
  }
): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/teams/${teamId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to add team member');
    }

    // Refresh team members
    await fetchTeamMembers(orgId, teamId);

    return true;
  } catch (error) {
    logger.error('Failed to add team member:', error);
    return false;
  }
}

/**
 * Remove member from team
 */
export async function removeTeamMember(
  orgId: string,
  teamId: string,
  memberId: string
): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to remove team member');
    }

    // Update local state
    const currentMembers = teamMembersAtom.get()[teamId] || [];
    teamMembersAtom.setKey(
      teamId,
      currentMembers.filter((m) => m.id !== memberId)
    );

    return true;
  } catch (error) {
    logger.error('Failed to remove team member:', error);
    return false;
  }
}

/**
 * Change team member role
 */
export async function changeTeamMemberRole(
  orgId: string,
  teamId: string,
  memberId: string,
  newRole: TeamRole
): Promise<boolean> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/teams/${teamId}/members/${memberId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as ApiErrorResponse;
      throw new Error(errorData.error || 'Failed to change team member role');
    }

    // Update local state
    const currentMembers = teamMembersAtom.get()[teamId] || [];
    teamMembersAtom.setKey(
      teamId,
      currentMembers.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );

    return true;
  } catch (error) {
    logger.error('Failed to change team member role:', error);
    return false;
  }
}

// ============================================================================
// Audit Log Actions
// ============================================================================

/**
 * Fetch audit log entries
 */
export async function fetchAuditLog(
  orgId: string,
  params?: {
    cursor?: string;
    limit?: number;
    actionType?: AuditActionType;
    actorId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<AuditLogEntry[]> {
  auditLogLoadingAtom.set(true);

  try {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.actionType) searchParams.set('actionType', params.actionType);
    if (params?.actorId) searchParams.set('actorId', params.actorId);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);

    const response = await fetch(`/api/organizations/${orgId}/audit-log?${searchParams}`);
    if (!response.ok) {
      throw new Error('Failed to fetch audit log');
    }

    const data = (await response.json()) as { entries: AuditLogEntry[]; nextCursor?: string; hasMore?: boolean };
    const entries = data.entries;

    // Update stores
    if (params?.cursor) {
      // Append for pagination
      auditLogAtom.set([...auditLogAtom.get(), ...entries]);
    } else {
      // Replace for new query
      auditLogAtom.set(entries);
    }

    auditLogCursorAtom.set(data.nextCursor || null);
    auditLogHasMoreAtom.set(data.hasMore ?? false);

    return entries;
  } catch (error) {
    logger.error('Failed to fetch audit log:', error);
    return [];
  } finally {
    auditLogLoadingAtom.set(false);
  }
}

/**
 * Export audit log as CSV
 */
export async function exportAuditLog(
  orgId: string,
  params?: {
    startDate?: string;
    endDate?: string;
    actionTypes?: AuditActionType[];
  }
): Promise<Blob | null> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.actionTypes) searchParams.set('actionTypes', params.actionTypes.join(','));
    searchParams.set('format', 'csv');

    const response = await fetch(`/api/organizations/${orgId}/audit-log/export?${searchParams}`);
    if (!response.ok) {
      throw new Error('Failed to export audit log');
    }

    return await response.blob();
  } catch (error) {
    logger.error('Failed to export audit log:', error);
    return null;
  }
}

// ============================================================================
// Activity Feed Actions
// ============================================================================

/**
 * Fetch recent activity
 */
export async function fetchActivityFeed(orgId: string, limit = 20): Promise<OrganizationActivity[]> {
  try {
    const response = await fetch(`/api/organizations/${orgId}/activity?limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch activity');
    }

    const data = (await response.json()) as { activities: OrganizationActivity[] };
    const activities = data.activities;
    activityFeedAtom.set(activities);

    return activities;
  } catch (error) {
    logger.error('Failed to fetch activity feed:', error);
    return [];
  }
}

// ============================================================================
// Store Reset
// ============================================================================

/**
 * Reset all organization state
 */
export function resetOrganizationState(): void {
  currentOrganizationAtom.set(null);
  organizationsAtom.set([]);
  membersAtom.set({});
  teamsAtom.set({});
  teamMembersAtom.set({});
  invitationsAtom.set([]);
  auditLogAtom.set([]);
  auditLogCursorAtom.set(null);
  auditLogHasMoreAtom.set(true);
  activityFeedAtom.set([]);
  currentMembershipAtom.set(null);
  organizationErrorAtom.set(null);
}

/**
 * Set current organization and load related data
 */
export async function setCurrentOrganization(orgId: string): Promise<void> {
  const org = await fetchOrganization(orgId);
  if (org) {
    await Promise.all([
      fetchMembers(orgId),
      fetchTeams(orgId),
      fetchInvitations(orgId),
      fetchActivityFeed(orgId),
    ]);
  }
}
