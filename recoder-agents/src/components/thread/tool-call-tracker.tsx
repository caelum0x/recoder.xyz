'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackedToolCall {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  duration_ms?: number;
  input_preview?: string;
  output_preview?: string;
}

interface ToolCallTrackerProps {
  toolCalls: TrackedToolCall[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function prettifyToolName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_COLORS: Record<TrackedToolCall['status'], string> = {
  running: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50',
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
  failed: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50',
  pending: 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:border-zinc-700/50',
};

// ---------------------------------------------------------------------------
// Pill component with hover popover
// ---------------------------------------------------------------------------

function ToolPill({ tool }: { tool: TrackedToolCall }) {
  const [showPopover, setShowPopover] = useState(false);
  const colorClass = STATUS_COLORS[tool.status];

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-default',
          colorClass,
        )}
      >
        {tool.status === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : tool.status === 'success' ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : tool.status === 'failed' ? (
          <XCircle className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        <span className="max-w-[120px] truncate">
          {prettifyToolName(tool.name)}
        </span>
        {tool.duration_ms !== undefined && tool.duration_ms > 0 && (
          <span className="text-[10px] opacity-70 tabular-nums">
            {formatDuration(tool.duration_ms)}
          </span>
        )}
      </span>

      {/* Hover popover */}
      {showPopover && (tool.input_preview || tool.output_preview) && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 rounded-lg border bg-popover p-3 shadow-lg text-popover-foreground">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">
                {prettifyToolName(tool.name)}
              </span>
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                  colorClass,
                )}
              >
                {tool.status}
              </span>
            </div>
            {tool.duration_ms !== undefined && (
              <div className="text-[11px] text-muted-foreground">
                Duration: {formatDuration(tool.duration_ms)}
              </div>
            )}
            {tool.input_preview && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
                  Input
                </div>
                <pre className="text-[11px] text-foreground/80 bg-muted/50 rounded p-1.5 max-h-20 overflow-hidden whitespace-pre-wrap break-words font-mono">
                  {tool.input_preview.slice(0, 200)}
                  {tool.input_preview.length > 200 ? '...' : ''}
                </pre>
              </div>
            )}
            {tool.output_preview && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
                  Output
                </div>
                <pre className="text-[11px] text-foreground/80 bg-muted/50 rounded p-1.5 max-h-20 overflow-hidden whitespace-pre-wrap break-words font-mono">
                  {tool.output_preview.slice(0, 200)}
                  {tool.output_preview.length > 200 ? '...' : ''}
                </pre>
              </div>
            )}
          </div>
          {/* Arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 rotate-45 bg-popover border-l border-t border-border" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ToolCallTracker({ toolCalls, className }: ToolCallTrackerProps) {
  if (toolCalls.length === 0) {
    return (
      <div className={cn('text-center py-4', className)}>
        <Wrench className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1.5" />
        <p className="text-xs text-muted-foreground">No tool calls yet</p>
      </div>
    );
  }

  const runningCount = toolCalls.filter((t) => t.status === 'running').length;
  const successCount = toolCalls.filter((t) => t.status === 'success').length;
  const failedCount = toolCalls.filter((t) => t.status === 'failed').length;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Tool Calls</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              {runningCount}
            </span>
          )}
          {successCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              {successCount}
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <XCircle className="h-3 w-3" />
              {failedCount}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {toolCalls.map((tool, i) => (
          <ToolPill key={`${tool.name}-${i}`} tool={tool} />
        ))}
      </div>
    </div>
  );
}
