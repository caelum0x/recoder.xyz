'use client';

import { useEffect, useState } from 'react';
import {
  X,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  PauseCircle,
  CircleDot,
  Ban,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkflowExecution } from '@/hooks/workflows/use-workflows';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkflowExecutionViewProps {
  executionId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

const statusMeta: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: 'Pending',
    color: 'text-zinc-500',
    icon: CircleDot,
  },
  running: {
    label: 'Running',
    color: 'text-blue-500',
    icon: Loader2,
  },
  paused: {
    label: 'Paused — Waiting for Approval',
    color: 'text-yellow-500',
    icon: PauseCircle,
  },
  completed: {
    label: 'Completed',
    color: 'text-green-500',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-500',
    icon: XCircle,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-zinc-400',
    icon: Ban,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Elapsed time hook
// ---------------------------------------------------------------------------

function useElapsedTime(startedAt: string, completedAt?: string): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();

    if (completedAt) {
      const end = new Date(completedAt).getTime();
      setElapsed((end - start) / 1000);
      return;
    }

    // Update every second while still running
    function tick() {
      setElapsed((Date.now() - start) / 1000);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, completedAt]);

  return elapsed;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkflowExecutionView({ executionId, onClose }: WorkflowExecutionViewProps) {
  const { data: execution, isLoading, isError } = useWorkflowExecution(executionId);
  const elapsed = useElapsedTime(
    execution?.started_at ?? new Date().toISOString(),
    execution?.completed_at,
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading execution...
        </div>
      </div>
    );
  }

  if (isError || !execution) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4 shadow-lg dark:border-red-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <span className="text-sm text-red-500">Failed to load execution details.</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close execution view"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const meta = statusMeta[execution.status] ?? statusMeta.pending;
  const StatusIcon = meta.icon;
  const isActive = execution.status === 'running' || execution.status === 'pending';

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={cn(
              'h-5 w-5',
              meta.color,
              execution.status === 'running' && 'animate-spin',
            )}
          />
          <span className={cn('text-sm font-medium', meta.color)}>{meta.label}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Close execution view"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        {/* Started at */}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="text-zinc-600 dark:text-zinc-400">Started:</span>
          <span className="text-zinc-900 dark:text-zinc-100">
            {formatTimestamp(execution.started_at)}
          </span>
        </div>

        {/* Elapsed time */}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="text-zinc-600 dark:text-zinc-400">Elapsed:</span>
          <span className="text-zinc-900 dark:text-zinc-100">
            {formatElapsed(elapsed)}
            {isActive && (
              <span className="ml-1 text-xs text-zinc-400">(live)</span>
            )}
          </span>
        </div>

        {/* Total cost */}
        {execution.total_cost != null && (
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="text-zinc-600 dark:text-zinc-400">Cost:</span>
            <span className="text-zinc-900 dark:text-zinc-100">
              {formatCost(execution.total_cost)}
            </span>
          </div>
        )}

        {/* Approval gate notice */}
        {execution.status === 'paused' && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800/50 dark:bg-yellow-900/20">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <div className="text-sm text-yellow-700 dark:text-yellow-300">
              <p className="font-medium">Waiting for approval</p>
              <p className="mt-0.5 text-xs text-yellow-600 dark:text-yellow-400">
                This execution is paused at an approval gate. Review and approve or reject
                to continue.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Close
        </button>
      </div>
    </div>
  );
}
