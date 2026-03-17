'use client';

import { memo } from 'react';
import Image from 'next/image';

interface EmptyStateProps {
  t: (key: string) => string;
}

export const EmptyState = memo(function EmptyState({ t }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      {/* Empty state container */}
      <div className="flex flex-col items-center space-y-6">
        {/* Logo */}
        <div className="relative">
          <Image
            src="/logo.png"
            alt="Recoder"
            width={48}
            height={48}
            className="relative z-10 rounded"
            priority
          />
        </div>

        {/* Empty state text */}
        <div className="flex flex-col items-center space-y-2 max-w-xs text-center">
          <p className="text-sm text-zinc-400 dark:text-zinc-500 font-light">
            {t('emptyActionsDescription')}
          </p>
        </div>
      </div>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
