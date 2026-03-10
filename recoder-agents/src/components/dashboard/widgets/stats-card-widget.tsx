'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardWidgetProps {
  config: Record<string, any>;
}

interface StatItem {
  label: string;
  value: number | string;
  trend?: number; // percentage change
}

const DEFAULT_STATS: StatItem[] = [
  { label: 'Total Agents', value: '--', trend: 0 },
  { label: 'Runs Today', value: '--', trend: 0 },
  { label: 'Cost This Month', value: '--', trend: 0 },
];

export function StatsCardWidget({ config }: StatsCardWidgetProps) {
  const stats: StatItem[] = config?.stats ?? DEFAULT_STATS;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stats.map((stat, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3"
        >
          <span className="text-xs text-muted-foreground">{stat.label}</span>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold">{stat.value}</span>
            {stat.trend !== undefined && stat.trend !== 0 && (
              <span
                className={cn(
                  'flex items-center gap-0.5 text-xs font-medium',
                  stat.trend > 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {stat.trend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(stat.trend)}%
              </span>
            )}
            {stat.trend === 0 && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Minus className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
