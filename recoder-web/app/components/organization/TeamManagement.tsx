/**
 * TeamManagement Component
 * Team CRUD operations, member management, permission matrix display, and team settings.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { useOrganization, TEAM_PERMISSIONS } from '~/lib/hooks/useOrganization';
import type { Team, TeamMember, TeamRole, OrganizationMember } from '~/lib/stores/organization';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

interface TeamManagementProps {
  organizationId: string;
  onBack?: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export const TeamManagement = memo(({ organizationId, onBack }: TeamManagementProps) => {
  const {
    organization,
    teams,
    teamMembers,
    members,
    loading,
    hasPermission,
    canManageTeam,
    loadOrganization,
    loadTeams,
    loadMembers,
    loadTeamMembers,
    createNewTeam,
    updateExistingTeam,
    deleteExistingTeam,
    addMemberToTeam,
    removeMemberFromTeam,
    changeTeamRole,
  } = useOrganization();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  // Load data on mount
  useEffect(() => {
    if (organizationId) {
      loadOrganization(organizationId);
      loadTeams();
      loadMembers();
    }
  }, [organizationId, loadOrganization, loadTeams, loadMembers]);

  // Load team members when a team is selected
  useEffect(() => {
    if (selectedTeamId) {
      loadTeamMembers(selectedTeamId);
    }
  }, [selectedTeamId, loadTeamMembers]);

  const selectedTeam = selectedTeamId ? teams.find((t) => t.id === selectedTeamId) : null;
  const selectedTeamMembers = selectedTeamId ? teamMembers[selectedTeamId] || [] : [];
  const canCreateTeams = hasPermission('canCreateTeams');
  const canDeleteTeams = hasPermission('canDeleteTeams');

  const handleCreateTeam = useCallback(async (name: string, description: string, color: string) => {
    const team = await createNewTeam({ name, description, color });
    if (team) {
      toast.success(`Team "${name}" created`);
      setShowCreateModal(false);
      setSelectedTeamId(team.id);
    } else {
      toast.error('Failed to create team');
    }
  }, [createNewTeam]);

  const handleDeleteTeam = useCallback(async (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    const success = await deleteExistingTeam(teamId);
    if (success) {
      toast.success(`Team "${team?.name}" deleted`);
      setShowDeleteConfirm(null);
      if (selectedTeamId === teamId) {
        setSelectedTeamId(null);
      }
    } else {
      toast.error('Failed to delete team');
    }
  }, [teams, deleteExistingTeam, selectedTeamId]);

  const handleAddMember = useCallback(async (userId: string, role: TeamRole) => {
    if (!selectedTeamId) return;
    const success = await addMemberToTeam(selectedTeamId, userId, role);
    if (success) {
      toast.success('Member added to team');
      setShowAddMemberModal(false);
    } else {
      toast.error('Failed to add member');
    }
  }, [selectedTeamId, addMemberToTeam]);

  const handleRemoveMember = useCallback(async (memberId: string) => {
    if (!selectedTeamId) return;
    const member = selectedTeamMembers.find((m) => m.id === memberId);
    const success = await removeMemberFromTeam(selectedTeamId, memberId);
    if (success) {
      toast.success(`${member?.name || 'Member'} removed from team`);
    } else {
      toast.error('Failed to remove member');
    }
  }, [selectedTeamId, selectedTeamMembers, removeMemberFromTeam]);

  const handleChangeRole = useCallback(async (memberId: string, newRole: TeamRole) => {
    if (!selectedTeamId) return;
    const success = await changeTeamRole(selectedTeamId, memberId, newRole);
    if (success) {
      toast.success('Role updated');
    } else {
      toast.error('Failed to update role');
    }
  }, [selectedTeamId, changeTeamRole]);

  if (loading.organization && !organization) {
    return <TeamManagementSkeleton />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bolt-elements-background-depth-1">
      {/* Header */}
      <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-6 py-4">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary rounded-lg hover:bg-bolt-elements-background-depth-3 transition-colors"
            >
              <span className="i-ph:arrow-left text-lg" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">
              Team Management
            </h1>
            <p className="text-sm text-bolt-elements-textTertiary mt-0.5">
              Create and manage teams, assign members and permissions
            </p>
          </div>
          {canCreateTeams && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <span className="i-ph:plus" />
              Create Team
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Teams List Sidebar */}
        <div className="w-80 border-r border-bolt-elements-borderColor flex flex-col">
          <div className="p-3 border-b border-bolt-elements-borderColor">
            <div className="relative">
              <span className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary" />
              <input
                type="text"
                placeholder="Search teams..."
                className="w-full pl-9 pr-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {loading.teams ? (
              <div className="p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="mb-2 animate-pulse">
                    <div className="flex items-center gap-3 p-3 rounded-lg">
                      <div className="w-10 h-10 bg-bolt-elements-background-depth-2 rounded-lg" />
                      <div className="flex-1">
                        <div className="h-4 bg-bolt-elements-background-depth-2 rounded w-24 mb-1" />
                        <div className="h-3 bg-bolt-elements-background-depth-2 rounded w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : teams.length === 0 ? (
              <div className="p-8 text-center">
                <span className="i-ph:users-three text-4xl text-bolt-elements-textTertiary mb-3 block" />
                <h3 className="text-bolt-elements-textPrimary font-medium mb-1">No teams yet</h3>
                <p className="text-sm text-bolt-elements-textTertiary mb-4">
                  Create your first team to organize members
                </p>
                {canCreateTeams && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Create Team
                  </button>
                )}
              </div>
            ) : (
              <div className="p-2">
                {teams.map((team) => (
                  <TeamListItem
                    key={team.id}
                    team={team}
                    isSelected={selectedTeamId === team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Team Detail */}
        <div className="flex-1 overflow-auto">
          {selectedTeam ? (
            <TeamDetail
              team={selectedTeam}
              members={selectedTeamMembers}
              organizationMembers={members}
              loading={loading.teams}
              canManage={canManageTeam(selectedTeam.id)}
              canDelete={canDeleteTeams && !selectedTeam.isDefault}
              onUpdateTeam={async (updates) => {
                const success = await updateExistingTeam(selectedTeam.id, updates);
                if (success) {
                  toast.success('Team updated');
                } else {
                  toast.error('Failed to update team');
                }
              }}
              onDeleteTeam={() => setShowDeleteConfirm(selectedTeam.id)}
              onAddMember={() => setShowAddMemberModal(true)}
              onRemoveMember={handleRemoveMember}
              onChangeRole={handleChangeRole}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <span className="i-ph:users-three text-5xl text-bolt-elements-textTertiary mb-4" />
              <h2 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                Select a team
              </h2>
              <p className="text-sm text-bolt-elements-textTertiary">
                Choose a team from the sidebar to view details and manage members
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <CreateTeamModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTeam}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteTeamModal
          teamName={teams.find((t) => t.id === showDeleteConfirm)?.name || ''}
          onClose={() => setShowDeleteConfirm(null)}
          onConfirm={() => handleDeleteTeam(showDeleteConfirm)}
        />
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && selectedTeam && (
        <AddMemberModal
          teamName={selectedTeam.name}
          existingMemberIds={selectedTeamMembers.map((m) => m.userId)}
          organizationMembers={members}
          onClose={() => setShowAddMemberModal(false)}
          onAdd={handleAddMember}
        />
      )}
    </div>
  );
});

TeamManagement.displayName = 'TeamManagement';

// ============================================================================
// Team List Item
// ============================================================================

interface TeamListItemProps {
  team: Team;
  isSelected: boolean;
  onClick: () => void;
}

const TeamListItem = memo(({ team, isSelected, onClick }: TeamListItemProps) => (
  <button
    onClick={onClick}
    className={classNames(
      'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
      isSelected
        ? 'bg-blue-500/20 border border-blue-500/50'
        : 'hover:bg-bolt-elements-background-depth-2 border border-transparent'
    )}
  >
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
      style={{ backgroundColor: team.color || '#6366f1' }}
    >
      {team.name.charAt(0).toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className={classNames(
          'text-sm font-medium truncate',
          isSelected ? 'text-blue-400' : 'text-bolt-elements-textPrimary'
        )}>
          {team.name}
        </span>
        {team.isDefault && (
          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded shrink-0">
            Default
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-bolt-elements-textTertiary mt-0.5">
        <span>{team.memberCount} members</span>
        <span>-</span>
        <span>{team.projectCount} projects</span>
      </div>
    </div>
  </button>
));

TeamListItem.displayName = 'TeamListItem';

// ============================================================================
// Team Detail
// ============================================================================

interface TeamDetailProps {
  team: Team;
  members: TeamMember[];
  organizationMembers: OrganizationMember[];
  loading: boolean;
  canManage: boolean;
  canDelete: boolean;
  onUpdateTeam: (updates: Partial<Pick<Team, 'name' | 'description' | 'color'>>) => Promise<void>;
  onDeleteTeam: () => void;
  onAddMember: () => void;
  onRemoveMember: (memberId: string) => void;
  onChangeRole: (memberId: string, role: TeamRole) => void;
}

const TeamDetail = memo(({
  team,
  members,
  organizationMembers,
  loading,
  canManage,
  canDelete,
  onUpdateTeam,
  onDeleteTeam,
  onAddMember,
  onRemoveMember,
  onChangeRole,
}: TeamDetailProps) => {
  const [activeTab, setActiveTab] = useState<'members' | 'permissions' | 'settings'>('members');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(team.name);
  const [saving, setSaving] = useState(false);

  // Reset name value when team changes
  useEffect(() => {
    setNameValue(team.name);
    setEditingName(false);
  }, [team.id, team.name]);

  const handleSaveName = useCallback(async () => {
    if (!nameValue.trim() || nameValue === team.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    await onUpdateTeam({ name: nameValue.trim() });
    setSaving(false);
    setEditingName(false);
  }, [nameValue, team.name, onUpdateTeam]);

  return (
    <div className="h-full flex flex-col">
      {/* Team Header */}
      <div className="p-6 border-b border-bolt-elements-borderColor">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-2xl font-bold shrink-0"
            style={{ backgroundColor: team.color || '#6366f1' }}
          >
            {team.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="px-3 py-1.5 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-lg font-semibold text-bolt-elements-textPrimary focus:border-blue-500 focus:outline-none"
                  disabled={saving}
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={saving}
                  className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
                >
                  {saving ? (
                    <span className="i-ph:spinner animate-spin" />
                  ) : (
                    <span className="i-ph:check" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setNameValue(team.name);
                    setEditingName(false);
                  }}
                  disabled={saving}
                  className="p-1.5 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                >
                  <span className="i-ph:x" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
                  {team.name}
                </h2>
                {team.isDefault && (
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                    Default Team
                  </span>
                )}
                {canManage && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary rounded"
                  >
                    <span className="i-ph:pencil-simple text-sm" />
                  </button>
                )}
              </div>
            )}
            {team.description && (
              <p className="text-sm text-bolt-elements-textTertiary mt-1">{team.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-bolt-elements-textTertiary">
              <span>{team.memberCount} members</span>
              <span>{team.projectCount} projects</span>
              <span>Created {new Date(team.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && (
              <button
                onClick={onAddMember}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                <span className="i-ph:user-plus" />
                Add Member
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDeleteTeam}
                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete team"
              >
                <span className="i-ph:trash text-lg" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-bolt-elements-borderColor">
        <div className="flex gap-1">
          <TabButton
            active={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
            label={`Members (${members.length})`}
          />
          <TabButton
            active={activeTab === 'permissions'}
            onClick={() => setActiveTab('permissions')}
            label="Permissions"
          />
          {canManage && (
            <TabButton
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              label="Settings"
            />
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'members' && (
          <MembersTab
            members={members}
            organizationMembers={organizationMembers}
            loading={loading}
            canManage={canManage}
            onRemoveMember={onRemoveMember}
            onChangeRole={onChangeRole}
          />
        )}
        {activeTab === 'permissions' && (
          <PermissionsTab />
        )}
        {activeTab === 'settings' && canManage && (
          <SettingsTab
            team={team}
            onUpdateTeam={onUpdateTeam}
          />
        )}
      </div>
    </div>
  );
});

TeamDetail.displayName = 'TeamDetail';

// ============================================================================
// Members Tab
// ============================================================================

interface MembersTabProps {
  members: TeamMember[];
  organizationMembers: OrganizationMember[];
  loading: boolean;
  canManage: boolean;
  onRemoveMember: (memberId: string) => void;
  onChangeRole: (memberId: string, role: TeamRole) => void;
}

const MembersTab = memo(({
  members,
  organizationMembers,
  loading,
  canManage,
  onRemoveMember,
  onChangeRole,
}: MembersTabProps) => {
  if (loading) {
    return (
      <div className="p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mb-3 animate-pulse">
            <div className="flex items-center gap-3 p-3 bg-bolt-elements-background-depth-2 rounded-lg">
              <div className="w-10 h-10 bg-bolt-elements-background-depth-2 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-bolt-elements-background-depth-2 rounded w-32 mb-1" />
                <div className="h-3 bg-bolt-elements-background-depth-2 rounded w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="p-8 text-center">
        <span className="i-ph:users text-4xl text-bolt-elements-textTertiary mb-3 block" />
        <h3 className="text-bolt-elements-textPrimary font-medium mb-1">No members yet</h3>
        <p className="text-sm text-bolt-elements-textTertiary">
          Add members to this team to collaborate on projects
        </p>
      </div>
    );
  }

  // Get full member info from organization members
  const getMemberInfo = (userId: string) => {
    return organizationMembers.find((m) => m.userId === userId);
  };

  return (
    <div className="p-6">
      <div className="space-y-2">
        {members.map((member) => {
          const orgMember = getMemberInfo(member.userId);
          return (
            <div
              key={member.id}
              className="flex items-center gap-3 p-3 bg-bolt-elements-background-depth-2 rounded-lg"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium shrink-0">
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt={member.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  member.name.charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-bolt-elements-textPrimary truncate">
                    {member.name}
                  </span>
                  {orgMember?.role === 'owner' && (
                    <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                      Org Owner
                    </span>
                  )}
                </div>
                <span className="text-xs text-bolt-elements-textTertiary">{member.email}</span>
              </div>

              {/* Role */}
              {canManage ? (
                <select
                  value={member.role}
                  onChange={(e) => onChangeRole(member.id, e.target.value as TeamRole)}
                  className="px-2 py-1 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-sm text-bolt-elements-textPrimary focus:border-blue-500 focus:outline-none"
                >
                  <option value="lead">Lead</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <RoleBadge role={member.role} />
              )}

              {/* Remove */}
              {canManage && (
                <button
                  onClick={() => onRemoveMember(member.id)}
                  className="p-1.5 text-bolt-elements-textTertiary hover:text-red-400 rounded transition-colors"
                  title="Remove from team"
                >
                  <span className="i-ph:x" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

MembersTab.displayName = 'MembersTab';

// ============================================================================
// Permissions Tab
// ============================================================================

const PermissionsTab = memo(() => {
  const roles: TeamRole[] = ['lead', 'member', 'viewer'];
  const permissions = Object.keys(TEAM_PERMISSIONS.lead) as Array<keyof typeof TEAM_PERMISSIONS.lead>;

  const permissionLabels: Record<string, string> = {
    canManageTeam: 'Manage Team Settings',
    canAddMembers: 'Add Members',
    canRemoveMembers: 'Remove Members',
    canChangeRoles: 'Change Member Roles',
    canDeleteTeam: 'Delete Team',
    canManageProjects: 'Manage Projects',
  };

  return (
    <div className="p-6">
      <div className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor">
              <th className="px-4 py-3 text-left text-sm font-medium text-bolt-elements-textTertiary">
                Permission
              </th>
              {roles.map((role) => (
                <th key={role} className="px-4 py-3 text-center text-sm font-medium text-bolt-elements-textTertiary capitalize">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-bolt-elements-borderColor">
            {permissions.map((permission) => (
              <tr key={permission} className="hover:bg-bolt-elements-background-depth-2 transition-colors">
                <td className="px-4 py-3 text-sm text-bolt-elements-textPrimary">
                  {permissionLabels[permission] || permission}
                </td>
                {roles.map((role) => (
                  <td key={role} className="px-4 py-3 text-center">
                    {TEAM_PERMISSIONS[role][permission] ? (
                      <span className="i-ph:check-circle-fill text-lg text-green-400" />
                    ) : (
                      <span className="i-ph:x-circle text-lg text-bolt-elements-textTertiary" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <span className="i-ph:info text-blue-400 text-lg shrink-0 mt-0.5" />
          <div className="text-sm text-blue-300">
            <p className="font-medium mb-1">Role Hierarchy</p>
            <ul className="text-blue-300/80 space-y-1">
              <li><strong>Lead:</strong> Full team management including members and settings</li>
              <li><strong>Member:</strong> Can manage projects but not team settings</li>
              <li><strong>Viewer:</strong> Read-only access to team projects</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
});

PermissionsTab.displayName = 'PermissionsTab';

// ============================================================================
// Settings Tab
// ============================================================================

interface SettingsTabProps {
  team: Team;
  onUpdateTeam: (updates: Partial<Pick<Team, 'name' | 'description' | 'color'>>) => Promise<void>;
}

const SettingsTab = memo(({ team, onUpdateTeam }: SettingsTabProps) => {
  const [description, setDescription] = useState(team.description || '');
  const [color, setColor] = useState(team.color || '#6366f1');
  const [saving, setSaving] = useState(false);

  const colors = [
    '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6',
  ];

  const handleSave = useCallback(async () => {
    setSaving(true);
    await onUpdateTeam({ description, color });
    setSaving(false);
  }, [description, color, onUpdateTeam]);

  return (
    <div className="p-6 max-w-2xl">
      <div className="space-y-6">
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this team for?"
            rows={3}
            className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
            Team Color
          </label>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={classNames(
                  'w-8 h-8 rounded-lg transition-transform',
                  color === c && 'ring-2 ring-white ring-offset-2 ring-offset-bolt-elements-background-depth-1 scale-110'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-bolt-elements-borderColor">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? (
              <>
                <span className="i-ph:spinner animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <span className="i-ph:floppy-disk" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

SettingsTab.displayName = 'SettingsTab';

// ============================================================================
// Modals
// ============================================================================

interface CreateTeamModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string, color: string) => void;
}

const CreateTeamModal = memo(({ onClose, onCreate }: CreateTeamModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [creating, setCreating] = useState(false);

  const colors = [
    '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6',
  ];

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    await onCreate(name.trim(), description.trim(), color);
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-bolt-elements-borderColor">
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Create Team</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-1.5">
              Team Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Engineering, Design, Marketing"
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this team for?"
              rows={2}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-1.5">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={classNames(
                    'w-8 h-8 rounded-lg transition-transform',
                    color === c && 'ring-2 ring-white ring-offset-2 ring-offset-bolt-elements-background-depth-2 scale-110'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-bolt-elements-borderColor flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {creating ? (
              <span className="i-ph:spinner animate-spin" />
            ) : (
              <span className="i-ph:plus" />
            )}
            Create Team
          </button>
        </div>
      </div>
    </div>
  );
});

CreateTeamModal.displayName = 'CreateTeamModal';

interface DeleteTeamModalProps {
  teamName: string;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteTeamModal = memo(({ teamName, onClose, onConfirm }: DeleteTeamModalProps) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
    <div
      className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor w-full max-w-md shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="i-ph:warning text-2xl text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Delete Team</h2>
            <p className="text-sm text-bolt-elements-textTertiary">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-bolt-elements-textTertiary mb-4">
          Are you sure you want to delete <strong>{teamName}</strong>? All team members will be removed and any associated projects will need to be reassigned.
        </p>
      </div>
      <div className="px-6 py-4 border-t border-bolt-elements-borderColor flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Delete Team
        </button>
      </div>
    </div>
  </div>
));

DeleteTeamModal.displayName = 'DeleteTeamModal';

interface AddMemberModalProps {
  teamName: string;
  existingMemberIds: string[];
  organizationMembers: OrganizationMember[];
  onClose: () => void;
  onAdd: (userId: string, role: TeamRole) => void;
}

const AddMemberModal = memo(({
  teamName,
  existingMemberIds,
  organizationMembers,
  onClose,
  onAdd,
}: AddMemberModalProps) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState<TeamRole>('member');
  const [search, setSearch] = useState('');

  const availableMembers = organizationMembers.filter(
    (m) => !existingMemberIds.includes(m.userId) &&
           (m.name.toLowerCase().includes(search.toLowerCase()) ||
            m.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-bolt-elements-borderColor">
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
            Add Member to {teamName}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-1.5">
              Search Members
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-auto border border-bolt-elements-borderColor rounded-lg">
            {availableMembers.length === 0 ? (
              <div className="p-4 text-center text-sm text-bolt-elements-textTertiary">
                No available members found
              </div>
            ) : (
              <div className="divide-y divide-bolt-elements-borderColor">
                {availableMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => setSelectedUserId(member.userId)}
                    className={classNames(
                      'w-full flex items-center gap-3 p-3 text-left transition-colors',
                      selectedUserId === member.userId
                        ? 'bg-blue-500/20'
                        : 'hover:bg-bolt-elements-background-depth-2'
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-bolt-elements-textPrimary truncate">
                        {member.name}
                      </div>
                      <div className="text-xs text-bolt-elements-textTertiary truncate">
                        {member.email}
                      </div>
                    </div>
                    {selectedUserId === member.userId && (
                      <span className="i-ph:check-circle-fill text-blue-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary focus:border-blue-500 focus:outline-none"
            >
              <option value="lead">Lead - Can manage team</option>
              <option value="member">Member - Can work on projects</option>
              <option value="viewer">Viewer - Read-only access</option>
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-bolt-elements-borderColor flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedUserId && onAdd(selectedUserId, role)}
            disabled={!selectedUserId}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <span className="i-ph:user-plus" />
            Add Member
          </button>
        </div>
      </div>
    </div>
  );
});

AddMemberModal.displayName = 'AddMemberModal';

// ============================================================================
// Helper Components
// ============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

const TabButton = memo(({ active, onClick, label }: TabButtonProps) => (
  <button
    onClick={onClick}
    className={classNames(
      'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
      active
        ? 'text-blue-400 border-blue-500'
        : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary border-transparent'
    )}
  >
    {label}
  </button>
));

TabButton.displayName = 'TabButton';

interface RoleBadgeProps {
  role: TeamRole;
}

const RoleBadge = memo(({ role }: RoleBadgeProps) => {
  const colors: Record<TeamRole, string> = {
    lead: 'bg-purple-500/20 text-purple-400',
    member: 'bg-blue-500/20 text-blue-400',
    viewer: 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary',
  };

  return (
    <span className={classNames('px-2 py-0.5 text-xs font-medium rounded capitalize', colors[role])}>
      {role}
    </span>
  );
});

RoleBadge.displayName = 'RoleBadge';

const TeamManagementSkeleton = memo(() => (
  <div className="flex flex-col h-full overflow-hidden bg-bolt-elements-background-depth-1 animate-pulse">
    <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-bolt-elements-background-depth-2 rounded" />
        <div className="flex-1">
          <div className="h-6 bg-bolt-elements-background-depth-2 rounded w-48 mb-2" />
          <div className="h-4 bg-bolt-elements-background-depth-2 rounded w-64" />
        </div>
      </div>
    </div>
    <div className="flex flex-1">
      <div className="w-80 border-r border-bolt-elements-borderColor p-4">
        <div className="h-10 bg-bolt-elements-background-depth-2 rounded-lg mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-bolt-elements-background-depth-2 rounded-lg mb-2" />
        ))}
      </div>
      <div className="flex-1 p-8">
        <div className="h-32 bg-bolt-elements-background-depth-2 rounded-xl" />
      </div>
    </div>
  </div>
));

TeamManagementSkeleton.displayName = 'TeamManagementSkeleton';

export default TeamManagement;
