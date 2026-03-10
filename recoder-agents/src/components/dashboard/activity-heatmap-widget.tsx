'use client';

import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useActivityHeatmap } from '@/hooks/platform/use-unified-activity';
import Link from 'next/link';

// ============================================================================
// Constants
// ============================================================================

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ============================================================================
// Component
// ============================================================================

export function ActivityHeatmapWidget() {
  const { data: heatmap, isLoading } = useActivityHeatmap(7);

  const { map, maxCount, totalEvents } = useMemo(() => {
    const m: Record<string, number> = {};
    let mx = 1;
    let total = 0;
    for (const c of heatmap?.cells || []) {
      const key = `${c.day}-${c.hour}`;
      m[key] = c.count;
      if (c.count > mx) mx = c.count;
      total += c.count;
    }
    return { map: m, maxCount: mx, totalEvents: total };
  }, [heatmap]);

  const intensity = (day: number, hour: number) => {
    const count = map[`${day}-${hour}`] || 0;
    if (count === 0) return 'bg-muted/20';
    const ratio = count / maxCount;
    if (ratio > 0.75) return 'bg-emerald-500/80';
    if (ratio > 0.5) return 'bg-emerald-500/55';
    if (ratio > 0.25) return 'bg-emerald-500/35';
    return 'bg-emerald-500/15';
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Activity</span>
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Activity</span>
          <span className="text-xs text-muted-foreground">
            {totalEvents} event{totalEvents !== 1 ? 's' : ''} this week
          </span>
        </div>
        <Link
          href="/activity"
          className="text-xs text-primary hover:underline"
        >
          View Timeline
        </Link>
      </div>

      {/* Compact heatmap: 7 days x 24 hours, condensed to 8 time blocks */}
      <div className="space-y-0.5">
        {DAY_LABELS.map((dayLabel, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-3 text-right flex-shrink-0">
              {dayLabel}
            </span>
            <div className="flex-1 flex gap-[1px]">
              {/* Show 8 time blocks (3-hour chunks) for compact display */}
              {[0, 3, 6, 9, 12, 15, 18, 21].map((startHour) => {
                // Sum 3-hour block
                const blockCount =
                  (map[`${dayIdx}-${startHour}`] || 0) +
                  (map[`${dayIdx}-${startHour + 1}`] || 0) +
                  (map[`${dayIdx}-${startHour + 2}`] || 0);
                const blockMax = maxCount * 3;
                const ratio = blockMax > 0 ? blockCount / blockMax : 0;

                let bg = 'bg-muted/20';
                if (ratio > 0.75) bg = 'bg-emerald-500/80';
                else if (ratio > 0.5) bg = 'bg-emerald-500/55';
                else if (ratio > 0.25) bg = 'bg-emerald-500/35';
                else if (blockCount > 0) bg = 'bg-emerald-500/15';

                return (
                  <div
                    key={startHour}
                    className={cn('flex-1 h-3 rounded-[2px]', bg)}
                    title={`${dayLabel} ${startHour}:00-${startHour + 3}:00: ${blockCount} events`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Minimal legend */}
      <div className="flex items-center gap-1 mt-2">
        <span className="text-[8px] text-muted-foreground">Less</span>
        <div className="h-2 w-2 rounded-[1px] bg-muted/20" />
        <div className="h-2 w-2 rounded-[1px] bg-emerald-500/15" />
        <div className="h-2 w-2 rounded-[1px] bg-emerald-500/35" />
        <div className="h-2 w-2 rounded-[1px] bg-emerald-500/55" />
        <div className="h-2 w-2 rounded-[1px] bg-emerald-500/80" />
        <span className="text-[8px] text-muted-foreground">More</span>
      </div>
    </div>
  );
}
