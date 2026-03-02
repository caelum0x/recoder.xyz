'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Zap } from 'lucide-react';

interface UsageLimitWarningProps {
  current: number;
  limit: number;
  type: 'sessions' | 'tokens';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toString();
}

export function UsageLimitWarning({ current, limit, type }: UsageLimitWarningProps) {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isAtLimit = percentage >= 100;
  const isWarning = percentage >= 80 && !isAtLimit;

  // Don't render anything below 80%
  if (percentage < 80) return null;

  const label = type === 'sessions' ? 'daily sessions' : 'session tokens';

  return (
    <div
      className={`rounded-lg border p-3 ${
        isAtLimit
          ? 'border-red-500/30 bg-red-950/30'
          : 'border-yellow-500/30 bg-yellow-950/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 mt-0.5 ${
            isAtLimit ? 'text-red-400' : 'text-yellow-400'
          }`}
        >
          {isAtLimit ? (
            <Zap className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Message */}
          <p
            className={`text-sm font-medium ${
              isAtLimit ? 'text-red-300' : 'text-yellow-300'
            }`}
          >
            {isAtLimit
              ? `Daily ${type === 'sessions' ? 'session' : 'token'} limit reached. Upgrade for more.`
              : `You've used ${Math.round(percentage)}% of your ${label}`}
          </p>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isAtLimit
                  ? 'bg-red-500'
                  : 'bg-yellow-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Usage text + upgrade link */}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {formatNumber(current)} / {formatNumber(limit)}{' '}
              {type === 'tokens' ? 'tokens' : 'sessions'}
            </span>
            <Link
              href="/pricing"
              className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                isAtLimit
                  ? 'text-red-400 hover:text-red-300'
                  : 'text-yellow-400 hover:text-yellow-300'
              }`}
            >
              Upgrade plan
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UsageLimitWarning;
