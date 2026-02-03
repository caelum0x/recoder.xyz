'use client';

import { useState } from 'react';
// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { TrashIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/button';
import { DialogRoot, Dialog, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';
import { RoleBadge, InvitationStatusBadge, getInvitationStatus } from './status-badges';
import type { InvitationTableProps, Invitation } from './types';

export function InvitationTable({
  invitations,
  isLoading,
  onCancelInvitation
}: InvitationTableProps) {
  const [invitationToCancel, setInvitationToCancel] = useState<Invitation | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleCancelInvitation = async () => {
    if (!invitationToCancel) return;

    await onCancelInvitation(invitationToCancel.id, invitationToCancel.email);
    setInvitationToCancel(null);
    setShowConfirmDialog(false);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <>
      <div className="border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-bolt-elements-textSecondary uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-bolt-elements-textSecondary uppercase tracking-wider hidden md:table-cell">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-bolt-elements-textSecondary uppercase tracking-wider hidden md:table-cell">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-bolt-elements-textSecondary uppercase tracking-wider hidden md:table-cell">
                  Expires
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-bolt-elements-textSecondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bolt-elements-borderColor">
              {isLoading ? (
                // Loading state
                Array(2)
                  .fill(0)
                  .map((_, index) => (
                    <tr key={`inv-skeleton-${index}`}>
                      <td className="px-4 py-4">
                        <div className="h-5 w-40 bg-bolt-elements-background-depth-3 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="h-5 w-16 bg-bolt-elements-background-depth-3 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="h-5 w-16 bg-bolt-elements-background-depth-3 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="h-4 w-24 bg-bolt-elements-background-depth-3 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="h-9 w-9 bg-bolt-elements-background-depth-3 rounded ml-auto animate-pulse" />
                      </td>
                    </tr>
                  ))
              ) : invitations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-bolt-elements-textSecondary">
                      <CheckCircleIcon className="h-8 w-8 opacity-40" />
                      <p>No pending invitations</p>
                      <p className="text-sm text-bolt-elements-textTertiary">
                        All invitations have been processed
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                invitations.map((invitation) => {
                  const invitationStatus = getInvitationStatus(invitation);
                  const canCancel = invitationStatus === 'pending';

                  return (
                    <tr
                      key={invitation.id}
                      className={classNames(
                        'group hover:bg-bolt-elements-background-depth-3/30 transition-colors',
                        (invitationStatus === 'canceled' || invitationStatus === 'expired') && 'opacity-60'
                      )}
                    >
                      <td className="px-4 py-4">
                        <div>
                          <div className="font-medium text-bolt-elements-textPrimary">
                            {invitation.email}
                          </div>
                          <div className="md:hidden mt-1 flex flex-wrap gap-1.5">
                            <RoleBadge role={invitation.role} />
                            <InvitationStatusBadge status={invitationStatus} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <RoleBadge role={invitation.role} />
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <InvitationStatusBadge status={invitationStatus} />
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell text-bolt-elements-textSecondary text-sm">
                        {formatDate(invitation.expiresAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 opacity-70 hover:opacity-100 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          disabled={isLoading || !canCancel}
                          onClick={() => {
                            setInvitationToCancel(invitation);
                            setShowConfirmDialog(true);
                          }}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Cancel Dialog */}
      <DialogRoot open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        {showConfirmDialog && (
          <Dialog
            onClose={() => setShowConfirmDialog(false)}
            onBackdrop={() => setShowConfirmDialog(false)}
          >
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5" />
              Cancel Invitation
            </DialogTitle>
            <DialogDescription>
              <div className="space-y-4">
                <p>
                  Are you sure you want to cancel the invitation for{' '}
                  <strong>{invitationToCancel?.email}</strong>?
                </p>

                <div className="bg-bolt-elements-background-depth-3 p-4 rounded-md space-y-2">
                  <div>
                    <div className="text-sm text-bolt-elements-textSecondary">
                      Email
                    </div>
                    <div className="text-bolt-elements-textPrimary mt-1">
                      {invitationToCancel?.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-bolt-elements-textSecondary">
                      Role:
                    </span>
                    {invitationToCancel && <RoleBadge role={invitationToCancel.role} />}
                  </div>
                  {invitationToCancel && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-bolt-elements-textSecondary">
                        Status:
                      </span>
                      <InvitationStatusBadge
                        status={getInvitationStatus(invitationToCancel)}
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <DialogButton
                    type="secondary"
                    onClick={() => setShowConfirmDialog(false)}
                  >
                    Keep Invitation
                  </DialogButton>
                  <DialogButton type="danger" onClick={handleCancelInvitation}>
                    {isLoading ? 'Canceling...' : 'Cancel Invitation'}
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
