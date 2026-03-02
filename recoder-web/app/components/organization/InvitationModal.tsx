/**
 * InvitationModal Component
 * Modal for inviting new members to the organization with email input,
 * role selection, pending invitations list, and resend/revoke functionality.
 */

import { memo, useCallback, useState } from 'react';
import { useOrganization } from '~/lib/hooks/useOrganization';
import type { Invitation, OrganizationRole, Team } from '~/lib/stores/organization';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

interface InvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams?: Team[];
}

// ============================================================================
// Main Component
// ============================================================================

export const InvitationModal = memo(({ isOpen, onClose, teams = [] }: InvitationModalProps) => {
  const {
    invitations,
    pendingInvitations,
    loading,
    invite,
    resend,
    revoke,
    loadInvitations,
  } = useOrganization();

  const [activeTab, setActiveTab] = useState<'invite' | 'pending'>('invite');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>('member');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [bulkEmails, setBulkEmails] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);

  const handleInvite = useCallback(async () => {
    const emailToSend = email.trim().toLowerCase();
    if (!emailToSend || !isValidEmail(emailToSend)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setSending(true);
    const invitation = await invite({
      email: emailToSend,
      role,
      teams: selectedTeams.length > 0 ? selectedTeams : undefined,
      message: message.trim() || undefined,
    });
    setSending(false);

    if (invitation) {
      toast.success(`Invitation sent to ${emailToSend}`);
      setEmail('');
      setMessage('');
      setSelectedTeams([]);
      setActiveTab('pending');
    } else {
      toast.error('Failed to send invitation');
    }
  }, [email, role, selectedTeams, message, invite]);

  const handleBulkInvite = useCallback(async () => {
    const emails = bulkEmails
      .split(/[\n,;]/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => isValidEmail(e));

    if (emails.length === 0) {
      toast.error('No valid email addresses found');
      return;
    }

    setSending(true);
    let successCount = 0;
    let failCount = 0;

    for (const emailAddr of emails) {
      const invitation = await invite({
        email: emailAddr,
        role,
        teams: selectedTeams.length > 0 ? selectedTeams : undefined,
      });
      if (invitation) {
        successCount++;
      } else {
        failCount++;
      }
    }

    setSending(false);

    if (successCount > 0) {
      toast.success(`${successCount} invitation(s) sent successfully`);
      setBulkEmails('');
      setShowBulkInput(false);
      setActiveTab('pending');
    }
    if (failCount > 0) {
      toast.error(`${failCount} invitation(s) failed`);
    }
  }, [bulkEmails, role, selectedTeams, invite]);

  const handleResend = useCallback(async (invitationId: string, invitationEmail: string) => {
    const success = await resend(invitationId);
    if (success) {
      toast.success(`Invitation resent to ${invitationEmail}`);
    } else {
      toast.error('Failed to resend invitation');
    }
  }, [resend]);

  const handleRevoke = useCallback(async (invitationId: string, invitationEmail: string) => {
    const success = await revoke(invitationId);
    if (success) {
      toast.success(`Invitation to ${invitationEmail} revoked`);
    } else {
      toast.error('Failed to revoke invitation');
    }
  }, [revoke]);

  const toggleTeam = useCallback((teamId: string) => {
    setSelectedTeams((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-recoder-elements-background-depth-2 rounded-xl border border-recoder-elements-borderColor w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-recoder-elements-borderColor flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-recoder-elements-textPrimary">
              Invite Members
            </h2>
            <p className="text-sm text-recoder-elements-textTertiary mt-0.5">
              Invite people to join your organization
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary rounded-lg hover:bg-recoder-elements-background-depth-2 transition-colors"
          >
            <span className="i-ph:x text-lg" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-recoder-elements-borderColor shrink-0">
          <div className="flex gap-1">
            <TabButton
              active={activeTab === 'invite'}
              onClick={() => setActiveTab('invite')}
              label="Send Invitation"
              icon="i-ph:paper-plane-tilt"
            />
            <TabButton
              active={activeTab === 'pending'}
              onClick={() => setActiveTab('pending')}
              label={`Pending (${pendingInvitations.length})`}
              icon="i-ph:clock"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'invite' ? (
            <InviteForm
              email={email}
              setEmail={setEmail}
              role={role}
              setRole={setRole}
              teams={teams}
              selectedTeams={selectedTeams}
              onToggleTeam={toggleTeam}
              message={message}
              setMessage={setMessage}
              bulkEmails={bulkEmails}
              setBulkEmails={setBulkEmails}
              showBulkInput={showBulkInput}
              setShowBulkInput={setShowBulkInput}
              sending={sending}
              onInvite={handleInvite}
              onBulkInvite={handleBulkInvite}
            />
          ) : (
            <PendingInvitations
              invitations={pendingInvitations}
              loading={loading.invitations}
              onResend={handleResend}
              onRevoke={handleRevoke}
              onRefresh={loadInvitations}
            />
          )}
        </div>
      </div>
    </div>
  );
});

InvitationModal.displayName = 'InvitationModal';

// ============================================================================
// Invite Form
// ============================================================================

interface InviteFormProps {
  email: string;
  setEmail: (email: string) => void;
  role: OrganizationRole;
  setRole: (role: OrganizationRole) => void;
  teams: Team[];
  selectedTeams: string[];
  onToggleTeam: (teamId: string) => void;
  message: string;
  setMessage: (message: string) => void;
  bulkEmails: string;
  setBulkEmails: (emails: string) => void;
  showBulkInput: boolean;
  setShowBulkInput: (show: boolean) => void;
  sending: boolean;
  onInvite: () => void;
  onBulkInvite: () => void;
}

const InviteForm = memo(({
  email,
  setEmail,
  role,
  setRole,
  teams,
  selectedTeams,
  onToggleTeam,
  message,
  setMessage,
  bulkEmails,
  setBulkEmails,
  showBulkInput,
  setShowBulkInput,
  sending,
  onInvite,
  onBulkInvite,
}: InviteFormProps) => {
  return (
    <div className="p-6 space-y-5">
      {/* Email Input */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-recoder-elements-textPrimary">
            Email Address
          </label>
          <button
            onClick={() => setShowBulkInput(!showBulkInput)}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <span className="i-ph:list-plus" />
            {showBulkInput ? 'Single invite' : 'Bulk invite'}
          </button>
        </div>

        {showBulkInput ? (
          <div>
            <textarea
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              placeholder="Enter multiple email addresses separated by commas, semicolons, or new lines..."
              rows={4}
              className="w-full px-3 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-sm text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:border-blue-500 focus:outline-none resize-none"
            />
            <p className="text-xs text-recoder-elements-textTertiary mt-1">
              {getBulkEmailCount(bulkEmails)} valid email(s) detected
            </p>
          </div>
        ) : (
          <div className="relative">
            <span className="i-ph:envelope absolute left-3 top-1/2 -translate-y-1/2 text-recoder-elements-textTertiary" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full pl-10 pr-3 py-2.5 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-sm text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Role Selection */}
      <div>
        <label className="text-sm font-medium text-recoder-elements-textPrimary mb-2 block">
          Role
        </label>
        <div className="grid grid-cols-3 gap-2">
          <RoleOption
            role="admin"
            currentRole={role}
            onSelect={setRole}
            icon="i-ph:shield-star"
            title="Admin"
            description="Full access"
          />
          <RoleOption
            role="member"
            currentRole={role}
            onSelect={setRole}
            icon="i-ph:user"
            title="Member"
            description="Standard access"
          />
          <RoleOption
            role="viewer"
            currentRole={role}
            onSelect={setRole}
            icon="i-ph:eye"
            title="Viewer"
            description="Read-only"
          />
        </div>
      </div>

      {/* Team Selection */}
      {teams.length > 0 && (
        <div>
          <label className="text-sm font-medium text-recoder-elements-textPrimary mb-2 block">
            Add to Teams (optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => onToggleTeam(team.id)}
                className={classNames(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border',
                  selectedTeams.includes(team.id)
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                    : 'bg-recoder-elements-background-depth-2 border-recoder-elements-borderColor text-recoder-elements-textTertiary hover:border-recoder-elements-borderColorActive'
                )}
              >
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: team.color || '#6366f1' }}
                />
                {team.name}
                {selectedTeams.includes(team.id) && (
                  <span className="i-ph:check text-xs" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Message */}
      {!showBulkInput && (
        <div>
          <label className="text-sm font-medium text-recoder-elements-textPrimary mb-1.5 block">
            Personal Message (optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a personal note to the invitation email..."
            rows={2}
            className="w-full px-3 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-sm text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>
      )}

      {/* Role Permissions Info */}
      <RolePermissionsInfo role={role} />

      {/* Send Button */}
      <div className="pt-2">
        <button
          onClick={showBulkInput ? onBulkInvite : onInvite}
          disabled={sending || (showBulkInput ? getBulkEmailCount(bulkEmails) === 0 : !isValidEmail(email))}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {sending ? (
            <>
              <span className="i-ph:spinner animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <span className="i-ph:paper-plane-tilt" />
              {showBulkInput
                ? `Send ${getBulkEmailCount(bulkEmails)} Invitation(s)`
                : 'Send Invitation'}
            </>
          )}
        </button>
      </div>
    </div>
  );
});

InviteForm.displayName = 'InviteForm';

// ============================================================================
// Role Option
// ============================================================================

interface RoleOptionProps {
  role: OrganizationRole;
  currentRole: OrganizationRole;
  onSelect: (role: OrganizationRole) => void;
  icon: string;
  title: string;
  description: string;
}

const RoleOption = memo(({ role, currentRole, onSelect, icon, title, description }: RoleOptionProps) => {
  const isSelected = currentRole === role;

  return (
    <button
      onClick={() => onSelect(role)}
      className={classNames(
        'flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors',
        isSelected
          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
          : 'bg-recoder-elements-background-depth-2 border-recoder-elements-borderColor text-recoder-elements-textTertiary hover:border-recoder-elements-borderColorActive'
      )}
    >
      <span className={classNames(icon, 'text-xl', isSelected && 'text-blue-400')} />
      <span className={classNames('text-sm font-medium', isSelected && 'text-blue-300')}>
        {title}
      </span>
      <span className="text-xs text-recoder-elements-textTertiary">{description}</span>
    </button>
  );
});

RoleOption.displayName = 'RoleOption';

// ============================================================================
// Role Permissions Info
// ============================================================================

interface RolePermissionsInfoProps {
  role: OrganizationRole;
}

const RolePermissionsInfo = memo(({ role }: RolePermissionsInfoProps) => {
  const permissions: Record<OrganizationRole, string[]> = {
    owner: ['Full organization control', 'Manage billing', 'Delete organization'],
    admin: ['Manage members', 'Create teams', 'View audit logs', 'Manage settings'],
    member: ['Create projects', 'Join teams', 'Collaborate on projects'],
    viewer: ['View projects', 'Read-only access to team resources'],
  };

  const rolePermissions = permissions[role] || permissions.member;

  return (
    <div className="p-3 bg-recoder-elements-background-depth-2 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="i-ph:info text-blue-400" />
        <span className="text-sm font-medium text-recoder-elements-textPrimary capitalize">
          {role} Permissions
        </span>
      </div>
      <ul className="space-y-1">
        {rolePermissions.map((permission, index) => (
          <li key={index} className="flex items-center gap-2 text-xs text-recoder-elements-textTertiary">
            <span className="i-ph:check-circle text-green-400" />
            {permission}
          </li>
        ))}
      </ul>
    </div>
  );
});

RolePermissionsInfo.displayName = 'RolePermissionsInfo';

// ============================================================================
// Pending Invitations
// ============================================================================

interface PendingInvitationsProps {
  invitations: Invitation[];
  loading: boolean;
  onResend: (id: string, email: string) => void;
  onRevoke: (id: string, email: string) => void;
  onRefresh: () => void;
}

const PendingInvitations = memo(({
  invitations,
  loading,
  onResend,
  onRevoke,
  onRefresh,
}: PendingInvitationsProps) => {
  if (loading) {
    return (
      <div className="p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-3 animate-pulse">
            <div className="flex items-center gap-3 p-4 bg-recoder-elements-background-depth-2 rounded-lg">
              <div className="w-10 h-10 bg-recoder-elements-background-depth-3 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-recoder-elements-background-depth-3 rounded w-48 mb-1" />
                <div className="h-3 bg-recoder-elements-background-depth-3 rounded w-32" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="p-8 text-center">
        <span className="i-ph:envelope-open text-4xl text-recoder-elements-textTertiary mb-3 block" />
        <h3 className="text-recoder-elements-textPrimary font-medium mb-1">No pending invitations</h3>
        <p className="text-sm text-recoder-elements-textTertiary">
          Invitations you send will appear here until they are accepted
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-2">
        <span className="text-sm text-recoder-elements-textTertiary">
          {invitations.length} pending invitation(s)
        </span>
        <button
          onClick={onRefresh}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <span className="i-ph:arrows-clockwise" />
          Refresh
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {invitations.map((invitation) => (
          <InvitationItem
            key={invitation.id}
            invitation={invitation}
            onResend={() => onResend(invitation.id, invitation.email)}
            onRevoke={() => onRevoke(invitation.id, invitation.email)}
          />
        ))}
      </div>
    </div>
  );
});

PendingInvitations.displayName = 'PendingInvitations';

// ============================================================================
// Invitation Item
// ============================================================================

interface InvitationItemProps {
  invitation: Invitation;
  onResend: () => void;
  onRevoke: () => void;
}

const InvitationItem = memo(({ invitation, onResend, onRevoke }: InvitationItemProps) => {
  const [showActions, setShowActions] = useState(false);
  const isExpired = new Date(invitation.expiresAt) < new Date();
  const expiresIn = getTimeUntilExpiry(invitation.expiresAt);

  return (
    <div
      className="flex items-center gap-3 p-4 bg-recoder-elements-background-depth-2 rounded-lg group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium shrink-0">
        {invitation.email.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-recoder-elements-textPrimary truncate">
            {invitation.email}
          </span>
          <RoleBadge role={invitation.role} />
          {isExpired && (
            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
              Expired
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-recoder-elements-textTertiary mt-0.5">
          <span>Invited by {invitation.invitedByName}</span>
          <span>-</span>
          <span>{formatDate(invitation.createdAt)}</span>
          {!isExpired && (
            <>
              <span>-</span>
              <span>Expires {expiresIn}</span>
            </>
          )}
        </div>
        {invitation.teams.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-recoder-elements-textTertiary">Teams:</span>
            {invitation.teams.map((teamId) => (
              <span
                key={teamId}
                className="px-1.5 py-0.5 bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary text-xs rounded"
              >
                {teamId}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={classNames(
        'flex items-center gap-1 transition-opacity',
        showActions ? 'opacity-100' : 'opacity-0'
      )}>
        <button
          onClick={onResend}
          className="p-2 text-recoder-elements-textTertiary hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
          title="Resend invitation"
        >
          <span className="i-ph:paper-plane-tilt" />
        </button>
        <button
          onClick={onRevoke}
          className="p-2 text-recoder-elements-textTertiary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Revoke invitation"
        >
          <span className="i-ph:x" />
        </button>
      </div>
    </div>
  );
});

InvitationItem.displayName = 'InvitationItem';

// ============================================================================
// Helper Components
// ============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}

const TabButton = memo(({ active, onClick, label, icon }: TabButtonProps) => (
  <button
    onClick={onClick}
    className={classNames(
      'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
      active
        ? 'text-blue-400 border-blue-500'
        : 'text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary border-transparent'
    )}
  >
    <span className={icon} />
    {label}
  </button>
));

TabButton.displayName = 'TabButton';

interface RoleBadgeProps {
  role: OrganizationRole;
}

const RoleBadge = memo(({ role }: RoleBadgeProps) => {
  const colors: Record<OrganizationRole, string> = {
    owner: 'bg-yellow-500/20 text-yellow-400',
    admin: 'bg-purple-500/20 text-purple-400',
    member: 'bg-blue-500/20 text-blue-400',
    viewer: 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary',
  };

  return (
    <span className={classNames('px-1.5 py-0.5 text-xs font-medium rounded capitalize', colors[role])}>
      {role}
    </span>
  );
});

RoleBadge.displayName = 'RoleBadge';

// ============================================================================
// Utility Functions
// ============================================================================

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim().toLowerCase());
}

function getBulkEmailCount(bulkEmails: string): number {
  return bulkEmails
    .split(/[\n,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => isValidEmail(e)).length;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTimeUntilExpiry(expiresAt: string): string {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) return 'expired';

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `in ${diffDays} day(s)`;
  if (diffHours > 0) return `in ${diffHours} hour(s)`;
  return 'soon';
}

export default InvitationModal;
