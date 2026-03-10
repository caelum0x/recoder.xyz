'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  User,
  Brain,
  Wrench,
  CheckCircle,
  Bot,
  AlertCircle,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Gauge,
  Clock,
  Zap,
  Coins,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRunReplay, useRunReplaySummary } from '@/hooks/agents/use-run-replay';
import type { ReplayStep } from '@/lib/api/run-replay';

// ---------------------------------------------------------------------------
// Step type config
// ---------------------------------------------------------------------------

const STEP_TYPE_CONFIG: Record<
  ReplayStep['step_type'],
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }
> = {
  user_input: {
    label: 'User Input',
    icon: User,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
  },
  llm_call: {
    label: 'LLM Call',
    icon: Brain,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
  },
  tool_call: {
    label: 'Tool Call',
    icon: Wrench,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
  },
  tool_result: {
    label: 'Tool Result',
    icon: CheckCircle,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  assistant_output: {
    label: 'Assistant',
    icon: Bot,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/30',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
  },
};

const SPEED_OPTIONS = [1, 2, 4] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function getContentPreview(content: Record<string, any>): string {
  if (content.text) return String(content.text).slice(0, 200);
  if (content.message) return String(content.message).slice(0, 200);
  if (content.content) return String(content.content).slice(0, 200);
  if (content.tool_name) return `Tool: ${content.tool_name}`;
  if (content.function_name) return `Function: ${content.function_name}`;
  if (content.error) return `Error: ${String(content.error).slice(0, 150)}`;
  const raw = JSON.stringify(content);
  return raw.length > 200 ? raw.slice(0, 197) + '...' : raw;
}

// ---------------------------------------------------------------------------
// Expandable Step Row
// ---------------------------------------------------------------------------

function StepRow({
  step,
  isActive,
  onClick,
}: {
  step: ReplayStep;
  isActive: boolean;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = STEP_TYPE_CONFIG[step.step_type] || STEP_TYPE_CONFIG.error;
  const Icon = config.icon;
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  return (
    <div
      ref={rowRef}
      className={cn(
        'border-b border-border/40 transition-colors',
        isActive
          ? 'bg-primary/5 border-l-2 border-l-primary'
          : 'hover:bg-muted/30',
      )}
    >
      {/* Main row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={onClick}
      >
        {/* Step index */}
        <span className="text-[11px] font-mono text-muted-foreground w-6 text-right flex-shrink-0">
          {step.step_index}
        </span>

        {/* Type icon */}
        <div className={cn('p-1.5 rounded-md flex-shrink-0', config.bgColor)}>
          <Icon className={cn('h-3.5 w-3.5', config.color)} />
        </div>

        {/* Content preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn('text-xs font-medium', config.color)}>
              {config.label}
            </span>
            {step.latency_ms > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {formatMs(step.latency_ms)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {getContentPreview(step.content)}
          </p>
        </div>

        {/* Tokens badge */}
        {(step.tokens_in > 0 || step.tokens_out > 0) && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
            <Zap className="h-2.5 w-2.5 mr-0.5" />
            {formatTokens(step.tokens_in + step.tokens_out)}
          </Badge>
        )}

        {/* Expand toggle */}
        <button
          className="p-1 hover:bg-muted/60 rounded flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-3 ml-9">
          <div className="rounded-lg bg-muted/40 border border-border/50 p-3">
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/80 max-h-[300px] overflow-auto">
              {JSON.stringify(step.content, null, 2)}
            </pre>
            {(step.tokens_in > 0 || step.tokens_out > 0 || step.cost > 0) && (
              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                {step.tokens_in > 0 && <span>In: {step.tokens_in.toLocaleString()} tokens</span>}
                {step.tokens_out > 0 && <span>Out: {step.tokens_out.toLocaleString()} tokens</span>}
                {step.cost > 0 && <span>Cost: ${step.cost.toFixed(4)}</span>}
                {step.latency_ms > 0 && <span>Latency: {formatMs(step.latency_ms)}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Viewer Component
// ---------------------------------------------------------------------------

interface RunReplayViewerProps {
  agentId: string;
  runId: string;
}

export function RunReplayViewer({ agentId, runId }: RunReplayViewerProps) {
  const { data: replayData, isLoading: isReplayLoading } = useRunReplay(agentId, runId);
  const { data: summary } = useRunReplaySummary(agentId, runId);

  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const steps = useMemo(() => replayData?.steps ?? [], [replayData]);
  const totalSteps = steps.length;

  // Playback logic
  const stopPlayback = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (totalSteps === 0) return;
    if (currentStep >= totalSteps - 1) {
      setCurrentStep(0);
    }
    setIsPlaying(true);
  }, [totalSteps, currentStep]);

  useEffect(() => {
    if (!isPlaying || totalSteps === 0) return;

    const baseIntervalMs = 1500;
    const intervalMs = baseIntervalMs / speed;

    playIntervalRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= totalSteps - 1) {
          stopPlayback();
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, speed, totalSteps, stopPlayback]);

  const handleStepBack = () => {
    stopPlayback();
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    stopPlayback();
    setCurrentStep((prev) => Math.min(totalSteps - 1, prev + 1));
  };

  const cycleSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    setSpeed(SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length]);
  };

  // Compute running totals up to current step
  const runningStats = useMemo(() => {
    if (steps.length === 0) return { elapsed: 0, tokens: 0, cost: 0 };
    let elapsed = 0;
    let tokens = 0;
    let cost = 0;
    for (let i = 0; i <= Math.min(currentStep, steps.length - 1); i++) {
      elapsed += steps[i].latency_ms;
      tokens += steps[i].tokens_in + steps[i].tokens_out;
      cost += steps[i].cost;
    }
    return { elapsed, tokens, cost };
  }, [steps, currentStep]);

  // Loading
  if (isReplayLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading replay data...</p>
        </div>
      </div>
    );
  }

  // No data
  if (totalSteps === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Play className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No replay data available for this run.</p>
        <p className="text-xs text-muted-foreground/60">
          Replay data is captured during agent execution.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Stats Bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/30 border-b text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Gauge className="h-3.5 w-3.5" />
          Step {currentStep + 1} / {totalSteps}
        </span>
        <span className="text-muted-foreground/40">|</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatMs(runningStats.elapsed)}
        </span>
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          {formatTokens(runningStats.tokens)}
        </span>
        <span className="flex items-center gap-1">
          <Coins className="h-3 w-3" />
          ${runningStats.cost.toFixed(4)}
        </span>

        {summary && (
          <>
            <span className="text-muted-foreground/40 ml-auto">|</span>
            <span className="text-muted-foreground/70">
              Total: {formatMs(summary.total_latency_ms)} / {formatTokens(summary.total_tokens_in + summary.total_tokens_out)} tokens / ${summary.total_cost.toFixed(4)}
            </span>
          </>
        )}
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 border-b bg-background">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleStepBack}
          disabled={currentStep === 0}
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        <Button
          variant={isPlaying ? 'secondary' : 'default'}
          size="icon"
          className="h-8 w-8"
          onClick={() => (isPlaying ? stopPlayback() : startPlayback())}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleStepForward}
          disabled={currentStep >= totalSteps - 1}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 px-2 ml-2 tabular-nums"
          onClick={cycleSpeed}
        >
          {speed}x
        </Button>
      </div>

      {/* Step Timeline */}
      <ScrollArea className="max-h-[500px]">
        <div>
          {steps.map((step, idx) => (
            <StepRow
              key={step.id}
              step={step}
              isActive={idx === currentStep}
              onClick={() => {
                stopPlayback();
                setCurrentStep(idx);
              }}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
