'use client';

// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import type { LucideIcon } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import type { UsageStatus } from './status-indicator';

interface UsageCardProps {
  icon: LucideIcon;
  title: string;
  used: number;
  total: number;
  description: string;
  status: UsageStatus;
  actionButton?: React.ReactNode;
  className?: string;
}

export function UsageCard({
  icon: Icon,
  title,
  used,
  total,
  description,
  status,
  actionButton,
  className
}: UsageCardProps) {
  const remaining = Math.max(0, total - used);

  // Simplified binary status: normal or insufficient
  const isInsufficient = remaining <= 0 || status === 'danger';

  return (
    <div
      className={classNames(
        'border border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 rounded-lg hover:bg-recoder-elements-background-depth-3 transition-colors',
        className
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Icon className="h-4 w-4 text-recoder-elements-textSecondary" />
          <h3 className="font-medium text-sm text-recoder-elements-textPrimary flex-1">
            {title}
          </h3>
        </div>

        {/* Usage display */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span
                className={classNames(
                  'text-lg font-semibold',
                  isInsufficient ? 'text-red-500' : 'text-recoder-elements-textPrimary'
                )}
              >
                {used.toLocaleString()}
              </span>
              <span className="text-sm text-recoder-elements-textSecondary">
                / {total.toLocaleString()}
              </span>
            </div>
            {isInsufficient && (
              <span className="text-xs text-red-500 font-medium">
                Quota Exceeded
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-recoder-elements-background-depth-3 rounded-full h-1.5">
            <div
              className={classNames(
                'h-1.5 rounded-full transition-all duration-300',
                isInsufficient ? 'bg-red-500' : status === 'warning' ? 'bg-accent-500' : 'bg-green-500'
              )}
              style={{ width: `${Math.min((used / total) * 100, 100)}%` }}
            />
          </div>

          {/* Description */}
          <p className="text-xs text-recoder-elements-textTertiary">{description}</p>

          {/* Action button */}
          {actionButton && <div className="pt-2">{actionButton}</div>}
        </div>
      </div>
    </div>
  );
}

// Simplified compact version for quick stats
export function UsageCardCompact({
  icon: Icon,
  title,
  value,
  status,
  className
}: {
  icon: LucideIcon;
  title: string;
  value: string | number;
  status: UsageStatus;
  className?: string;
}) {
  const getTextColor = () => {
    if (status === 'danger') return 'text-red-500';
    return 'text-recoder-elements-textPrimary';
  };

  return (
    <div className={classNames('text-center space-y-2', className)}>
      <Icon className="h-4 w-4 text-recoder-elements-textSecondary mx-auto" />
      <div className={classNames('text-lg font-semibold', getTextColor())}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-recoder-elements-textTertiary">{title}</div>
    </div>
  );
}
