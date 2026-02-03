'use client';

import { classNames } from '~/utils/classNames';

interface LoadingCardProps {
  className?: string;
}

export function LoadingCard({ className }: LoadingCardProps) {
  return (
    <div className={classNames('p-6', className)}>
      <div className="border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-lg">
        <div className="p-6 border-b border-bolt-elements-borderColor">
          <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
            Team Management
          </h2>
          <p className="text-sm text-bolt-elements-textSecondary mt-1">
            Manage your team members and invitations
          </p>
        </div>
        <div className="p-12 flex justify-center items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-pulse h-8 w-8 rounded-full bg-bolt-elements-background-depth-3" />
            <p className="text-bolt-elements-textSecondary text-sm">
              Loading organization data...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
