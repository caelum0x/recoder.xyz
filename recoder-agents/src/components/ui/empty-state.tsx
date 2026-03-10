'use client';

import Link from 'next/link';
import {
  SearchX,
  AlertCircle,
  Lock,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  variant?: 'default' | 'no-results' | 'error' | 'no-access';
  className?: string;
}

const variantDefaults: Record<
  NonNullable<EmptyStateProps['variant']>,
  {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    iconBgClass: string;
    iconColorClass: string;
  }
> = {
  default: {
    icon: Inbox,
    title: 'Nothing here yet',
    iconBgClass: 'bg-muted',
    iconColorClass: 'text-foreground/40',
  },
  'no-results': {
    icon: SearchX,
    title: 'No results found',
    iconBgClass: 'bg-muted',
    iconColorClass: 'text-foreground/40',
  },
  error: {
    icon: AlertCircle,
    title: 'Something went wrong',
    iconBgClass: 'bg-red-500/10',
    iconColorClass: 'text-red-500',
  },
  'no-access': {
    icon: Lock,
    title: "You don't have access",
    iconBgClass: 'bg-amber-500/10',
    iconColorClass: 'text-amber-500',
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'default',
  className,
}: EmptyStateProps) {
  const defaults = variantDefaults[variant];
  const Icon = icon ?? defaults.icon;
  const displayTitle = title || defaults.title;

  const actionButton = action ? (
    action.href ? (
      <Button asChild size="sm" className="mt-1">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    ) : (
      <Button size="sm" onClick={action.onClick} className="mt-1">
        {action.label}
      </Button>
    )
  ) : null;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center',
        className
      )}
    >
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full mb-4',
          defaults.iconBgClass
        )}
      >
        <Icon className={cn('h-6 w-6', defaults.iconColorClass)} />
      </div>
      <h3 className="text-base font-medium text-foreground mb-1">
        {displayTitle}
      </h3>
      {description && (
        <p className="text-sm text-foreground/60 max-w-sm mb-3">
          {description}
        </p>
      )}
      {actionButton}
    </div>
  );
}
