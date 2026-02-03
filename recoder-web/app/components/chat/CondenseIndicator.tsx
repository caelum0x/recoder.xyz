/**
 * Condense Indicator Component
 * Shows context usage and condensation status
 *
 * Features:
 * - Token usage progress bar
 * - Warning when approaching limit
 * - Status indicator during condensation
 * - Manual condense button
 */

import { memo, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { condenseStore, type CondenseState } from '~/lib/stores/condense';
import { classNames } from '~/utils/classNames';

interface CondenseIndicatorProps {
  className?: string;
  onManualCondense?: () => void;
  compact?: boolean;
}

export const CondenseIndicator = memo(
  ({ className, onManualCondense, compact = false }: CondenseIndicatorProps) => {
    const store = useStore(condenseStore);
    const [showTooltip, setShowTooltip] = useState(false);

    const { state, tokenUsagePercent, threshold, showWarning, enabled, progressMessage } = store;

    // Determine color based on usage
    const getUsageColor = useCallback(() => {
      if (tokenUsagePercent >= threshold) {
        return 'bg-red-500';
      }
      if (tokenUsagePercent >= threshold - 10) {
        return 'bg-yellow-500';
      }
      return 'bg-green-500';
    }, [tokenUsagePercent, threshold]);

    // Get status text
    const getStatusText = useCallback(() => {
      switch (state) {
        case 'checking':
          return 'Checking context...';
        case 'condensing':
          return progressMessage || 'Condensing context...';
        case 'complete':
          return 'Context condensed';
        case 'error':
          return 'Condensation failed';
        default:
          return `${tokenUsagePercent}% context used`;
      }
    }, [state, tokenUsagePercent, progressMessage]);

    // Get state icon
    const getStateIcon = useCallback(() => {
      switch (state) {
        case 'checking':
        case 'condensing':
          return 'i-ph:spinner animate-spin';
        case 'complete':
          return 'i-ph:check-circle text-green-500';
        case 'error':
          return 'i-ph:warning-circle text-red-500';
        default:
          if (tokenUsagePercent >= threshold) {
            return 'i-ph:warning text-red-500';
          }
          if (showWarning) {
            return 'i-ph:info text-yellow-500';
          }
          return 'i-ph:database';
      }
    }, [state, tokenUsagePercent, threshold, showWarning]);

    // Don't show if disabled and not actively condensing
    if (!enabled && state === 'idle') {
      return null;
    }

    // Compact version for header/toolbar
    if (compact) {
      // Only show when there's something to show (warning or active state)
      if (state === 'idle' && !showWarning) {
        return null;
      }

      return (
        <div
          className={classNames(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
            showWarning || state === 'error' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-blue-500/10 text-blue-400',
            state === 'condensing' && 'bg-blue-500/10 text-blue-400',
            className
          )}
          title={getStatusText()}
        >
          <div className={classNames('w-3 h-3', getStateIcon())} />
          <span className="max-w-24 truncate">{state === 'idle' ? `${tokenUsagePercent}%` : getStatusText()}</span>
        </div>
      );
    }

    // Full version with progress bar
    return (
      <div
        className={classNames('relative', className)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Main indicator */}
        <div
          className={classNames(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
            'bg-bolt-elements-background-depth-2',
            'border border-bolt-elements-borderColor',
            showWarning && 'border-yellow-500/50',
            state === 'error' && 'border-red-500/50'
          )}
        >
          {/* Icon */}
          <div className={classNames('w-4 h-4', getStateIcon())} />

          {/* Progress bar */}
          <div className="flex-1 min-w-20">
            <div className="h-1.5 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
              <div
                className={classNames(
                  'h-full rounded-full transition-all duration-300',
                  getUsageColor(),
                  state === 'condensing' && 'animate-pulse'
                )}
                style={{ width: `${Math.min(tokenUsagePercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Percentage */}
          <span
            className={classNames(
              'text-xs font-medium min-w-8 text-right',
              tokenUsagePercent >= threshold
                ? 'text-red-400'
                : showWarning
                  ? 'text-yellow-400'
                  : 'text-bolt-elements-textSecondary'
            )}
          >
            {tokenUsagePercent}%
          </span>

          {/* Manual condense button */}
          {onManualCondense && state === 'idle' && tokenUsagePercent >= 50 && (
            <button
              onClick={onManualCondense}
              className={classNames(
                'p-1 rounded transition-colors',
                'hover:bg-bolt-elements-background-depth-3',
                'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
              )}
              title="Condense context now"
            >
              <div className="i-ph:arrows-in w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tooltip */}
        {showTooltip && (
          <div
            className={classNames(
              'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
              'px-3 py-2 rounded-lg shadow-lg',
              'bg-bolt-elements-background-depth-3',
              'border border-bolt-elements-borderColor',
              'text-xs whitespace-nowrap'
            )}
          >
            <div className="text-bolt-elements-textPrimary font-medium mb-1">Context Usage</div>
            <div className="text-bolt-elements-textSecondary">{getStatusText()}</div>
            {showWarning && state === 'idle' && (
              <div className="text-yellow-400 mt-1">Condensation will trigger at {threshold}%</div>
            )}

            {/* Arrow */}
            <div
              className={classNames(
                'absolute top-full left-1/2 -translate-x-1/2',
                'w-0 h-0 border-l-4 border-r-4 border-t-4',
                'border-l-transparent border-r-transparent',
                'border-t-bolt-elements-borderColor'
              )}
            />
          </div>
        )}
      </div>
    );
  }
);

CondenseIndicator.displayName = 'CondenseIndicator';

/**
 * Inline condensing status for chat area
 */
export const CondenseStatus = memo(() => {
  const { state, progressMessage } = useStore(condenseStore);

  if (state !== 'condensing' && state !== 'checking') {
    return null;
  }

  return (
    <div
      className={classNames(
        'flex items-center justify-center gap-2 py-2 px-4',
        'bg-blue-500/10 text-blue-400 text-sm',
        'border-t border-b border-blue-500/20',
        'animate-pulse'
      )}
    >
      <div className="i-ph:spinner animate-spin w-4 h-4" />
      <span>{progressMessage || (state === 'checking' ? 'Checking context size...' : 'Condensing conversation...')}</span>
    </div>
  );
});

CondenseStatus.displayName = 'CondenseStatus';

export default CondenseIndicator;
