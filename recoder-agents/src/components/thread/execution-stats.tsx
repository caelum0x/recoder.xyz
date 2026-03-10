'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Clock,
  Layers,
  Coins,
  Cpu,
  Zap,
} from 'lucide-react';
import type { UnifiedMessage } from '@/components/thread/types';
import { parseMessagesToSteps } from './execution-timeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExecutionStatsProps {
  threadId: string;
  messages?: UnifiedMessage[];
  startedAt?: string;
  isRunning?: boolean;
  model?: string;
  tokenCount?: number;
  estimatedCost?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(startedAt: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function estimateTokens(messages: UnifiedMessage[]): { input: number; output: number } {
  let input = 0;
  let output = 0;

  for (const msg of messages) {
    // Rough token estimate: ~4 chars per token
    const charCount = (msg.content || '').length;
    const tokenEstimate = Math.ceil(charCount / 4);

    if (msg.type === 'user') {
      input += tokenEstimate;
    } else if (msg.type === 'assistant' || msg.type === 'tool') {
      output += tokenEstimate;
    }
  }

  return { input, output };
}

// ---------------------------------------------------------------------------
// Stat badge component
// ---------------------------------------------------------------------------

function StatBadge({
  icon: Icon,
  label,
  value,
  variant = 'default',
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  variant?: 'default' | 'live' | 'cost';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        variant === 'live'
          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20'
          : variant === 'cost'
            ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20'
            : 'border-border bg-card',
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 flex-shrink-0',
          variant === 'live'
            ? 'text-emerald-600 dark:text-emerald-400'
            : variant === 'cost'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground',
        )}
      />
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums truncate">
          {value}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutionStats({
  threadId,
  messages,
  startedAt,
  isRunning = false,
  model,
  tokenCount,
  estimatedCost,
  className,
}: ExecutionStatsProps) {
  const [, setTick] = useState(0);

  // Tick every second for the live timer
  useEffect(() => {
    if (!isRunning || !startedAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning, startedAt]);

  const steps = useMemo(
    () => (messages ? parseMessagesToSteps(messages) : []),
    [messages],
  );

  const tokenEstimate = useMemo(
    () => (messages ? estimateTokens(messages) : { input: 0, output: 0 }),
    [messages],
  );

  const totalTokens = tokenCount ?? tokenEstimate.input + tokenEstimate.output;
  const cost = estimatedCost ?? totalTokens * 0.000003; // rough estimate

  const elapsed = startedAt ? formatElapsed(startedAt) : '--';
  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const failedSteps = steps.filter((s) => s.status === 'failed').length;

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold text-foreground">
        Execution Stats
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <StatBadge
          icon={Clock}
          label="Elapsed"
          value={elapsed}
          variant={isRunning ? 'live' : 'default'}
        />
        <StatBadge
          icon={Layers}
          label="Steps"
          value={
            failedSteps > 0
              ? `${completedSteps} done, ${failedSteps} failed`
              : `${completedSteps} / ${steps.length}`
          }
        />
        <StatBadge
          icon={Zap}
          label="Tokens"
          value={totalTokens.toLocaleString()}
        />
        <StatBadge
          icon={Coins}
          label="Est. Cost"
          value={`$${cost.toFixed(4)}`}
          variant="cost"
        />
      </div>
      {model && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="h-3.5 w-3.5" />
          <span className="truncate">{model}</span>
        </div>
      )}
    </div>
  );
}
