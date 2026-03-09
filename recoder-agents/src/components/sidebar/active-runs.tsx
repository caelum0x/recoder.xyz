'use client';

import { useActiveRuns } from '@/hooks/threads/use-active-runs';
import type { ActiveRun } from '@/lib/api/active-runs';
import { cn } from '@/lib/utils';
import { Activity, Bot, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CompletedRun extends ActiveRun {
  completedAt: number;
}

function formatElapsed(startedAt: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function ActiveRunItem({ run, isCompleted }: { run: ActiveRun; isCompleted?: boolean }) {
  const [, setTick] = useState(0);

  // Tick every second to update elapsed time
  useEffect(() => {
    if (isCompleted) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isCompleted]);

  return (
    <div
      className={cn(
        'rounded-lg px-2.5 py-2 transition-all duration-300',
        isCompleted
          ? 'opacity-40 scale-[0.98]'
          : 'bg-muted/40'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Status indicator */}
        {isCompleted ? (
          <div className="h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground/50" />
        ) : (
          <div className="relative h-2 w-2 flex-shrink-0">
            <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
            <div className="relative h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        )}

        {/* Agent name */}
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {run.agent_name}
        </span>
      </div>

      {/* Details row */}
      <div className="flex items-center gap-2 mt-1 ml-4 text-xs text-muted-foreground">
        <span className="truncate max-w-[80px]">{run.model}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="tabular-nums">
          {isCompleted ? 'done' : formatElapsed(run.started_at)}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="tabular-nums">{run.token_count.toLocaleString()} tok</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="tabular-nums">${run.estimated_cost.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function ActiveRunsSection() {
  const { data: activeRuns, isLoading } = useActiveRuns();
  const { state } = useSidebar();
  const [isExpanded, setIsExpanded] = useState(true);
  const previousRunsRef = useRef<Map<string, ActiveRun>>(new Map());
  const [completedRuns, setCompletedRuns] = useState<CompletedRun[]>([]);

  // Track completed runs (runs that were in previous data but not in current)
  useEffect(() => {
    if (!activeRuns) return;

    const currentIds = new Set(activeRuns.map((r) => r.id));
    const previousRuns = previousRunsRef.current;

    // Find runs that disappeared (completed)
    const newlyCompleted: CompletedRun[] = [];
    previousRuns.forEach((run, id) => {
      if (!currentIds.has(id)) {
        newlyCompleted.push({ ...run, completedAt: Date.now() });
      }
    });

    if (newlyCompleted.length > 0) {
      setCompletedRuns((prev) => [...prev, ...newlyCompleted]);
    }

    // Update previous runs ref
    const nextMap = new Map<string, ActiveRun>();
    activeRuns.forEach((r) => nextMap.set(r.id, r));
    previousRunsRef.current = nextMap;
  }, [activeRuns]);

  // Remove completed runs after 5 seconds
  useEffect(() => {
    if (completedRuns.length === 0) return;

    const timeout = setTimeout(() => {
      const now = Date.now();
      setCompletedRuns((prev) =>
        prev.filter((r) => now - r.completedAt < 5000)
      );
    }, 5000);

    return () => clearTimeout(timeout);
  }, [completedRuns]);

  const runCount = activeRuns?.length ?? 0;
  const allRuns = [...(activeRuns ?? []), ...completedRuns];

  // Don't render if no active runs and no recently completed runs
  if (!isLoading && runCount === 0 && completedRuns.length === 0) {
    return null;
  }

  // Collapsed sidebar: just show an icon with count badge
  if (state === 'collapsed') {
    return (
      <div className="flex flex-col items-center py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative cursor-pointer">
              <Activity className="h-4 w-4 text-muted-foreground" />
              {runCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-medium text-white">
                  {runCount}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            {runCount} active run{runCount !== 1 ? 's' : ''}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="py-2">
      {/* Section header */}
      <button
        className="flex w-full items-center gap-2 px-1 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <Activity className="h-3.5 w-3.5 flex-shrink-0" />
        <span>Active Runs</span>
        {runCount > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs tabular-nums">{runCount}</span>
          </span>
        )}
      </button>

      {/* Run list */}
      {isExpanded && (
        <div className="mt-1 space-y-1">
          {isLoading && runCount === 0 && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {allRuns.map((run) => {
            const isCompleted = 'completedAt' in run;
            return (
              <ActiveRunItem
                key={run.id}
                run={run}
                isCompleted={isCompleted}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
