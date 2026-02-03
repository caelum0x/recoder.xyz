'use client';

// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { Zap, X } from 'lucide-react';
import { useState } from 'react';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/button';

interface QuotaExceededBannerProps {
  onUpgradeClick?: () => void;
  onDismiss?: () => void;
  className?: string;
  compact?: boolean;
}

export function QuotaExceededBanner({
  onUpgradeClick,
  onDismiss,
  className,
  compact = false
}: QuotaExceededBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  if (compact) {
    return (
      <div
        className={classNames(
          'flex items-center justify-between gap-3 p-3 bg-gradient-to-r from-orange-500/10 to-accent-500/10 border border-orange-500/30 rounded-lg',
          className
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Zap className="h-4 w-4 text-orange-500 shrink-0" />
          <p className="text-sm font-medium text-bolt-elements-textPrimary truncate">
            AI quota exceeded
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
          onClick={onUpgradeClick}
        >
          Upgrade
        </Button>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        'relative overflow-hidden rounded-lg border border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-accent-500/5 to-orange-500/10 p-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-accent-500 text-white shadow-md">
          <Zap className="h-5 w-5" />
        </div>

        <div className="flex-1 space-y-1">
          <h3 className="font-semibold text-base text-bolt-elements-textPrimary">
            You've reached your AI usage limit
          </h3>
          <p className="text-sm text-bolt-elements-textSecondary">
            Upgrade your plan to continue using AI features or wait for the next billing cycle.
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="sm"
              onClick={onUpgradeClick}
              className="bg-gradient-to-r from-orange-500 to-accent-500 hover:from-orange-600 hover:to-accent-600 text-white shadow-sm hover:shadow-md transition-all duration-200"
            >
              Upgrade Plan
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            >
              Dismiss
            </Button>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-orange-500/10 transition-colors"
        >
          <X className="h-4 w-4 text-bolt-elements-textSecondary" />
          <span className="sr-only">Dismiss</span>
        </button>
      </div>
    </div>
  );
}
