'use client';

import { useState } from 'react';
// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { TrashIcon, UserIcon, AlertCircleIcon } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/button';
import { DialogRoot, Dialog, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';
import { RoleBadge } from './status-badges';
import type { MemberTableProps, Member } from './types';

export function MemberTable({
  members,
  isLoading,
  organizationId,
  onUpdateRole,
  onRemoveMember
}: MemberTableProps) {
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    await onRemoveMember(
      memberToRemove.id,
      organizationId,
      memberToRemove.user?.name,
      memberToRemove.user?.email
    );

    setMemberToRemove(null);
    setShowConfirmDialog(false);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getInitials = (member: Member) => {
    if (member.user?.name) {
      return member.user.name.substring(0, 2).toUpperCase();
    }
    if (member.user?.email) {
      return member.user.email.charAt(0).toUpperCase();
    }
    return 'U';
  };

  const getDisplayName = (member: Member) => {
    if (member.user?.name) return member.user.name;
    if (member.user?.email) return member.user.email.split('@')[0];
    return 'Unnamed User';
  };

  return (
    <>
      <div className="border border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-3/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider hidden md:table-cell">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider hidden md:table-cell">
                  Joined
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-recoder-elements-borderColor">
              {isLoading ? (
                // Loading state
                Array(3)
                  .fill(0)
                  .map((_, index) => (
                    <tr key={`skeleton-${index}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-recoder-elements-background-depth-3 animate-pulse" />
                          <div className="space-y-1">
                            <div className="h-4 w-24 bg-recoder-elements-background-depth-3 rounded animate-pulse" />
                            <div className="h-3 w-32 bg-recoder-elements-background-depth-3 rounded animate-pulse" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="h-5 w-16 bg-recoder-elements-background-depth-3 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="h-4 w-24 bg-recoder-elements-background-depth-3 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <div className="h-9 w-16 bg-recoder-elements-background-depth-3 rounded animate-pulse" />
                          <div className="h-9 w-9 bg-recoder-elements-background-depth-3 rounded animate-pulse" />
                        </div>
                      </td>
                    </tr>
                  ))
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-recoder-elements-textSecondary">
                      <UserIcon className="h-8 w-8 opacity-40" />
                      <p>No team members yet</p>
                      <p className="text-sm text-recoder-elements-textTertiary">
                        Invite your first team member above
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr
                    key={member.id}
                    className="group hover:bg-recoder-elements-background-depth-3/30 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {member.user?.image ? (
                          <img
                            src={member.user.image}
                            alt={getDisplayName(member)}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-orange-500/20 flex items-center justify-center text-sm font-medium text-orange-400">
                            {getInitials(member)}
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <div className="font-medium text-recoder-elements-textPrimary">
                            {getDisplayName(member)}
                          </div>
                          <div className="text-xs text-recoder-elements-textTertiary line-clamp-1">
                            {member.user?.email || ''}
                          </div>
                          <div className="md:hidden mt-1">
                            <RoleBadge role={member.role} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <RoleBadge role={member.role} />
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell text-recoder-elements-textSecondary text-sm">
                      {formatDate(member.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {member.role !== 'owner' ? (
                        <div className="flex justify-end gap-2">
                          <select
                            value={member.role}
                            onChange={(e) => onUpdateRole(member.id, e.target.value)}
                            disabled={isLoading}
                            className={classNames(
                              'h-9 px-3 rounded-md text-sm',
                              'bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor',
                              'text-recoder-elements-textPrimary',
                              'focus:outline-none focus:ring-2 focus:ring-orange-500/50',
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 opacity-70 hover:opacity-100 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                            disabled={isLoading}
                            onClick={() => {
                              setMemberToRemove(member);
                              setShowConfirmDialog(true);
                            }}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-recoder-elements-textTertiary text-sm italic pr-2">
                          Owner
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Remove Dialog */}
      <DialogRoot open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        {showConfirmDialog && (
          <Dialog
            onClose={() => setShowConfirmDialog(false)}
            onBackdrop={() => setShowConfirmDialog(false)}
          >
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5" />
              Remove Team Member
            </DialogTitle>
            <DialogDescription>
              <div className="space-y-4">
                <p>
                  Are you sure you want to remove{' '}
                  <strong>
                    {memberToRemove?.user?.name || memberToRemove?.user?.email}
                  </strong>{' '}
                  from the team?
                </p>

                <div className="bg-recoder-elements-background-depth-3 p-4 rounded-md">
                  <div className="flex items-center gap-3">
                    {memberToRemove?.user?.image ? (
                      <img
                        src={memberToRemove.user.image}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center text-sm font-medium text-orange-400">
                        {memberToRemove && getInitials(memberToRemove)}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-recoder-elements-textPrimary">
                        {memberToRemove && getDisplayName(memberToRemove)}
                      </div>
                      <div className="text-sm text-recoder-elements-textSecondary">
                        {memberToRemove?.user?.email || ''}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <DialogButton
                    type="secondary"
                    onClick={() => setShowConfirmDialog(false)}
                  >
                    Cancel
                  </DialogButton>
                  <DialogButton type="danger" onClick={handleRemoveMember}>
                    {isLoading ? 'Removing...' : 'Remove Member'}
                  </DialogButton>
                </div>
              </div>
            </DialogDescription>
          </Dialog>
        )}
      </DialogRoot>
    </>
  );
}
