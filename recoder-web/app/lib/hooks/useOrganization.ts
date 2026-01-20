/**
 * useOrganization Hook
 * Provides access to organization state and permission checking utilities.
 * Built on top of the organization nanostores.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  // State atoms
  currentOrganizationAtom,
  organizationsAtom,
  membersAtom,
  teamsAtom,
  teamMembersAtom,
  invitationsAtom,
  auditLogAtom,
  auditLogHasMoreAtom,
  activityFeedAtom,
  organizationLoadingAtom,
  membersLoadingAtom,
  teamsLoadingAtom,
  invitationsLoadingAtom,
  auditLogLoadingAtom,
  organizationErrorAtom,
  currentMembershipAtom,
  // Computed atoms
  memberListAtom,
  teamListAtom,
  pendingInvitationsAtom,
  currentUserPermissionsAtom,
  // Actions
  fetchOrganization,
  fetchUserOrganizations,
  createOrganization,
  updateOrganization,
  updateOrganizationSettings,
  deleteOrganization,
  fetchMembers,
  changeMemberRole,
  removeMember,
  fetchInvitations,
  sendInvitation,
  resendInvitation,
  revokeInvitation,
  fetchTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  fetchTeamMembers,
  addTeamMember,
  removeTeamMember,
  changeTeamMemberRole,
  fetchAuditLog,
  exportAuditLog,
  fetchActivityFeed,
  resetOrganizationState,
  setCurrentOrganization,
  // Types
  type Organization,
  type OrganizationMember,
  type OrganizationRole,
  type OrganizationPermission,
  type Team,
  type TeamMember,
  type TeamRole,
  type TeamPermission,
  type Invitation,
  type AuditLogEntry,
  type AuditActionType,
  type OrganizationActivity,
  type OrganizationSettings,
  ORGANIZATION_PERMISSIONS,
  TEAM_PERMISSIONS,
} from '../stores/organization';

export interface UseOrganizationReturn {
  // Current organization
  organization: Organization | null;
  organizations: Organization[];
  membership: OrganizationMember | null;

  // Members
  members: OrganizationMember[];
  membersMap: Record<string, OrganizationMember>;

  // Teams
  teams: Team[];
  teamsMap: Record<string, Team>;
  teamMembers: Record<string, TeamMember[]>;

  // Invitations
  invitations: Invitation[];
  pendingInvitations: Invitation[];

  // Audit log
  auditLog: AuditLogEntry[];
  auditLogHasMore: boolean;

  // Activity
  activities: OrganizationActivity[];

  // Loading states
  loading: {
    organization: boolean;
    members: boolean;
    teams: boolean;
    invitations: boolean;
    auditLog: boolean;
  };

  // Error
  error: string | null;

  // Permissions
  permissions: Record<OrganizationPermission, boolean>;
  hasPermission: (permission: OrganizationPermission) => boolean;
  hasTeamPermission: (teamId: string, permission: TeamPermission) => boolean;
  canManageTeam: (teamId: string) => boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;

  // Organization actions
  loadOrganization: (idOrSlug: string) => Promise<Organization | null>;
  loadUserOrganizations: () => Promise<Organization[]>;
  createOrg: (params: { name: string; slug: string; description?: string }) => Promise<Organization | null>;
  updateOrg: (updates: Partial<Pick<Organization, 'name' | 'description' | 'logoUrl' | 'website'>>) => Promise<boolean>;
  updateSettings: (settings: Partial<OrganizationSettings>) => Promise<boolean>;
  deleteOrg: () => Promise<boolean>;
  switchOrganization: (orgId: string) => Promise<void>;

  // Member actions
  loadMembers: () => Promise<OrganizationMember[]>;
  changeRole: (memberId: string, role: OrganizationRole) => Promise<boolean>;
  removeMemberFromOrg: (memberId: string) => Promise<boolean>;
  getMemberById: (memberId: string) => OrganizationMember | undefined;

  // Invitation actions
  loadInvitations: () => Promise<Invitation[]>;
  invite: (params: { email: string; role: OrganizationRole; teams?: string[]; message?: string }) => Promise<Invitation | null>;
  resend: (invitationId: string) => Promise<boolean>;
  revoke: (invitationId: string) => Promise<boolean>;

  // Team actions
  loadTeams: () => Promise<Team[]>;
  createNewTeam: (params: { name: string; description?: string; color?: string }) => Promise<Team | null>;
  updateExistingTeam: (teamId: string, updates: Partial<Pick<Team, 'name' | 'description' | 'color'>>) => Promise<boolean>;
  deleteExistingTeam: (teamId: string) => Promise<boolean>;
  getTeamById: (teamId: string) => Team | undefined;

  // Team member actions
  loadTeamMembers: (teamId: string) => Promise<TeamMember[]>;
  addMemberToTeam: (teamId: string, userId: string, role: TeamRole) => Promise<boolean>;
  removeMemberFromTeam: (teamId: string, memberId: string) => Promise<boolean>;
  changeTeamRole: (teamId: string, memberId: string, role: TeamRole) => Promise<boolean>;

  // Audit log actions
  loadAuditLog: (params?: {
    cursor?: string;
    limit?: number;
    actionType?: AuditActionType;
    actorId?: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<AuditLogEntry[]>;
  loadMoreAuditLog: () => Promise<AuditLogEntry[]>;
  exportAuditLogCsv: (params?: {
    startDate?: string;
    endDate?: string;
    actionTypes?: AuditActionType[];
  }) => Promise<Blob | null>;

  // Activity actions
  loadActivity: (limit?: number) => Promise<OrganizationActivity[]>;

  // Reset
  reset: () => void;
}

/**
 * Hook for accessing and managing organization state
 */
export function useOrganization(): UseOrganizationReturn {
  // Subscribe to all state atoms
  const organization = useStore(currentOrganizationAtom);
  const organizations = useStore(organizationsAtom);
  const membersMap = useStore(membersAtom);
  const teamsMap = useStore(teamsAtom);
  const teamMembers = useStore(teamMembersAtom);
  const invitations = useStore(invitationsAtom);
  const auditLog = useStore(auditLogAtom);
  const auditLogHasMore = useStore(auditLogHasMoreAtom);
  const activities = useStore(activityFeedAtom);
  const membership = useStore(currentMembershipAtom);
  const error = useStore(organizationErrorAtom);

  // Loading states
  const organizationLoading = useStore(organizationLoadingAtom);
  const membersLoading = useStore(membersLoadingAtom);
  const teamsLoading = useStore(teamsLoadingAtom);
  const invitationsLoading = useStore(invitationsLoadingAtom);
  const auditLogLoading = useStore(auditLogLoadingAtom);

  // Computed values
  const members = useStore(memberListAtom);
  const teams = useStore(teamListAtom);
  const pendingInvitations = useStore(pendingInvitationsAtom);
  const permissions = useStore(currentUserPermissionsAtom);

  // Combined loading state
  const loading = useMemo(() => ({
    organization: organizationLoading,
    members: membersLoading,
    teams: teamsLoading,
    invitations: invitationsLoading,
    auditLog: auditLogLoading,
  }), [organizationLoading, membersLoading, teamsLoading, invitationsLoading, auditLogLoading]);

  // Permission checking
  const hasPermission = useCallback((permission: OrganizationPermission): boolean => {
    return permissions[permission] === true;
  }, [permissions]);

  const hasTeamPermission = useCallback((teamId: string, permission: TeamPermission): boolean => {
    // Org admins/owners have all team permissions
    if (hasPermission('canManageTeams')) {
      return true;
    }

    // Check team-specific role
    const teamMemberList = teamMembers[teamId] || [];
    const currentUserTeamMember = teamMemberList.find(
      (m) => m.userId === membership?.userId
    );

    if (!currentUserTeamMember) {
      return false;
    }

    return TEAM_PERMISSIONS[currentUserTeamMember.role][permission] === true;
  }, [hasPermission, teamMembers, membership]);

  const canManageTeam = useCallback((teamId: string): boolean => {
    return hasTeamPermission(teamId, 'canManageTeam');
  }, [hasTeamPermission]);

  // Role checks
  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'admin' || isOwner;
  const isMember = membership != null;

  // Organization actions
  const loadOrganization = useCallback(async (idOrSlug: string) => {
    return fetchOrganization(idOrSlug);
  }, []);

  const loadUserOrganizations = useCallback(async () => {
    return fetchUserOrganizations();
  }, []);

  const createOrg = useCallback(async (params: { name: string; slug: string; description?: string }) => {
    return createOrganization(params);
  }, []);

  const updateOrg = useCallback(async (
    updates: Partial<Pick<Organization, 'name' | 'description' | 'logoUrl' | 'website'>>
  ) => {
    if (!organization) return false;
    return updateOrganization(organization.id, updates);
  }, [organization]);

  const updateSettings = useCallback(async (settings: Partial<OrganizationSettings>) => {
    if (!organization) return false;
    return updateOrganizationSettings(organization.id, settings);
  }, [organization]);

  const deleteOrg = useCallback(async () => {
    if (!organization) return false;
    return deleteOrganization(organization.id);
  }, [organization]);

  const switchOrganization = useCallback(async (orgId: string) => {
    await setCurrentOrganization(orgId);
  }, []);

  // Member actions
  const loadMembers = useCallback(async () => {
    if (!organization) return [];
    return fetchMembers(organization.id);
  }, [organization]);

  const changeRole = useCallback(async (memberId: string, role: OrganizationRole) => {
    if (!organization) return false;
    return changeMemberRole(organization.id, memberId, role);
  }, [organization]);

  const removeMemberFromOrg = useCallback(async (memberId: string) => {
    if (!organization) return false;
    return removeMember(organization.id, memberId);
  }, [organization]);

  const getMemberById = useCallback((memberId: string) => {
    return membersMap[memberId];
  }, [membersMap]);

  // Invitation actions
  const loadInvitations = useCallback(async () => {
    if (!organization) return [];
    return fetchInvitations(organization.id);
  }, [organization]);

  const invite = useCallback(async (params: {
    email: string;
    role: OrganizationRole;
    teams?: string[];
    message?: string;
  }) => {
    if (!organization) return null;
    return sendInvitation(organization.id, params);
  }, [organization]);

  const resend = useCallback(async (invitationId: string) => {
    if (!organization) return false;
    return resendInvitation(organization.id, invitationId);
  }, [organization]);

  const revoke = useCallback(async (invitationId: string) => {
    if (!organization) return false;
    return revokeInvitation(organization.id, invitationId);
  }, [organization]);

  // Team actions
  const loadTeams = useCallback(async () => {
    if (!organization) return [];
    return fetchTeams(organization.id);
  }, [organization]);

  const createNewTeam = useCallback(async (params: {
    name: string;
    description?: string;
    color?: string;
  }) => {
    if (!organization) return null;
    return createTeam(organization.id, params);
  }, [organization]);

  const updateExistingTeam = useCallback(async (
    teamId: string,
    updates: Partial<Pick<Team, 'name' | 'description' | 'color'>>
  ) => {
    if (!organization) return false;
    return updateTeam(organization.id, teamId, updates);
  }, [organization]);

  const deleteExistingTeam = useCallback(async (teamId: string) => {
    if (!organization) return false;
    return deleteTeam(organization.id, teamId);
  }, [organization]);

  const getTeamById = useCallback((teamId: string) => {
    return teamsMap[teamId];
  }, [teamsMap]);

  // Team member actions
  const loadTeamMembers = useCallback(async (teamId: string) => {
    if (!organization) return [];
    return fetchTeamMembers(organization.id, teamId);
  }, [organization]);

  const addMemberToTeam = useCallback(async (teamId: string, userId: string, role: TeamRole) => {
    if (!organization) return false;
    return addTeamMember(organization.id, teamId, { userId, role });
  }, [organization]);

  const removeMemberFromTeam = useCallback(async (teamId: string, memberId: string) => {
    if (!organization) return false;
    return removeTeamMember(organization.id, teamId, memberId);
  }, [organization]);

  const changeTeamRole = useCallback(async (teamId: string, memberId: string, role: TeamRole) => {
    if (!organization) return false;
    return changeTeamMemberRole(organization.id, teamId, memberId, role);
  }, [organization]);

  // Audit log actions
  const loadAuditLog = useCallback(async (params?: {
    cursor?: string;
    limit?: number;
    actionType?: AuditActionType;
    actorId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    if (!organization) return [];
    return fetchAuditLog(organization.id, params);
  }, [organization]);

  const loadMoreAuditLog = useCallback(async () => {
    if (!organization || !auditLogHasMore) return [];
    const cursor = auditLog.length > 0 ? auditLog[auditLog.length - 1].id : undefined;
    return fetchAuditLog(organization.id, { cursor });
  }, [organization, auditLog, auditLogHasMore]);

  const exportAuditLogCsv = useCallback(async (params?: {
    startDate?: string;
    endDate?: string;
    actionTypes?: AuditActionType[];
  }) => {
    if (!organization) return null;
    return exportAuditLog(organization.id, params);
  }, [organization]);

  // Activity actions
  const loadActivity = useCallback(async (limit = 20) => {
    if (!organization) return [];
    return fetchActivityFeed(organization.id, limit);
  }, [organization]);

  return {
    // State
    organization,
    organizations,
    membership,
    members,
    membersMap,
    teams,
    teamsMap,
    teamMembers,
    invitations,
    pendingInvitations,
    auditLog,
    auditLogHasMore,
    activities,
    loading,
    error,

    // Permissions
    permissions,
    hasPermission,
    hasTeamPermission,
    canManageTeam,
    isOwner,
    isAdmin,
    isMember,

    // Organization actions
    loadOrganization,
    loadUserOrganizations,
    createOrg,
    updateOrg,
    updateSettings,
    deleteOrg,
    switchOrganization,

    // Member actions
    loadMembers,
    changeRole,
    removeMemberFromOrg,
    getMemberById,

    // Invitation actions
    loadInvitations,
    invite,
    resend,
    revoke,

    // Team actions
    loadTeams,
    createNewTeam,
    updateExistingTeam,
    deleteExistingTeam,
    getTeamById,

    // Team member actions
    loadTeamMembers,
    addMemberToTeam,
    removeMemberFromTeam,
    changeTeamRole,

    // Audit log actions
    loadAuditLog,
    loadMoreAuditLog,
    exportAuditLogCsv,

    // Activity actions
    loadActivity,

    // Reset
    reset: resetOrganizationState,
  };
}

/**
 * Hook for checking organization permissions
 * Lightweight alternative when you only need permission checks
 */
export function useOrganizationPermissions() {
  const membership = useStore(currentMembershipAtom);
  const permissions = useStore(currentUserPermissionsAtom);

  const hasPermission = useCallback((permission: OrganizationPermission): boolean => {
    return permissions[permission] === true;
  }, [permissions]);

  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'admin' || isOwner;
  const isMember = membership != null;
  const role = membership?.role;

  return {
    permissions,
    hasPermission,
    isOwner,
    isAdmin,
    isMember,
    role,
  };
}

/**
 * Hook for organization selection/switching
 * Use when implementing an organization switcher component
 */
export function useOrganizationSwitcher() {
  const currentOrg = useStore(currentOrganizationAtom);
  const organizations = useStore(organizationsAtom);
  const loading = useStore(organizationLoadingAtom);

  const switchTo = useCallback(async (orgId: string) => {
    await setCurrentOrganization(orgId);
  }, []);

  const loadAll = useCallback(async () => {
    return fetchUserOrganizations();
  }, []);

  return {
    currentOrg,
    organizations,
    loading,
    switchTo,
    loadAll,
  };
}

// Re-export types for convenience
export type {
  Organization,
  OrganizationMember,
  OrganizationRole,
  OrganizationPermission,
  OrganizationSettings,
  Team,
  TeamMember,
  TeamRole,
  TeamPermission,
  Invitation,
  AuditLogEntry,
  AuditActionType,
  OrganizationActivity,
};

export { ORGANIZATION_PERMISSIONS, TEAM_PERMISSIONS };
