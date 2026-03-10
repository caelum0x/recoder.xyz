'use client';

import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActiveRunsWidgetProps {
  config: Record<string, any>;
}

interface RunItem {
  id: string;
  agent_name: string;
  started_at: string;
}

function elapsed(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

const PLACEHOLDER_RUNS: RunItem[] = [];

export function ActiveRunsWidget({ config }: ActiveRunsWidgetProps) {
  const runs: RunItem[] = config?.runs ?? PLACEHOLDER_RUNS;

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No active runs</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex items-center gap-3 rounded-md border px-3 py-2"
        >
          {/* Animated pulse indicator */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                'bg-green-500'
              )}
            />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium truncate block">
              {run.agent_name}
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
            {elapsed(run.started_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
