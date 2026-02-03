'use client';

import { useState } from 'react';
// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { UserPlusIcon, MailIcon, UserIcon, PlusCircleIcon } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/button';
import type { InviteFormProps, HandleInviteMemberParams } from './types';

export function InviteForm({ onInvite, isLoading }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState<string | null>(null);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    await onInvite({ email, role } as HandleInviteMemberParams);
    setEmail('');
    setRole('member');
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-8 border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-lg shadow-sm">
        <div className="p-6 pb-3 border-b border-bolt-elements-borderColor">
          <h3 className="text-xl font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
            <UserPlusIcon className="h-5 w-5 text-orange-500" />
            Invite Team Member
          </h3>
          <p className="text-sm text-bolt-elements-textSecondary mt-1">
            Send an invitation to add a new member to your team
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {/* Email input */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="flex items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary"
              >
                <MailIcon className="h-3.5 w-3.5 text-bolt-elements-textSecondary" />
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
                disabled={isLoading}
                className={classNames(
                  'w-full px-3 py-2 rounded-md text-sm',
                  'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary',
                  'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-all duration-200 hover:border-bolt-elements-borderColor/80'
                )}
              />
              {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
            </div>

            {/* Role selection */}
            <div className="space-y-2">
              <label
                htmlFor="role"
                className="flex items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary"
              >
                <UserIcon className="h-3.5 w-3.5 text-bolt-elements-textSecondary" />
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={isLoading}
                className={classNames(
                  'w-full px-3 py-2 rounded-md text-sm h-[38px]',
                  'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary',
                  'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-all duration-200 hover:border-bolt-elements-borderColor/80'
                )}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 flex justify-end border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-3/50">
          <Button
            type="submit"
            disabled={isLoading}
            className="gap-2 shadow-sm transition-all duration-200 hover:shadow"
          >
            <PlusCircleIcon className="h-4 w-4" />
            {isLoading ? 'Sending...' : 'Send Invitation'}
          </Button>
        </div>
      </div>
    </form>
  );
}
