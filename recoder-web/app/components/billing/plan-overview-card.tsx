'use client';

// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { CreditCard } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/button';

interface PlanOverviewCardProps {
  planName: string;
  periodEnd?: Date;
  showUpgrade: boolean;
  onUpgradeClick?: () => void;
  className?: string;
}

export function PlanOverviewCard({
  planName,
  periodEnd,
  showUpgrade,
  onUpgradeClick,
  className,
}: PlanOverviewCardProps) {
  return (
    <div
      className={classNames(
        'border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-lg',
        className
      )}
    >
      <div className="p-4 lg:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: Title and description */}
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-bolt-elements-textSecondary" />
            <div>
              <h1 className="text-lg lg:text-xl font-semibold text-bolt-elements-textPrimary">
                Billing & Usage
              </h1>
              <p className="text-sm text-bolt-elements-textSecondary">
                Manage your subscription and usage
              </p>
            </div>
          </div>

          {/* Right: Plan info and upgrade button */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3">
            {/* Current plan info */}
            <div className="flex flex-col items-start lg:items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-bolt-elements-textPrimary">
                  Current Plan: <span className="text-orange-500">{planName}</span>
                </span>
              </div>

              {periodEnd && (
                <p className="text-xs text-bolt-elements-textTertiary">
                  Billing period ends: {periodEnd.toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Upgrade button */}
            {showUpgrade && (
              <Button variant="outline" size="sm" onClick={onUpgradeClick}>
                Upgrade Plan
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
