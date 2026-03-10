'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useSubscriptionStatus } from '@/hooks/billing/use-subscription-status';

interface SubscriptionStatusBadgeProps {
  /** Additional className */
  className?: string;
}

/**
 * SubscriptionStatusBadge
 *
 * Compact pill that shows the user's current plan.
 * - Free plan: orange pill with "Upgrade" link to recoder.xyz/billing/upgrade
 * - Paid plan: green pill with the plan name
 *
 * Designed to fit in a sidebar or header.
 */
export function SubscriptionStatusBadge({ className }: SubscriptionStatusBadgeProps) {
  const { data: subscription, isLoading } = useSubscriptionStatus();

  if (isLoading) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          'bg-muted text-muted-foreground animate-pulse',
          className,
        )}
      >
        ...
      </span>
    );
  }

  if (!subscription) {
    return null;
  }

  const isFree = subscription.tier === 'free';

  if (isFree) {
    return (
      <Link
        href="https://recoder.xyz/billing/upgrade"
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
          'bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors',
          'dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50',
          className,
        )}
      >
        Upgrade
      </Link>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        'bg-green-100 text-green-700',
        'dark:bg-green-900/30 dark:text-green-400',
        className,
      )}
    >
      {subscription.planName}
    </span>
  );
}
