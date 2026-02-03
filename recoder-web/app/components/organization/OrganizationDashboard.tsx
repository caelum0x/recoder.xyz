/**
 * OrganizationDashboard Component
 * Main dashboard view for enterprise organizations showing overview stats,
 * team list, recent activity, and settings panel.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { useOrganization } from '~/lib/hooks/useOrganization';
import type { OrganizationActivity, Team, OrganizationMember, OrganizationPermission } from '~/lib/stores/organization';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

interface OrganizationDashboardProps {
  organizationId: string;
  onNavigateToTeams?: () => void;
  onNavigateToMembers?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToAuditLog?: () => void;
  onNavigateToInvite?: () => void;
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export const OrganizationDashboard = memo(({
  organizationId,
  onNavigateToTeams,
  onNavigateToMembers,
  onNavigateToSettings,
  onNavigateToAuditLog,
  onNavigateToInvite,
}: OrganizationDashboardProps) => {
  const {
    organization,
    members,
    teams,
    activities,
    loading,
    error,
    hasPermission,
    isOwner,
    isAdmin,
    loadOrganization,
    loadMembers,
    loadTeams,
    loadActivity,
  } = useOrganization();

  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  // Load data on mount
  useEffect(() => {
    if (organizationId) {
      loadOrganization(organizationId);
      loadMembers();
      loadTeams();
      loadActivity(10);
    }
  }, [organizationId, loadOrganization, loadMembers, loadTeams, loadActivity]);

  if (loading.organization && !organization) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <span className="i-ph:warning-circle text-5xl text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">
          Failed to load organization
        </h2>
        <p className="text-bolt-elements-textTertiary mb-4">{error}</p>
        <button
          onClick={() => loadOrganization(organizationId)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <span className="i-ph:buildings text-5xl text-bolt-elements-textTertiary mb-4" />
        <h2 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">
          Organization not found
        </h2>
        <p className="text-bolt-elements-textTertiary">
          The organization you are looking for does not exist or you do not have access.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bolt-elements-background-depth-1">
      {/* Header */}
      <DashboardHeader
        organization={organization}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onInvite={onNavigateToInvite}
        canInvite={hasPermission('canInviteMembers')}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' ? (
          <OverviewContent
            organization={organization}
            members={members}
            teams={teams}
            activities={activities}
            loading={loading}
            isAdmin={isAdmin}
            onNavigateToTeams={onNavigateToTeams}
            onNavigateToMembers={onNavigateToMembers}
            onNavigateToAuditLog={onNavigateToAuditLog}
          />
        ) : (
          <SettingsContent
            organization={organization}
            isOwner={isOwner}
            isAdmin={isAdmin}
            hasPermission={hasPermission}
            onNavigateToSettings={onNavigateToSettings}
          />
        )}
      </div>
    </div>
  );
});

OrganizationDashboard.displayName = 'OrganizationDashboard';

// ============================================================================
// Dashboard Header
// ============================================================================

interface DashboardHeaderProps {
  organization: NonNullable<ReturnType<typeof useOrganization>['organization']>;
  activeTab: 'overview' | 'settings';
  onTabChange: (tab: 'overview' | 'settings') => void;
  onInvite?: () => void;
  canInvite: boolean;
}

const DashboardHeader = memo(({
  organization,
  activeTab,
  onTabChange,
  onInvite,
  canInvite,
}: DashboardHeaderProps) => {
  return (
    <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      {/* Organization Info */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Logo/Avatar */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
            {organization.logoUrl ? (
              <img
                src={organization.logoUrl}
                alt={organization.name}
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              organization.name.charAt(0).toUpperCase()
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-bolt-elements-textPrimary truncate">
                {organization.name}
              </h1>
              <PlanBadge plan={organization.plan} />
            </div>
            {organization.description && (
              <p className="text-sm text-bolt-elements-textTertiary truncate mt-0.5">
                {organization.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-bolt-elements-textTertiary">
              <span className="flex items-center gap-1">
                <span className="i-ph:users" />
                {organization.stats.memberCount} members
              </span>
              <span className="flex items-center gap-1">
                <span className="i-ph:users-three" />
                {organization.stats.teamCount} teams
              </span>
              <span className="flex items-center gap-1">
                <span className="i-ph:folder" />
                {organization.stats.projectCount} projects
              </span>
            </div>
          </div>

          {/* Actions */}
          {canInvite && (
            <button
              onClick={onInvite}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <span className="i-ph:user-plus" />
              Invite Members
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex gap-1">
        <TabButton
          active={activeTab === 'overview'}
          onClick={() => onTabChange('overview')}
          icon="i-ph:chart-bar"
          label="Overview"
        />
        <TabButton
          active={activeTab === 'settings'}
          onClick={() => onTabChange('settings')}
          icon="i-ph:gear"
          label="Settings"
        />
      </div>
    </div>
  );
});

DashboardHeader.displayName = 'DashboardHeader';

// ============================================================================
// Overview Content
// ============================================================================

interface OverviewContentProps {
  organization: NonNullable<ReturnType<typeof useOrganization>['organization']>;
  members: OrganizationMember[];
  teams: Team[];
  activities: OrganizationActivity[];
  loading: ReturnType<typeof useOrganization>['loading'];
  isAdmin: boolean;
  onNavigateToTeams?: () => void;
  onNavigateToMembers?: () => void;
  onNavigateToAuditLog?: () => void;
}

const OverviewContent = memo(({
  organization,
  members,
  teams,
  activities,
  loading,
  isAdmin,
  onNavigateToTeams,
  onNavigateToMembers,
  onNavigateToAuditLog,
}: OverviewContentProps) => {
  return (
    <div className="p-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon="i-ph:users"
          iconColor="text-blue-400"
          label="Total Members"
          value={organization.stats.memberCount}
          subtext={`${members.filter(m => m.role === 'admin').length} admins`}
          onClick={onNavigateToMembers}
        />
        <StatCard
          icon="i-ph:users-three"
          iconColor="text-purple-400"
          label="Teams"
          value={organization.stats.teamCount}
          subtext={`${teams.filter(t => !t.isDefault).length} custom teams`}
          onClick={onNavigateToTeams}
        />
        <StatCard
          icon="i-ph:folder-open"
          iconColor="text-green-400"
          label="Projects"
          value={organization.stats.projectCount}
          subtext="Active projects"
        />
        <StatCard
          icon="i-ph:database"
          iconColor="text-orange-400"
          label="Storage Used"
          value={formatStorage(organization.stats.storageUsedMb)}
          subtext={`${formatNumber(organization.stats.apiCallsThisMonth)} API calls/mo`}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Teams List */}
        <div className="lg:col-span-2">
          <TeamsList
            teams={teams}
            loading={loading.teams}
            onViewAll={onNavigateToTeams}
          />
        </div>

        {/* Activity Feed */}
        <div>
          <ActivityFeed
            activities={activities}
            loading={loading.organization}
            isAdmin={isAdmin}
            onViewAll={onNavigateToAuditLog}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6">
        <QuickActions
          isAdmin={isAdmin}
          onNavigateToTeams={onNavigateToTeams}
          onNavigateToMembers={onNavigateToMembers}
          onNavigateToAuditLog={onNavigateToAuditLog}
        />
      </div>
    </div>
  );
});

OverviewContent.displayName = 'OverviewContent';

// ============================================================================
// Settings Content
// ============================================================================

interface SettingsContentProps {
  organization: NonNullable<ReturnType<typeof useOrganization>['organization']>;
  isOwner: boolean;
  isAdmin: boolean;
  hasPermission: (permission: OrganizationPermission) => boolean;
  onNavigateToSettings?: () => void;
}

const SettingsContent = memo(({
  organization,
  isOwner,
  isAdmin,
  hasPermission,
  onNavigateToSettings,
}: SettingsContentProps) => {
  const { updateOrg, updateSettings } = useOrganization();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(organization.name);
  const [saving, setSaving] = useState(false);

  const handleSaveName = useCallback(async () => {
    if (!nameValue.trim() || nameValue === organization.name) {
      setEditingName(false);
      return;
    }

    setSaving(true);
    const success = await updateOrg({ name: nameValue.trim() });
    setSaving(false);

    if (success) {
      toast.success('Organization name updated');
      setEditingName(false);
    } else {
      toast.error('Failed to update organization name');
    }
  }, [nameValue, organization.name, updateOrg]);

  const handleToggleSetting = useCallback(async (key: string, value: boolean) => {
    setSaving(true);
    const success = await updateSettings({ [key]: value });
    setSaving(false);

    if (success) {
      toast.success('Setting updated');
    } else {
      toast.error('Failed to update setting');
    }
  }, [updateSettings]);

  return (
    <div className="p-6 max-w-4xl">
      {/* General Settings */}
      <div className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor mb-6">
        <div className="px-6 py-4 border-b border-bolt-elements-borderColor">
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
            <span className="i-ph:gear" />
            General Settings
          </h2>
        </div>
        <div className="p-6 space-y-6">
          {/* Organization Name */}
          <SettingsRow
            label="Organization Name"
            description="The name displayed to all members"
          >
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="px-3 py-1.5 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary focus:border-blue-500 focus:outline-none"
                  disabled={saving}
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  {saving ? (
                    <span className="i-ph:spinner animate-spin" />
                  ) : (
                    'Save'
                  )}
                </button>
                <button
                  onClick={() => {
                    setNameValue(organization.name);
                    setEditingName(false);
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-bolt-elements-textPrimary">{organization.name}</span>
                {isAdmin && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary rounded"
                  >
                    <span className="i-ph:pencil-simple text-sm" />
                  </button>
                )}
              </div>
            )}
          </SettingsRow>

          {/* Organization Slug */}
          <SettingsRow
            label="Organization URL"
            description="Your organization's unique identifier"
          >
            <code className="px-2 py-1 bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary text-sm rounded">
              recoder.xyz/org/{organization.slug}
            </code>
          </SettingsRow>

          {/* Website */}
          <SettingsRow
            label="Website"
            description="Organization website URL"
          >
            {organization.website ? (
              <a
                href={organization.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline text-sm flex items-center gap-1"
              >
                {organization.website}
                <span className="i-ph:arrow-square-out text-xs" />
              </a>
            ) : (
              <span className="text-bolt-elements-textTertiary text-sm">Not set</span>
            )}
          </SettingsRow>
        </div>
      </div>

      {/* Security Settings */}
      {isAdmin && (
        <div className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor mb-6">
          <div className="px-6 py-4 border-b border-bolt-elements-borderColor">
            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
              <span className="i-ph:shield-check" />
              Security Settings
            </h2>
          </div>
          <div className="p-6 space-y-6">
            {/* Two Factor */}
            <SettingsToggle
              label="Require Two-Factor Authentication"
              description="All members must enable 2FA to access the organization"
              checked={organization.settings.requireTwoFactor}
              onChange={(v) => handleToggleSetting('requireTwoFactor', v)}
              disabled={saving}
            />

            {/* Allow Member Invites */}
            <SettingsToggle
              label="Allow Members to Invite"
              description="Members can invite new users to the organization"
              checked={organization.settings.allowMemberInvites}
              onChange={(v) => handleToggleSetting('allowMemberInvites', v)}
              disabled={saving}
            />

            {/* SSO Status */}
            <SettingsRow
              label="Single Sign-On (SSO)"
              description="Enterprise SSO configuration"
            >
              {organization.settings.ssoEnabled ? (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                    Enabled
                  </span>
                  <span className="text-bolt-elements-textTertiary text-sm capitalize">
                    {organization.settings.ssoProvider}
                  </span>
                </div>
              ) : (
                <span className="px-2 py-0.5 bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary text-xs rounded-full">
                  Not configured
                </span>
              )}
            </SettingsRow>

            {/* Allowed Domains */}
            <SettingsRow
              label="Allowed Email Domains"
              description="Restrict membership to specific email domains"
            >
              {organization.settings.allowedDomains.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {organization.settings.allowedDomains.map((domain) => (
                    <span
                      key={domain}
                      className="px-2 py-0.5 bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary text-xs rounded"
                    >
                      @{domain}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-bolt-elements-textTertiary text-sm">All domains allowed</span>
              )}
            </SettingsRow>
          </div>
        </div>
      )}

      {/* Limits & Usage */}
      <div className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor mb-6">
        <div className="px-6 py-4 border-b border-bolt-elements-borderColor">
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
            <span className="i-ph:chart-line-up" />
            Limits & Usage
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UsageCard
              label="Members"
              current={organization.stats.memberCount}
              max={organization.settings.maxMembers}
            />
            <UsageCard
              label="Teams"
              current={organization.stats.teamCount}
              max={organization.settings.maxTeams}
            />
            <UsageCard
              label="Projects"
              current={organization.stats.projectCount}
              max={organization.settings.maxProjects}
            />
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      {isOwner && (
        <div className="bg-red-500/5 rounded-xl border border-red-500/30">
          <div className="px-6 py-4 border-b border-red-500/30">
            <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2">
              <span className="i-ph:warning" />
              Danger Zone
            </h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-bolt-elements-textPrimary font-medium">Delete Organization</h3>
                <p className="text-bolt-elements-textTertiary text-sm mt-1">
                  Permanently delete this organization and all its data. This action cannot be undone.
                </p>
              </div>
              <button
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Delete Organization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

SettingsContent.displayName = 'SettingsContent';

// ============================================================================
// Sub-components
// ============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}

const TabButton = memo(({ active, onClick, icon, label }: TabButtonProps) => (
  <button
    onClick={onClick}
    className={classNames(
      'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
      active
        ? 'text-blue-400 border-blue-500'
        : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary border-transparent'
    )}
  >
    <span className={icon} />
    {label}
  </button>
));

TabButton.displayName = 'TabButton';

interface PlanBadgeProps {
  plan: 'free' | 'team' | 'enterprise';
}

const PlanBadge = memo(({ plan }: PlanBadgeProps) => {
  const colors = {
    free: 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary',
    team: 'bg-blue-500/20 text-blue-400',
    enterprise: 'bg-purple-500/20 text-purple-400',
  };

  return (
    <span className={classNames('px-2 py-0.5 text-xs font-medium rounded-full capitalize', colors[plan])}>
      {plan}
    </span>
  );
});

PlanBadge.displayName = 'PlanBadge';

interface StatCardProps {
  icon: string;
  iconColor: string;
  label: string;
  value: string | number;
  subtext?: string;
  onClick?: () => void;
}

const StatCard = memo(({ icon, iconColor, label, value, subtext, onClick }: StatCardProps) => (
  <div
    className={classNames(
      'bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor p-4 transition-colors',
      onClick && 'cursor-pointer hover:border-blue-500/50'
    )}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <div className={classNames('w-10 h-10 rounded-lg bg-bolt-elements-background-depth-2 flex items-center justify-center', iconColor)}>
        <span className={classNames(icon, 'text-xl')} />
      </div>
      <div>
        <div className="text-2xl font-bold text-bolt-elements-textPrimary">{value}</div>
        <div className="text-xs text-bolt-elements-textTertiary">{label}</div>
      </div>
    </div>
    {subtext && (
      <div className="mt-2 text-xs text-bolt-elements-textTertiary">{subtext}</div>
    )}
  </div>
));

StatCard.displayName = 'StatCard';

interface TeamsListProps {
  teams: Team[];
  loading: boolean;
  onViewAll?: () => void;
}

const TeamsList = memo(({ teams, loading, onViewAll }: TeamsListProps) => (
  <div className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor">
    <div className="px-4 py-3 border-b border-bolt-elements-borderColor flex items-center justify-between">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
        <span className="i-ph:users-three" />
        Teams
      </h3>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          View All
          <span className="i-ph:arrow-right" />
        </button>
      )}
    </div>
    <div className="divide-y divide-bolt-elements-borderColor">
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-3 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-bolt-elements-background-depth-2 rounded-lg" />
              <div className="flex-1">
                <div className="h-4 bg-bolt-elements-background-depth-2 rounded w-24 mb-1" />
                <div className="h-3 bg-bolt-elements-background-depth-2 rounded w-16" />
              </div>
            </div>
          </div>
        ))
      ) : teams.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <span className="i-ph:users-three text-3xl text-bolt-elements-textTertiary mb-2 block" />
          <p className="text-sm text-bolt-elements-textTertiary">No teams yet</p>
        </div>
      ) : (
        teams.slice(0, 5).map((team) => (
          <div key={team.id} className="px-4 py-3 hover:bg-bolt-elements-background-depth-2 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: team.color || '#6366f1' }}
              >
                {team.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-bolt-elements-textPrimary truncate">
                    {team.name}
                  </span>
                  {team.isDefault && (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-xs text-bolt-elements-textTertiary">
                  {team.memberCount} members
                </div>
              </div>
              <span className="i-ph:caret-right text-bolt-elements-textTertiary" />
            </div>
          </div>
        ))
      )}
    </div>
  </div>
));

TeamsList.displayName = 'TeamsList';

interface ActivityFeedProps {
  activities: OrganizationActivity[];
  loading: boolean;
  isAdmin: boolean;
  onViewAll?: () => void;
}

const ActivityFeed = memo(({ activities, loading, isAdmin, onViewAll }: ActivityFeedProps) => {
  const getActivityIcon = (type: OrganizationActivity['type']) => {
    switch (type) {
      case 'member_joined':
        return 'i-ph:user-plus text-green-400';
      case 'member_left':
        return 'i-ph:user-minus text-red-400';
      case 'team_created':
        return 'i-ph:users-three text-blue-400';
      case 'project_created':
        return 'i-ph:folder-plus text-purple-400';
      case 'settings_changed':
        return 'i-ph:gear text-orange-400';
      default:
        return 'i-ph:info text-bolt-elements-textTertiary';
    }
  };

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor">
      <div className="px-4 py-3 border-b border-bolt-elements-borderColor flex items-center justify-between">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
          <span className="i-ph:clock-counter-clockwise" />
          Recent Activity
        </h3>
        {isAdmin && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            Audit Log
            <span className="i-ph:arrow-right" />
          </button>
        )}
      </div>
      <div className="divide-y divide-bolt-elements-borderColor max-h-80 overflow-auto">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-bolt-elements-background-depth-2 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-bolt-elements-background-depth-2 rounded w-3/4 mb-1" />
                  <div className="h-3 bg-bolt-elements-background-depth-2 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))
        ) : activities.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <span className="i-ph:clock-counter-clockwise text-3xl text-bolt-elements-textTertiary mb-2 block" />
            <p className="text-sm text-bolt-elements-textTertiary">No recent activity</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className={classNames(getActivityIcon(activity.type), 'text-lg mt-0.5')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-bolt-elements-textPrimary">
                    <span className="font-medium">{activity.actorName}</span>
                    {' '}
                    <span className="text-bolt-elements-textTertiary">{activity.description}</span>
                  </p>
                  <span className="text-xs text-bolt-elements-textTertiary">
                    {formatRelativeTime(activity.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

ActivityFeed.displayName = 'ActivityFeed';

interface QuickActionsProps {
  isAdmin: boolean;
  onNavigateToTeams?: () => void;
  onNavigateToMembers?: () => void;
  onNavigateToAuditLog?: () => void;
}

const QuickActions = memo(({ isAdmin, onNavigateToTeams, onNavigateToMembers, onNavigateToAuditLog }: QuickActionsProps) => (
  <div className="bg-bolt-elements-background-depth-2 rounded-xl border border-bolt-elements-borderColor p-4">
    <h3 className="text-sm font-semibold text-bolt-elements-textPrimary mb-3">Quick Actions</h3>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <QuickActionButton
        icon="i-ph:users-three"
        label="Manage Teams"
        onClick={onNavigateToTeams}
      />
      <QuickActionButton
        icon="i-ph:users"
        label="Manage Members"
        onClick={onNavigateToMembers}
      />
      {isAdmin && (
        <>
          <QuickActionButton
            icon="i-ph:scroll"
            label="View Audit Log"
            onClick={onNavigateToAuditLog}
          />
          <QuickActionButton
            icon="i-ph:gear"
            label="Organization Settings"
          />
        </>
      )}
    </div>
  </div>
));

QuickActions.displayName = 'QuickActions';

interface QuickActionButtonProps {
  icon: string;
  label: string;
  onClick?: () => void;
}

const QuickActionButton = memo(({ icon, label, onClick }: QuickActionButtonProps) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-2 p-3 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 rounded-lg transition-colors text-center"
  >
    <span className={classNames(icon, 'text-xl text-bolt-elements-textTertiary')} />
    <span className="text-xs text-bolt-elements-textTertiary">{label}</span>
  </button>
));

QuickActionButton.displayName = 'QuickActionButton';

interface SettingsRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

const SettingsRow = memo(({ label, description, children }: SettingsRowProps) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{label}</h4>
      {description && (
        <p className="text-xs text-bolt-elements-textTertiary mt-0.5">{description}</p>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
));

SettingsRow.displayName = 'SettingsRow';

interface SettingsToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

const SettingsToggle = memo(({ label, description, checked, onChange, disabled }: SettingsToggleProps) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{label}</h4>
      {description && (
        <p className="text-xs text-bolt-elements-textTertiary mt-0.5">{description}</p>
      )}
    </div>
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={classNames(
        'relative w-11 h-6 rounded-full transition-colors',
        checked ? 'bg-blue-600' : 'bg-bolt-elements-background-depth-3',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={classNames(
          'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
          checked ? 'left-6' : 'left-1'
        )}
      />
    </button>
  </div>
));

SettingsToggle.displayName = 'SettingsToggle';

interface UsageCardProps {
  label: string;
  current: number;
  max: number;
}

const UsageCard = memo(({ label, current, max }: UsageCardProps) => {
  const percentage = Math.min(100, (current / max) * 100);
  const isHigh = percentage >= 80;
  const isFull = percentage >= 100;

  return (
    <div className="p-4 bg-bolt-elements-background-depth-2 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-bolt-elements-textTertiary">{label}</span>
        <span className={classNames(
          'text-sm font-medium',
          isFull ? 'text-red-400' : isHigh ? 'text-yellow-400' : 'text-bolt-elements-textPrimary'
        )}>
          {current} / {max}
        </span>
      </div>
      <div className="h-2 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
        <div
          className={classNames(
            'h-full rounded-full transition-all',
            isFull ? 'bg-red-500' : isHigh ? 'bg-yellow-500' : 'bg-blue-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
});

UsageCard.displayName = 'UsageCard';

const DashboardSkeleton = memo(() => (
  <div className="flex flex-col h-full overflow-hidden bg-bolt-elements-background-depth-1 animate-pulse">
    <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-bolt-elements-background-depth-2" />
        <div className="flex-1">
          <div className="h-6 bg-bolt-elements-background-depth-2 rounded w-48 mb-2" />
          <div className="h-4 bg-bolt-elements-background-depth-2 rounded w-32" />
        </div>
      </div>
    </div>
    <div className="p-6">
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-bolt-elements-background-depth-2 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 h-80 bg-bolt-elements-background-depth-2 rounded-xl" />
        <div className="h-80 bg-bolt-elements-background-depth-2 rounded-xl" />
      </div>
    </div>
  </div>
));

DashboardSkeleton.displayName = 'DashboardSkeleton';

// ============================================================================
// Utility Functions
// ============================================================================

function formatStorage(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default OrganizationDashboard;
