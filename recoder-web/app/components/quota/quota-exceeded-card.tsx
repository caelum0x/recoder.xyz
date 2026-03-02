'use client';

// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { AlertCircle, Zap, Clock, ArrowRight } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/button';

interface QuotaExceededCardProps {
  currentUsage?: number;
  totalQuota?: number;
  billingCycleEnd?: Date;
  planName?: string;
  onUpgradeClick?: () => void;
  onLearnMoreClick?: () => void;
  className?: string;
}

export function QuotaExceededCard({
  currentUsage = 0,
  totalQuota = 100,
  billingCycleEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  planName = 'Free',
  onUpgradeClick,
  onLearnMoreClick,
  className
}: QuotaExceededCardProps) {
  const usagePercentage = (currentUsage / totalQuota) * 100;
  const daysUntilReset = Math.ceil(
    (billingCycleEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div
      className={classNames(
        'relative overflow-hidden border border-orange-500/30 bg-gradient-to-br from-orange-500/5 via-accent-500/5 to-recoder-elements-background-depth-2 rounded-lg',
        className
      )}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent pointer-events-none" />

      {/* Header */}
      <div className="relative p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-accent-500 text-white shadow-lg">
                <Zap className="h-6 w-6" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-recoder-elements-textPrimary">
                AI Quota Exceeded
              </h2>
              <p className="text-sm text-recoder-elements-textSecondary mt-1">
                You've used all your AI credits for this billing period
              </p>
            </div>
          </div>
          <span className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
            {planName} Plan
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="relative px-6 pb-6 space-y-6">
        {/* Usage Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-recoder-elements-textSecondary">
              Usage this period
            </span>
            <span className="font-medium text-red-500">
              {currentUsage.toLocaleString()} / {totalQuota.toLocaleString()} credits
            </span>
          </div>
          <div className="w-full bg-recoder-elements-background-depth-3 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300"
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-recoder-elements-textTertiary">
            <Clock className="h-3 w-3" />
            <span>
              Resets in {daysUntilReset} {daysUntilReset === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>

        {/* Options Alert */}
        <div className="flex items-start gap-3 p-3 rounded-lg border border-accent-500/20 bg-accent-500/5">
          <AlertCircle className="h-4 w-4 text-accent-500 mt-0.5 shrink-0" />
          <p className="text-sm text-recoder-elements-textSecondary">
            To continue using AI features, you can either upgrade your plan for
            more credits or wait for your quota to reset next billing cycle.
          </p>
        </div>

        {/* Alternative Actions */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-4 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-3 space-y-2">
            <h4 className="font-medium text-sm text-recoder-elements-textPrimary">
              Need more credits?
            </h4>
            <p className="text-xs text-recoder-elements-textSecondary">
              Upgrade to a higher plan for increased limits and premium features
            </p>
          </div>
          <div className="p-4 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-3 space-y-2">
            <h4 className="font-medium text-sm text-recoder-elements-textPrimary">
              On a budget?
            </h4>
            <p className="text-xs text-recoder-elements-textSecondary">
              Your quota will automatically reset at the start of your next
              billing cycle
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative flex flex-col sm:flex-row gap-3 px-6 py-4 border-t border-recoder-elements-borderColor bg-recoder-elements-background-depth-3/50">
        <Button
          onClick={onUpgradeClick}
          className="flex-1 sm:flex-initial bg-gradient-to-r from-orange-500 to-accent-500 hover:from-orange-600 hover:to-accent-600 text-white shadow-md hover:shadow-lg transition-all duration-200"
        >
          Upgrade Plan
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          onClick={onLearnMoreClick}
          className="flex-1 sm:flex-initial"
        >
          View Usage Details
        </Button>
      </div>
    </div>
  );
}
