'use client';

// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { ShieldIcon, UserIcon, CheckIcon, ClockIcon, XCircleIcon, BanIcon, InboxIcon } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import type { MemberStatus, InvitationStatus, Invitation } from './types';

// Render member role badge
export function RoleBadge({ role }: { role: string }) {
  const baseClasses =
    'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full';

  switch (role) {
    case 'owner':
      return (
        <span className={classNames(baseClasses, 'bg-orange-500/20 text-orange-400')}>
          <ShieldIcon className="h-3 w-3" />
          Owner
        </span>
      );
    case 'admin':
      return (
        <span className={classNames(baseClasses, 'bg-accent-500/20 text-accent-400')}>
          <ShieldIcon className="h-3 w-3" />
          Admin
        </span>
      );
    default:
      return (
        <span
          className={classNames(
            baseClasses,
            'bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary border border-recoder-elements-borderColor'
          )}
        >
          <UserIcon className="h-3 w-3" />
          Member
        </span>
      );
  }
}

// Get member status - simulated status logic
export function getMemberStatus(role: string): MemberStatus {
  if (role === 'owner') return 'active';

  // Return random status for demo
  const statuses: MemberStatus[] = ['active', 'inactive', 'pending', 'blocked'];
  const randomIndex = Math.floor(Math.random() * 10) % 4;

  return statuses[randomIndex] || 'active';
}

// Render member status badge
export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const baseClasses =
    'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border';

  switch (status) {
    case 'active':
      return (
        <span className={classNames(baseClasses, 'bg-green-500/10 text-green-400 border-green-500/20')}>
          <CheckIcon className="h-3 w-3" />
          Active
        </span>
      );
    case 'inactive':
      return (
        <span className={classNames(baseClasses, 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
          <ClockIcon className="h-3 w-3" />
          Inactive
        </span>
      );
    case 'pending':
      return (
        <span className={classNames(baseClasses, 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>
          <ClockIcon className="h-3 w-3" />
          Pending
        </span>
      );
    case 'blocked':
      return (
        <span className={classNames(baseClasses, 'bg-red-500/10 text-red-400 border-red-500/20')}>
          <BanIcon className="h-3 w-3" />
          Blocked
        </span>
      );
    default:
      return (
        <span className={classNames(baseClasses, 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
          <UserIcon className="h-3 w-3" />
          Unknown
        </span>
      );
  }
}

// Get invitation status based on expiration time or status field
export function getInvitationStatus(invitation: {
  status: string;
  expiresAt: Date | string;
}): InvitationStatus {
  const now = new Date();
  const expiresAt = new Date(invitation.expiresAt);

  if (now > expiresAt) {
    return 'expired';
  }

  if (invitation.status === 'accepted') return 'accepted';
  if (invitation.status === 'canceled') return 'canceled';
  if (invitation.status === 'rejected') return 'rejected';

  return 'pending';
}

// Render invitation status badge
export function InvitationStatusBadge({
  status
}: {
  status: InvitationStatus;
}) {
  const baseClasses =
    'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border';

  switch (status) {
    case 'pending':
      return (
        <span className={classNames(baseClasses, 'bg-accent-500/10 text-accent-400 border-accent-500/20')}>
          <InboxIcon className="h-3 w-3" />
          Pending
        </span>
      );
    case 'accepted':
      return (
        <span className={classNames(baseClasses, 'bg-green-500/10 text-green-400 border-green-500/20')}>
          <CheckIcon className="h-3 w-3" />
          Accepted
        </span>
      );
    case 'expired':
      return (
        <span className={classNames(baseClasses, 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
          <XCircleIcon className="h-3 w-3" />
          Expired
        </span>
      );
    case 'canceled':
      return (
        <span className={classNames(baseClasses, 'bg-red-500/10 text-red-400 border-red-500/20')}>
          <XCircleIcon className="h-3 w-3" />
          Canceled
        </span>
      );
    case 'rejected':
      return (
        <span className={classNames(baseClasses, 'bg-red-500/10 text-red-400 border-red-500/20')}>
          <XCircleIcon className="h-3 w-3" />
          Rejected
        </span>
      );
    default:
      return (
        <span className={classNames(baseClasses, 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
          <UserIcon className="h-3 w-3" />
          Unknown
        </span>
      );
  }
}
