'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2, Circle, XCircle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PipelineRun } from '@/lib/api/pipelines';
import type { PipelineStep } from '@/lib/api/pipelines';

interface PipelineExecutionViewProps {
  run: PipelineRun;
  steps: PipelineStep[];
  onCancel?: () => void;
}

function StepStatusIcon({ stepIndex, run }: { stepIndex: number; run: PipelineRun }) {
  if (run.status === 'failed' && stepIndex === run.current_step) {
    return <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />;
  }
  if (run.status === 'cancelled' && stepIndex >= run.current_step) {
    return <Ban className="h-5 w-5 text-muted-foreground flex-shrink-0" />;
  }
  if (stepIndex < run.current_step) {
    return <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />;
  }
  if (stepIndex === run.current_step && run.status === 'running') {
    return <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />;
  }
  return <Circle className="h-5 w-5 text-muted-foreground/40 flex-shrink-0" />;
}

function stepStatusText(stepIndex: number, run: PipelineRun): string {
  if (run.status === 'failed' && stepIndex === run.current_step) return 'Failed';
  if (run.status === 'cancelled' && stepIndex >= run.current_step) return 'Cancelled';
  if (stepIndex < run.current_step) return 'Completed';
  if (stepIndex === run.current_step && run.status === 'running') return 'Running...';
  return 'Pending';
}

export function PipelineExecutionView({
  run,
  steps,
  onCancel,
}: PipelineExecutionViewProps) {
  const completedCount = Math.min(run.current_step, run.total_steps);
  const progressPercent =
    run.status === 'completed'
      ? 100
      : run.total_steps > 0
        ? Math.round((completedCount / run.total_steps) * 100)
        : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Progress: {completedCount}/{run.total_steps} steps
          </span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              run.status === 'failed'
                ? 'bg-red-500'
                : run.status === 'completed'
                  ? 'bg-green-500'
                  : 'bg-blue-500',
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps timeline */}
      <div className="relative space-y-0">
        {steps.map((step, index) => (
          <div key={index} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />
            )}
            {/* Status icon */}
            <StepStatusIcon stepIndex={index} run={run} />
            {/* Step content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">
                  Step {index + 1}: {step.agent_name || step.agent_id.slice(0, 8)}
                </p>
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded',
                    stepStatusText(index, run) === 'Completed' &&
                      'bg-green-500/10 text-green-600',
                    stepStatusText(index, run) === 'Running...' &&
                      'bg-blue-500/10 text-blue-600',
                    stepStatusText(index, run) === 'Failed' &&
                      'bg-red-500/10 text-red-600',
                    stepStatusText(index, run) === 'Pending' &&
                      'bg-muted text-muted-foreground',
                    stepStatusText(index, run) === 'Cancelled' &&
                      'bg-muted text-muted-foreground',
                  )}
                >
                  {stepStatusText(index, run)}
                </span>
              </div>
              {step.input_mapping && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Input: {step.input_mapping}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Cancel button */}
      {run.status === 'running' && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel} className="w-full">
          Cancel Pipeline
        </Button>
      )}

      {/* Error message */}
      {run.status === 'failed' && run.error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
          <p className="text-sm text-red-600">{run.error}</p>
        </div>
      )}
    </div>
  );
}
