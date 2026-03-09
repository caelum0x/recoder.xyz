'use client';

import { Save, Play, BookTemplate, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkflowToolbarProps {
  workflowId: string;
  workflowName: string;
  status: string;
  onRun: () => void;
  onSave: () => void;
  isSaving?: boolean;
  isRunning?: boolean;
}

// ---------------------------------------------------------------------------
// Status badge colour mapping
// ---------------------------------------------------------------------------

const statusStyles: Record<string, string> = {
  draft: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  archived: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkflowToolbar({
  workflowName,
  status,
  onRun,
  onSave,
  isSaving = false,
  isRunning = false,
}: WorkflowToolbarProps) {
  const badgeClass = statusStyles[status] ?? statusStyles.draft;

  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900">
      {/* Workflow name */}
      <h2 className="mr-2 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {workflowName}
      </h2>

      {/* Status badge */}
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
          badgeClass,
        )}
      >
        {status}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save button */}
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors',
          'hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-200',
          'dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus:ring-blue-700/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save
      </button>

      {/* Run button */}
      <button
        type="button"
        onClick={onRun}
        disabled={isRunning}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors',
          'hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300',
          'dark:focus:ring-blue-700/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        Run
      </button>

      {/* Save as Template — placeholder */}
      <button
        type="button"
        disabled
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors',
          'dark:border-zinc-700 dark:text-zinc-500',
          'cursor-not-allowed opacity-60',
        )}
        title="Save as Template (coming soon)"
      >
        <BookTemplate className="h-4 w-4" />
        Template
      </button>
    </div>
  );
}
