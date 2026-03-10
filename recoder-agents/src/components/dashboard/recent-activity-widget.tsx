'use client';

import React from 'react';
import {
  Activity,
  Play,
  CheckCircle,
  XCircle,
  Settings,
  Plus,
  Minus,
  Clock,
  Key,
  Share2,
  Copy,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useRecentActivity } from '@/hooks/agents/use-agent-activity';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Icon / color map (shared with activity-screen)
// ---------------------------------------------------------------------------

const ACTIVITY_TYPE_CONFIG: Record<
  string,
  { icon: LucideIcon; color: string; label: string }
> = {
  run_started: { icon: Play, color: 'text-blue-500', label: 'Run Started' },
  run_completed: { icon: CheckCircle, color: 'text-green-500', label: 'Run Completed' },
  run_failed: { icon: XCircle, color: 'text-red-500', label: 'Run Failed' },
  config_updated: { icon: Settings, color: 'text-gray-500', label: 'Config Updated' },
  tool_added: { icon: Plus, color: 'text-green-500', label: 'Tool Added' },
  tool_removed: { icon: Minus, color: 'text-red-500', label: 'Tool Removed' },
  schedule_triggered: { icon: Clock, color: 'text-amber-500', label: 'Schedule Triggered' },
  secret_updated: { icon: Key, color: 'text-purple-500', label: 'Secret Updated' },
  shared: { icon: Share2, color: 'text-blue-500', label: 'Shared' },
  cloned: { icon: Copy, color: 'text-gray-500', label: 'Cloned' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentActivityWidget() {
  const { data: activities, isLoading } = useRecentActivity(5);

  if (isLoading) {
    return (
      <SpotlightCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </h3>
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      </SpotlightCard>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <SpotlightCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </h3>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">
          No recent activity
        </p>
      </SpotlightCard>
    );
  }

  return (
    <SpotlightCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Recent Activity
        </h3>
      </div>

      <div className="space-y-2">
        {activities.map((activity) => {
          const config = ACTIVITY_TYPE_CONFIG[activity.activity_type] ?? {
            icon: Activity,
            color: 'text-muted-foreground',
            label: activity.activity_type,
          };
          const Icon = config.icon;

          return (
            <div
              key={activity.id}
              className="flex items-start gap-2.5 text-sm"
            >
              <div
                className={cn(
                  'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted',
                  config.color
                )}
              >
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {activity.agent_name && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                      {activity.agent_name}
                    </Badge>
                  )}
                  <span className="text-xs text-foreground/80 truncate">
                    {activity.description || config.label}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(activity.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </SpotlightCard>
  );
}
