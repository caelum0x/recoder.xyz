/**
 * SaveIndicator Component - Visual feedback for auto-save status
 *
 * Displays current save status with appropriate icons and colors:
 * - idle: No indicator (or subtle auto-save enabled hint)
 * - saving: Spinning icon with "Saving..."
 * - saved: Checkmark with "Saved"
 * - error: Error icon with message
 * - skipped: Warning icon (skipped due to syntax errors)
 */

import { memo } from 'react';
import { classNames } from '~/utils/classNames';
import type { SaveStatus } from '~/lib/hooks/useAutoSave';

interface SaveIndicatorProps {
  /** Current save status */
  status: SaveStatus;
  /** Whether auto-save is enabled */
  isEnabled: boolean;
  /** Last saved timestamp */
  lastSaved: number | null;
  /** Error message (when status is 'error') */
  errorMessage?: string | null;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode - only shows icon */
  compact?: boolean;
  /** Show auto-save toggle button */
  showToggle?: boolean;
  /** Callback to toggle auto-save */
  onToggle?: () => void;
}

export const SaveIndicator = memo(({
  status,
  isEnabled,
  lastSaved,
  errorMessage,
  className,
  compact = false,
  showToggle = false,
  onToggle,
}: SaveIndicatorProps) => {
  // Format last saved time
  const formatLastSaved = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 5000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(timestamp).toLocaleTimeString();
  };

  // Render based on status
  const renderStatus = () => {
    switch (status) {
      case 'saving':
        return (
          <div className="flex items-center gap-1.5 text-blue-400">
            <div className="i-ph:spinner animate-spin text-sm" />
            {!compact && <span className="text-xs">Saving...</span>}
          </div>
        );

      case 'saved':
        return (
          <div className="flex items-center gap-1.5 text-green-400">
            <div className="i-ph:check-circle text-sm" />
            {!compact && (
              <span className="text-xs">
                Saved {lastSaved ? formatLastSaved(lastSaved) : ''}
              </span>
            )}
          </div>
        );

      case 'error':
        return (
          <div className="flex items-center gap-1.5 text-red-400" title={errorMessage || 'Save failed'}>
            <div className="i-ph:warning-circle text-sm" />
            {!compact && (
              <span className="text-xs truncate max-w-[120px]">
                {errorMessage || 'Save failed'}
              </span>
            )}
          </div>
        );

      case 'skipped':
        return (
          <div className="flex items-center gap-1.5 text-yellow-400" title="Auto-save skipped: file has errors">
            <div className="i-ph:warning text-sm" />
            {!compact && <span className="text-xs">Skipped (errors)</span>}
          </div>
        );

      case 'idle':
      default:
        // Show subtle auto-save indicator when enabled
        if (isEnabled && lastSaved) {
          return (
            <div
              className="flex items-center gap-1.5 text-recoder-elements-textTertiary opacity-60"
              title={`Auto-save enabled. Last saved: ${formatLastSaved(lastSaved)}`}
            >
              <div className="i-ph:cloud-check text-sm" />
              {!compact && <span className="text-xs">Auto-save</span>}
            </div>
          );
        }
        if (isEnabled) {
          return (
            <div
              className="flex items-center gap-1.5 text-recoder-elements-textTertiary opacity-60"
              title="Auto-save enabled"
            >
              <div className="i-ph:cloud-check text-sm" />
              {!compact && <span className="text-xs">Auto-save</span>}
            </div>
          );
        }
        return null;
    }
  };

  return (
    <div
      className={classNames(
        'flex items-center gap-2 select-none',
        className
      )}
    >
      {renderStatus()}

      {/* Toggle button */}
      {showToggle && (
        <button
          onClick={onToggle}
          className={classNames(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors',
            isEnabled
              ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
              : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary hover:bg-recoder-elements-background-depth-4 hover:text-recoder-elements-textSecondary'
          )}
          title={isEnabled ? 'Disable auto-save' : 'Enable auto-save'}
        >
          <div className={isEnabled ? 'i-ph:toggle-right-fill' : 'i-ph:toggle-left'} />
          {!compact && <span>{isEnabled ? 'On' : 'Off'}</span>}
        </button>
      )}
    </div>
  );
});

SaveIndicator.displayName = 'SaveIndicator';

/**
 * Compact save indicator for tight spaces
 */
export const CompactSaveIndicator = memo(({
  status,
  isEnabled,
  lastSaved,
  errorMessage,
  className,
}: Omit<SaveIndicatorProps, 'compact' | 'showToggle' | 'onToggle'>) => (
  <SaveIndicator
    status={status}
    isEnabled={isEnabled}
    lastSaved={lastSaved}
    errorMessage={errorMessage}
    className={className}
    compact
  />
));

CompactSaveIndicator.displayName = 'CompactSaveIndicator';
