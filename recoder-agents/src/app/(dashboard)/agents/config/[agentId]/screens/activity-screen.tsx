'use client';

import React, { useState, useMemo } from 'react';
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
  ChevronDown,
  Filter,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useAgentActivity, useAgentActivitySummary } from '@/hooks/agents/use-agent-activity';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface ActivityScreenProps {
  agentId: string;
}

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

const ALL_TYPES = Object.entries(ACTIVITY_TYPE_CONFIG).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActivityScreen({ agentId }: ActivityScreenProps) {
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(0);

  const {
    data: activityData,
    isLoading: isActivityLoading,
  } = useAgentActivity(agentId, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    activity_type: typeFilter,
  });

  const { data: summary, isLoading: isSummaryLoading } = useAgentActivitySummary(agentId);

  const activities = activityData?.activities ?? [];
  const total = activityData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Reset page when filter changes
  const handleFilterChange = (type: string | undefined) => {
    setTypeFilter(type);
    setPage(0);
  };

  return (
    <div className="flex-1 overflow-y-auto pb-8 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total (30d)"
          value={summary?.total}
          isLoading={isSummaryLoading}
          icon={Activity}
          color="text-foreground"
        />
        <SummaryCard
          label="Runs"
          value={summary?.runs}
          isLoading={isSummaryLoading}
          icon={Play}
          color="text-blue-500"
        />
        <SummaryCard
          label="Config Changes"
          value={summary?.config_changes}
          isLoading={isSummaryLoading}
          icon={Settings}
          color="text-gray-500"
        />
        <SummaryCard
          label="Errors"
          value={summary?.errors}
          isLoading={isSummaryLoading}
          icon={XCircle}
          color="text-red-500"
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {typeFilter
                ? ACTIVITY_TYPE_CONFIG[typeFilter]?.label ?? typeFilter
                : 'All Types'}
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => handleFilterChange(undefined)}>
              All Types
            </DropdownMenuItem>
            {ALL_TYPES.map((t) => (
              <DropdownMenuItem key={t.value} onClick={() => handleFilterChange(t.value)}>
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground ml-auto">
          {total} event{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Activity Timeline */}
      {isActivityLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <SpotlightCard className="p-8 text-center">
          <Activity className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No activity recorded yet</p>
        </SpotlightCard>
      ) : (
        <div className="space-y-1">
          {activities.map((activity) => {
            const config = ACTIVITY_TYPE_CONFIG[activity.activity_type] ?? {
              icon: Activity,
              color: 'text-muted-foreground',
              label: activity.activity_type,
            };
            const Icon = config.icon;

            return (
              <SpotlightCard
                key={activity.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted',
                    config.color
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {config.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  {activity.description && (
                    <p className="text-sm text-foreground/80 mt-0.5 line-clamp-2">
                      {activity.description}
                    </p>
                  )}
                  {activity.metadata &&
                    Object.keys(activity.metadata).length > 0 && (
                      <details className="mt-1 group">
                        <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
                          Details
                        </summary>
                        <pre className="mt-1 text-[11px] bg-muted/50 rounded p-2 overflow-x-auto max-h-32 text-muted-foreground">
                          {JSON.stringify(activity.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  isLoading,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <SpotlightCard className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <p className="text-2xl font-semibold">{value ?? 0}</p>
      )}
    </SpotlightCard>
  );
}
