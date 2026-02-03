'use client';

// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { AlertTriangle } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/button';

interface UpgradeRecommendationProps {
  planName: string;
  hasUrgentIssues: boolean;
  onUpgradeClick?: () => void;
  onViewPlansClick?: () => void;
  className?: string;
}

export function UpgradeRecommendation({
  planName,
  hasUrgentIssues,
  onUpgradeClick,
  onViewPlansClick,
  className,
}: UpgradeRecommendationProps) {
  // Don't show for MAX plan
  if (planName === 'MAX') {
    return null;
  }

  // Urgent upgrade banner for critical issues
  if (hasUrgentIssues) {
    return (
      <div
        className={classNames(
          'border border-accent-500/30 bg-accent-500/10 rounded-lg',
          className
        )}
      >
        <div className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-accent-500" />
              <div>
                <h3 className="font-medium text-sm text-accent-400">
                  Upgrade Recommended
                </h3>
                <p className="text-xs text-accent-300/80">
                  Your resources are running low. Upgrade for more capacity.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onUpgradeClick}>
              Upgrade Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Regular upgrade recommendation
  return (
    <div
      className={classNames(
        'border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-lg',
        className
      )}
    >
      <div className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-medium text-sm text-bolt-elements-textPrimary">
              Want More Features?
            </h3>
            <p className="text-xs text-bolt-elements-textSecondary mt-1">
              Upgrade your plan for more AI credits, storage, and premium features.
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={onViewPlansClick}>
            View Plans
          </Button>
        </div>
      </div>
    </div>
  );
}
