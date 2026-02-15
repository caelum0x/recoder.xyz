'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { RefreshCcwIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/button';

// Import custom sub-components
import { InviteForm } from './team-components/invite-form';
import { MemberTable } from './team-components/member-table';
import { InvitationTable } from './team-components/invitation-table';
import { LoadingCard } from './team-components/loading-card';

// Import type definitions
import { createScopedLogger } from '~/utils/logger';
import type {
  Member,
  Invitation,
  HandleInviteMemberParams
} from './team-components/types';

const logger = createScopedLogger('TeamsManagement');

interface TeamsManagementProps {
  // Organization data from parent/context
  organizationId?: string;
  organizationName?: string;
  // Callbacks for API operations - parent component handles actual API calls
  onFetchMembers?: (orgId: string) => Promise<Member[]>;
  onFetchInvitations?: (orgId: string) => Promise<Invitation[]>;
  onInviteMember?: (orgId: string, params: HandleInviteMemberParams) => Promise<void>;
  onCancelInvitation?: (invitationId: string) => Promise<void>;
  onRemoveMember?: (memberId: string, orgId: string) => Promise<void>;
  onUpdateMemberRole?: (memberId: string, role: string) => Promise<void>;
}

export function TeamsManagement({
  organizationId,
  organizationName = 'Your Organization',
  onFetchMembers,
  onFetchInvitations,
  onInviteMember,
  onCancelInvitation,
  onRemoveMember,
  onUpdateMemberRole
}: TeamsManagementProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');

  const initialized = useRef(false);

  const fetchOrganizationData = useCallback(async (orgId: string) => {
    try {
      setIsLoading(true);

      // Fetch invitations
      if (onFetchInvitations) {
        const invitationsData = await onFetchInvitations(orgId);
        setInvitations(invitationsData || []);
      }

      // Fetch members
      if (onFetchMembers) {
        const membersData = await onFetchMembers(orgId);
        setMembers(membersData || []);
      }
    } catch (error) {
      logger.error('Failed to fetch team data:', error);
      toast.error('Failed to fetch team data');
    } finally {
      setIsLoading(false);
    }
  }, [onFetchInvitations, onFetchMembers]);

  useEffect(() => {
    if (initialized.current && members.length > 0) {
      return;
    }

    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    initialized.current = true;
    fetchOrganizationData(organizationId);
  }, [organizationId, members.length, fetchOrganizationData]);

  // Manually refresh data
  const refreshData = async () => {
    if (!organizationId) return;

    toast.info('Refreshing team data...');
    await fetchOrganizationData(organizationId);
    toast.success('Team data refreshed');
  };

  // Handle invite form submission
  const handleInviteMember = async (params: HandleInviteMemberParams) => {
    if (!organizationId) {
      toast.error('No organization selected');
      return;
    }

    try {
      setIsLoading(true);

      if (onInviteMember) {
        await onInviteMember(organizationId, params);
      }

      toast.success(`Invitation sent to ${params.email}`);

      // Optimistically add the invitation to the list
      const newInvitation: Invitation = {
        id: `temp-${Date.now()}`,
        email: params.email,
        role: params.role,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        organizationId: organizationId,
        inviterId: '',
        teamId: undefined
      };

      setInvitations((prev) => [...prev, newInvitation]);
    } catch (error) {
      logger.error('Failed to send invitation:', error);
      toast.error('Failed to send invitation');
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel Invitation
  const handleCancelInvitation = async (invitationId: string, email: string) => {
    try {
      setIsLoading(true);

      if (onCancelInvitation) {
        await onCancelInvitation(invitationId);
      }

      toast.success(`Invitation to ${email} canceled`);

      // Update invitation status
      setInvitations((current) =>
        current.map((inv) =>
          inv.id === invitationId ? { ...inv, status: 'canceled' } : inv
        )
      );
    } catch (error) {
      logger.error('Failed to cancel invitation:', error);
      toast.error('Failed to cancel invitation');
    } finally {
      setIsLoading(false);
    }
  };

  // Remove member
  const handleRemoveMember = async (
    memberId: string,
    orgId: string,
    name = '',
    email = ''
  ) => {
    try {
      setIsLoading(true);

      if (onRemoveMember) {
        await onRemoveMember(memberId, orgId);
      }

      toast.success(`${name || email || 'Member'} removed from team`);

      // Update member list
      setMembers(members.filter((member) => member.id !== memberId));
    } catch (error) {
      logger.error('Failed to remove member:', error);
      toast.error('Failed to remove member');
    } finally {
      setIsLoading(false);
    }
  };

  // Update member roles
  const handleUpdateMemberRole = async (memberId: string, role: string) => {
    try {
      setIsLoading(true);

      if (onUpdateMemberRole) {
        await onUpdateMemberRole(memberId, role);
      }

      toast.success('Member role updated');

      // Update current state
      setMembers((current) =>
        current.map((member) =>
          member.id === memberId ? { ...member, role } : member
        )
      );
    } catch (error) {
      logger.error('Failed to update member role:', error);
      toast.error('Failed to update member role');
    } finally {
      setIsLoading(false);
    }
  };

  // If no organization data yet, display loading status
  if (!organizationId) {
    return <LoadingCard />;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-bolt-elements-textPrimary">
            Team Management
          </h1>
          <p className="text-bolt-elements-textSecondary mt-1">
            Manage your team members and invitations
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={refreshData}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCcwIcon
            className={classNames('h-4 w-4 mr-2', isLoading && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>

      {/* Organization Card */}
      <div className="mb-8">
        <div className="border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-lg overflow-hidden">
          <div className="p-6 bg-bolt-elements-background-depth-3/30">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                  Current Organization
                </h2>
                <p className="text-bolt-elements-textSecondary">
                  {organizationName}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Form */}
      <InviteForm onInvite={handleInviteMember} isLoading={isLoading} />

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex border-b border-bolt-elements-borderColor">
          <button
            onClick={() => setActiveTab('members')}
            className={classNames(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'members'
                ? 'border-orange-500 text-orange-500'
                : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            )}
          >
            Members ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={classNames(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'invitations'
                ? 'border-orange-500 text-orange-500'
                : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            )}
          >
            Invitations ({invitations.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'members' ? (
          <MemberTable
            members={members}
            isLoading={isLoading}
            organizationId={organizationId}
            onUpdateRole={handleUpdateMemberRole}
            onRemoveMember={handleRemoveMember}
          />
        ) : (
          <InvitationTable
            invitations={invitations}
            isLoading={isLoading}
            onCancelInvitation={handleCancelInvitation}
          />
        )}
      </div>
    </div>
  );
}
