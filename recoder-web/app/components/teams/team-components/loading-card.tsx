'use client';

import { classNames } from '~/utils/classNames';

interface LoadingCardProps {
  className?: string;
}

export function LoadingCard({ className }: LoadingCardProps) {
  return (
    <div className={classNames('p-6', className)}>
      <div className="border border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 rounded-lg">
        <div className="p-6 border-b border-recoder-elements-borderColor">
          <h2 className="text-xl font-semibold text-recoder-elements-textPrimary">
            Team Management
          </h2>
          <p className="text-sm text-recoder-elements-textSecondary mt-1">
            Manage your team members and invitations
          </p>
        </div>
        <div className="p-12 flex justify-center items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-pulse h-8 w-8 rounded-full bg-recoder-elements-background-depth-3" />
            <p className="text-recoder-elements-textSecondary text-sm">
              Loading organization data...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
