'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Clock,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useRunHistory,
  useRunTimeline,
  type TaskRun,
  type TimelineEventStatus,
} from '@/hooks/operator/use-run-history';

const STATE_META: Record<string, { label: string; className: string; icon: React.FC<{ className?: string }>; spin?: boolean }> = {
  submitted: { label: 'Submitted', className: 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300', icon: Clock },
  working: { label: 'Working', className: 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300', icon: Loader2, spin: true },
  'input-required': { label: 'Input Required', className: 'border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-800/50 dark:bg-purple-950/40 dark:text-purple-300', icon: Clock },
  completed: { label: 'Completed', className: 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'border-red-200 bg-red-100 text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300', icon: XCircle },
  cancelled: { label: 'Cancelled', className: 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700/50 dark:bg-zinc-800/40 dark:text-zinc-300', icon: CircleSlash },
};

function formatRelative(iso: string | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

const TIMELINE_STATUS_DOT: Record<TimelineEventStatus, string> = {
  pending: 'bg-amber-400',
  in_progress: 'bg-blue-400',
  success: 'bg-emerald-400',
  failed: 'bg-red-400',
  cancelled: 'bg-zinc-400',
};

function RunTimeline({ taskId }: { taskId: string }) {
  const { data, isLoading, isError, error } = useRunTimeline(taskId);

  if (isLoading) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">Loading timeline…</p>;
  }
  if (isError) {
    return (
      <p className="px-3 py-3 text-xs text-red-500">
        {error instanceof Error ? error.message : 'Failed to load timeline'}
      </p>
    );
  }
  if (!data || data.events.length === 0) {
    return <p className="px-3 py-3 text-xs text-muted-foreground">No timeline events</p>;
  }

  return (
    <ol className="space-y-2 px-3 py-3">
      {data.events.map((ev) => (
        <li key={ev.id} className="flex items-start gap-2.5">
          <span className={cn('mt-1 h-2 w-2 flex-shrink-0 rounded-full', TIMELINE_STATUS_DOT[ev.status])} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{ev.title}</span>
              <Badge variant="outline" className="px-1 py-0 text-[9px] uppercase text-muted-foreground">
                {ev.type}
              </Badge>
            </div>
            <span className="text-[10px] text-muted-foreground">{formatRelative(ev.timestamp)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function RunRow({ run }: { run: TaskRun }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATE_META[run.state] ?? STATE_META.submitted;
  const StateIcon = meta.icon;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {run.prompt?.slice(0, 80) || run.type || run.id.slice(0, 8)}
            </span>
            <Badge variant="outline" className={cn('flex items-center gap-1 px-1.5 py-0 text-[10px]', meta.className)}>
              <StateIcon className={cn('h-2.5 w-2.5', meta.spin && 'animate-spin')} />
              {meta.label}
            </Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-mono">{run.id.slice(0, 8)}</span>
            {(run.assigneeAgentId || run.claimedBy || run.to) && (
              <>
                <span className="text-muted-foreground/40">|</span>
                <span className="truncate">{run.assigneeAgentId || run.claimedBy || run.to}</span>
              </>
            )}
            <span className="text-muted-foreground/40">|</span>
            <span>{formatRelative(run.updatedAt || run.createdAt)}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t bg-muted/20">
          <RunTimeline taskId={run.id} />
        </div>
      )}
    </div>
  );
}

interface RunHistoryPanelProps {
  workspaceId?: string;
}

export function RunHistoryPanel({ workspaceId }: RunHistoryPanelProps) {
  const { data: runs, isLoading, isError, error } = useRunHistory({
    workspaceId,
    limit: 25,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Play className="h-4 w-4 text-muted-foreground" />
          Recent Runs
        </CardTitle>
        {runs && <span className="text-xs text-muted-foreground">{runs.length} runs</span>}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="py-4 text-center text-xs text-muted-foreground">Loading runs…</p>}
        {isError && (
          <p className="py-4 text-center text-xs text-red-500">
            {error instanceof Error ? error.message : 'Failed to load runs'}
          </p>
        )}
        {!isLoading && !isError && (runs?.length ?? 0) === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">No runs yet</p>
        )}
        {(runs ?? []).map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </CardContent>
    </Card>
  );
}
