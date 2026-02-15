/**
 * User-Facing Usage Stats Component
 * Shows usage vs limits per UsageType with progress bars and color coding
 */

import { useStore } from '@nanostores/react';
import type { UsageType } from '~/lib/services/billing/types';
import {
  localUsage,
  isAtWarningLevel,
  isAtCriticalLevel,
  usageAlerts,
  formatUsageType,
  formatUsageValue,
  getUsageColor,
  getUsagePercentage,
  dismissAlert,
} from '~/lib/services/billing/usage-billing';

const USAGE_TYPES: UsageType[] = ['ai_tokens', 'sandbox_minutes', 'api_requests', 'storage_gb', 'deployments'];

function UsageBar({ type }: { type: UsageType }) {
  const usage = useStore(localUsage);
  const current = usage[type] || 0;
  const percentage = Math.min(getUsagePercentage(type), 100);
  const color = getUsageColor(percentage);

  const barColor = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  }[color] || 'bg-green-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-bolt-elements-textSecondary">{formatUsageType(type)}</span>
        <span className="text-bolt-elements-textPrimary font-medium">
          {formatUsageValue(type, current)}
        </span>
      </div>
      <div className="w-full h-2 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="text-xs text-bolt-elements-textTertiary text-right">
        {percentage.toFixed(0)}% used
      </div>
    </div>
  );
}

export function UsageStats() {
  const atWarning = useStore(isAtWarningLevel);
  const atCritical = useStore(isAtCriticalLevel);
  const alerts = useStore(usageAlerts);

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Usage</h3>
        {atCritical && (
          <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
            Critical
          </span>
        )}
        {!atCritical && atWarning && (
          <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
            Warning
          </span>
        )}
      </div>

      <div className="space-y-4">
        {USAGE_TYPES.map(type => (
          <UsageBar key={type} type={type} />
        ))}
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {alerts.map(alert => (
            <div
              key={alert.usageType}
              className={`flex items-center justify-between p-2 rounded text-sm ${
                alert.type === 'critical' || alert.type === 'exceeded'
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-yellow-500/10 text-yellow-400'
              }`}
            >
              <span>{alert.message}</span>
              <button
                onClick={() => dismissAlert(alert.usageType)}
                className="text-xs opacity-60 hover:opacity-100 ml-2"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compact badge for sidebar/header usage warning
 */
export function UsageWarningBadge() {
  const atCritical = useStore(isAtCriticalLevel);
  const atWarning = useStore(isAtWarningLevel);

  if (!atWarning && !atCritical) return null;

  return (
    <span
      className={`inline-flex items-center justify-center w-2 h-2 rounded-full ${
        atCritical ? 'bg-red-500' : 'bg-yellow-500'
      }`}
      title={atCritical ? 'Usage at critical level' : 'Usage approaching limit'}
    />
  );
}
