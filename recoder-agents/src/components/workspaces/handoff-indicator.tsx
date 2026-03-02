'use client';

import { ArrowRight, GitMerge } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HandoffIndicatorProps {
  fromAgent: string;
  toAgent: string;
  intent: 'handoff' | 'delegate' | 'review';
  contextTransferred?: boolean;
  delegationDepth?: number;
}

const INTENT_COLORS: Record<string, string> = {
  handoff: 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20',
  delegate: 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/20',
  review: 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950/20',
};

const INTENT_LABELS: Record<string, string> = {
  handoff: 'Handoff',
  delegate: 'Delegation',
  review: 'Review Request',
};

export function HandoffIndicator({
  fromAgent,
  toAgent,
  intent,
  contextTransferred,
  delegationDepth,
}: HandoffIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-2 rounded-lg border mx-4 my-1', INTENT_COLORS[intent])}>
      {/* From agent */}
      <div className="flex items-center gap-1.5">
        <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-[10px] font-medium">
          {fromAgent.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-xs font-medium">{fromAgent}</span>
      </div>

      {/* Arrow + intent */}
      <div className="flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {INTENT_LABELS[intent]}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* To agent */}
      <div className="flex items-center gap-1.5">
        <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-[10px] font-medium">
          {toAgent.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-xs font-medium">{toAgent}</span>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 ml-auto">
        {contextTransferred && (
          <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
            <GitMerge className="h-3 w-3" />
            context
          </span>
        )}
        {delegationDepth != null && delegationDepth > 0 && (
          <span className="text-[10px] text-muted-foreground">
            depth: {delegationDepth}
          </span>
        )}
      </div>
    </div>
  );
}
