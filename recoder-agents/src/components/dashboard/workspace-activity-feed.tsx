'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Pencil,
  MessageSquare,
  CheckCircle,
  XCircle,
  Settings,
  Activity,
  Clock,
  Trash2,
  Play,
  UserPlus,
  UserMinus,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceActivity } from '@/hooks/workspaces/use-workspace-activity';
import type { ActivityEvent, ActivityType } from '@/lib/api/workspace-activity';

// ---------------------------------------------------------------------------
// Activity type configuration
// ---------------------------------------------------------------------------

type ActivityTypeConfig = {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  label: string;
};

const ACTIVITY_TYPE_CONFIG: Record<ActivityType, ActivityTypeConfig> = {
  agent_created:     { icon: Plus,          color: 'text-green-600 dark:text-green-400',  bgColor: 'bg-green-100 dark:bg-green-900/30',  label: 'created agent' },
  agent_updated:     { icon: Pencil,        color: 'text-blue-600 dark:text-blue-400',    bgColor: 'bg-blue-100 dark:bg-blue-900/30',    label: 'updated agent' },
  agent_deleted:     { icon: Trash2,        color: 'text-red-600 dark:text-red-400',      bgColor: 'bg-red-100 dark:bg-red-900/30',      label: 'deleted agent' },
  thread_started:    { icon: MessageSquare, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30', label: 'started thread' },
  thread_completed:  { icon: CheckCircle,   color: 'text-green-600 dark:text-green-400',  bgColor: 'bg-green-100 dark:bg-green-900/30',  label: 'completed thread' },
  run_started:       { icon: Play,          color: 'text-blue-600 dark:text-blue-400',    bgColor: 'bg-blue-100 dark:bg-blue-900/30',    label: 'started run' },
  run_completed:     { icon: CheckCircle,   color: 'text-green-600 dark:text-green-400',  bgColor: 'bg-green-100 dark:bg-green-900/30',  label: 'completed run' },
  run_failed:        { icon: XCircle,       color: 'text-red-600 dark:text-red-400',      bgColor: 'bg-red-100 dark:bg-red-900/30',      label: 'run failed' },
  member_joined:     { icon: UserPlus,      color: 'text-teal-600 dark:text-teal-400',    bgColor: 'bg-teal-100 dark:bg-teal-900/30',    label: 'joined workspace' },
  member_left:       { icon: UserMinus,     color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30', label: 'left workspace' },
  config_changed:    { icon: Settings,      color: 'text-amber-600 dark:text-amber-400',  bgColor: 'bg-amber-100 dark:bg-amber-900/30',  label: 'changed config' },
  deploy_completed:  { icon: Rocket,        color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30', label: 'completed deploy' },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Single activity entry
// ---------------------------------------------------------------------------

function ActivityEntry({ event }: { event: ActivityEvent }) {
  const config = ACTIVITY_TYPE_CONFIG[event.activity_type] ?? {
    icon: Activity,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    label: event.activity_type,
  };
  const Icon = config.icon;

  return (
    <div className="flex gap-3 py-2">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            config.bgColor
          )}
        >
          <Icon className={cn('h-4 w-4', config.color)} />
        </div>
        <div className="flex-1 w-px bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-medium">
              {event.actor_name ?? 'System'}
            </span>{' '}
            <span className="text-muted-foreground">{config.label}</span>
            {event.target_name && (
              <>
                {' '}
                <span className="font-medium">{event.target_name}</span>
              </>
            )}
          </p>
          <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
            <Clock className="h-3 w-3" />
            {timeAgo(event.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed component
// ---------------------------------------------------------------------------

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Activity' },
  { value: 'agent_created', label: 'Agent Created' },
  { value: 'agent_updated', label: 'Agent Updated' },
  { value: 'agent_deleted', label: 'Agent Deleted' },
  { value: 'thread_started', label: 'Thread Started' },
  { value: 'thread_completed', label: 'Thread Completed' },
  { value: 'run_started', label: 'Run Started' },
  { value: 'run_completed', label: 'Run Completed' },
  { value: 'run_failed', label: 'Run Failed' },
  { value: 'config_changed', label: 'Config Changed' },
  { value: 'deploy_completed', label: 'Deploy Completed' },
];

interface WorkspaceActivityFeedProps {
  workspaceId?: string;
  compact?: boolean;
}

export function WorkspaceActivityFeed({
  workspaceId,
  compact = false,
}: WorkspaceActivityFeedProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [limit, setLimit] = useState(20);

  const { data: events, isLoading } = useWorkspaceActivity({
    workspace_id: workspaceId,
    activity_type: typeFilter === 'all' ? undefined : typeFilter,
    limit,
  });

  return (
    <div className="space-y-3">
      {/* Filter */}
      {!compact && (
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Feed */}
      {!isLoading && events && events.length > 0 && (
        <div className="flex flex-col">
          {events.map((event) => (
            <ActivityEntry key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!events || events.length === 0) && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No activity recorded yet</p>
        </div>
      )}

      {/* Load more */}
      {!compact && events && events.length >= limit && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit((prev) => prev + 20)}
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
