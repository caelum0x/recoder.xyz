'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AgentHealthBadgeProps {
  overallScore: number | null;
  reliabilityScore?: number | null;
  performanceScore?: number | null;
  costEfficiencyScore?: number | null;
  userSatisfactionScore?: number | null;
  size?: 'sm' | 'md';
  className?: string;
}

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 70) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function getScoreBgColor(score: number | null): string {
  if (score === null) return 'border-muted-foreground/30';
  if (score >= 70) return 'border-emerald-500/40';
  if (score >= 40) return 'border-amber-500/40';
  return 'border-red-500/40';
}

function getScoreLabel(score: number | null): string {
  if (score === null) return 'N/A';
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

function ScoreRow({ label, score }: { label: string; score: number | null | undefined }) {
  if (score === null || score === undefined) return null;
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('text-xs font-medium tabular-nums', getScoreColor(score))}>
        {score}
      </span>
    </div>
  );
}

export const AgentHealthBadge: React.FC<AgentHealthBadgeProps> = ({
  overallScore,
  reliabilityScore,
  performanceScore,
  costEfficiencyScore,
  userSatisfactionScore,
  size = 'sm',
  className,
}) => {
  const dimensions = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const fontSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const borderWidth = size === 'sm' ? 'border-[1.5px]' : 'border-2';

  const hasBreakdown =
    reliabilityScore != null ||
    performanceScore != null ||
    costEfficiencyScore != null ||
    userSatisfactionScore != null;

  const badge = (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold tabular-nums',
        dimensions,
        fontSize,
        borderWidth,
        getScoreBgColor(overallScore),
        getScoreColor(overallScore),
        className
      )}
    >
      {overallScore !== null ? overallScore : '--'}
    </div>
  );

  if (!hasBreakdown) return badge;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="w-48 p-3 space-y-1.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">Health Score</span>
            <span className={cn('text-sm font-bold tabular-nums', getScoreColor(overallScore))}>
              {overallScore ?? '--'}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mb-1">
            {getScoreLabel(overallScore)}
          </div>
          <div className="border-t border-border/50 pt-1.5 space-y-1">
            <ScoreRow label="Reliability" score={reliabilityScore} />
            <ScoreRow label="Performance" score={performanceScore} />
            <ScoreRow label="Cost Efficiency" score={costEfficiencyScore} />
            <ScoreRow label="Satisfaction" score={userSatisfactionScore} />
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AgentHealthBadge;
