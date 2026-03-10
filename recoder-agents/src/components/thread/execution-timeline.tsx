'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Brain,
  Wrench,
  FileText,
  Pencil,
  Search,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Terminal,
  Image,
  MessageSquare,
} from 'lucide-react';
import type { UnifiedMessage, ParsedContent, ParsedMetadata } from '@/components/thread/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepType =
  | 'thinking'
  | 'tool_call'
  | 'reading'
  | 'writing'
  | 'searching'
  | 'generating'
  | 'waiting'
  | 'browsing'
  | 'command'
  | 'image'
  | 'asking';

export type StepStatus = 'running' | 'completed' | 'failed' | 'pending';

export interface ExecutionStep {
  id: string;
  type: StepType;
  label: string;
  status: StepStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  toolName?: string;
}

interface ExecutionTimelineProps {
  threadId: string;
  messages?: UnifiedMessage[];
  isLive?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEP_TYPE_MAP: Record<string, StepType> = {
  'read-file': 'reading',
  'file-reader': 'reading',
  'list-directory': 'reading',
  'list-dir': 'reading',
  'create-file': 'writing',
  'str-replace': 'writing',
  'full-file-rewrite': 'writing',
  'delete-file': 'writing',
  'web-search': 'searching',
  'image-search': 'searching',
  'search-mcp': 'searching',
  'crawl-webpage': 'browsing',
  'scrape-webpage': 'browsing',
  'browser-navigate-to': 'browsing',
  'browser-act': 'browsing',
  'browser-extract-content': 'browsing',
  'execute-command': 'command',
  'check-command-output': 'command',
  'see-image': 'image',
  'image-edit-generate': 'image',
  'ask-user': 'asking',
  'complete': 'generating',
};

function classifyToolCall(toolName: string): StepType {
  const normalized = toolName.toLowerCase().replace(/_/g, '-');
  return STEP_TYPE_MAP[normalized] ?? 'tool_call';
}

function labelForStep(type: StepType, toolName?: string): string {
  switch (type) {
    case 'thinking':
      return 'Thinking';
    case 'generating':
      return 'Generating response';
    case 'reading':
      return toolName ? `Reading: ${prettifyTool(toolName)}` : 'Reading file';
    case 'writing':
      return toolName ? `Writing: ${prettifyTool(toolName)}` : 'Writing file';
    case 'searching':
      return toolName ? `Searching: ${prettifyTool(toolName)}` : 'Searching';
    case 'browsing':
      return toolName ? `Browsing: ${prettifyTool(toolName)}` : 'Browsing web';
    case 'command':
      return 'Running command';
    case 'image':
      return toolName ? `Image: ${prettifyTool(toolName)}` : 'Processing image';
    case 'asking':
      return 'Waiting for user';
    case 'waiting':
      return 'Waiting';
    case 'tool_call':
      return toolName ? prettifyTool(toolName) : 'Tool call';
  }
}

function prettifyTool(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STEP_ICONS: Record<StepType, React.FC<{ className?: string }>> = {
  thinking: Brain,
  tool_call: Wrench,
  reading: FileText,
  writing: Pencil,
  searching: Search,
  generating: Sparkles,
  waiting: Clock,
  browsing: Globe,
  command: Terminal,
  image: Image,
  asking: MessageSquare,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Parse messages into timeline steps
// ---------------------------------------------------------------------------

export function parseMessagesToSteps(messages: UnifiedMessage[]): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  let stepIndex = 0;

  for (const msg of messages) {
    let parsedContent: ParsedContent | null = null;
    let parsedMeta: ParsedMetadata | null = null;

    try {
      parsedContent = JSON.parse(msg.content || '{}');
    } catch {
      parsedContent = null;
    }
    try {
      parsedMeta = JSON.parse(msg.metadata || '{}');
    } catch {
      parsedMeta = null;
    }

    if (msg.type === 'assistant') {
      // If it has tool_calls, create a step per tool call
      const toolCalls =
        parsedContent?.tool_calls ?? parsedMeta?.tool_calls ?? [];
      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const fnName =
            (tc as any).function?.name ??
            (tc as any).function_name ??
            'unknown';
          const stepType = classifyToolCall(fnName);
          steps.push({
            id: `step-${stepIndex++}`,
            type: stepType,
            label: labelForStep(stepType, fnName),
            status: 'completed',
            startedAt: msg.created_at,
            completedAt: msg.updated_at || msg.created_at,
            durationMs: msg.updated_at
              ? new Date(msg.updated_at).getTime() -
                new Date(msg.created_at).getTime()
              : undefined,
            toolName: fnName,
          });
        }
      } else {
        // Plain assistant text — thinking/generating
        const hasContent =
          parsedContent?.content && parsedContent.content.length > 0;
        steps.push({
          id: `step-${stepIndex++}`,
          type: hasContent ? 'generating' : 'thinking',
          label: hasContent ? 'Generating response' : 'Thinking',
          status: 'completed',
          startedAt: msg.created_at,
          completedAt: msg.updated_at || msg.created_at,
          durationMs: msg.updated_at
            ? new Date(msg.updated_at).getTime() -
              new Date(msg.created_at).getTime()
            : undefined,
        });
      }
    } else if (msg.type === 'tool') {
      // Tool result — update previous step status if it matches
      const toolCallId = parsedContent?.tool_call_id ?? parsedMeta?.tool_call_id;
      const result = parsedMeta?.result;
      if (result && steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        if (lastStep && result.success === false) {
          lastStep.status = 'failed';
        }
      }
    }
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Step row component
// ---------------------------------------------------------------------------

function TimelineStep({
  step,
  isLast,
  isLive,
}: {
  step: ExecutionStep;
  isLast: boolean;
  isLive?: boolean;
}) {
  const Icon = STEP_ICONS[step.type] || Wrench;
  const isRunning = step.status === 'running';
  const isFailed = step.status === 'failed';
  const isActive = isLive && isLast && !isFailed;

  return (
    <div
      className={cn(
        'group relative flex gap-3 pb-4 transition-all duration-300',
        isActive && 'animate-in slide-in-from-top-2',
      )}
    >
      {/* Vertical line */}
      {!isLast && (
        <div
          className={cn(
            'absolute left-[15px] top-[30px] bottom-0 w-px',
            isFailed
              ? 'bg-red-300 dark:bg-red-800'
              : 'bg-border',
          )}
        />
      )}

      {/* Icon circle */}
      <div
        className={cn(
          'relative z-10 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full border',
          isActive
            ? 'border-primary bg-primary/10 animate-pulse'
            : isFailed
              ? 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/40'
              : 'border-border bg-card',
        )}
      >
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            isActive
              ? 'text-primary'
              : isFailed
                ? 'text-red-500 dark:text-red-400'
                : 'text-muted-foreground',
          )}
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-between min-w-0 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'text-sm font-medium truncate',
              isFailed
                ? 'text-red-600 dark:text-red-400'
                : 'text-foreground',
            )}
          >
            {step.label}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {step.durationMs !== undefined && step.durationMs > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDuration(step.durationMs)}
            </span>
          )}

          {/* Status indicator */}
          {isRunning || isActive ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : isFailed ? (
            <XCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutionTimeline({
  threadId,
  messages,
  isLive = false,
  className,
}: ExecutionTimelineProps) {
  const steps = useMemo(
    () => (messages ? parseMessagesToSteps(messages) : []),
    [messages],
  );

  if (steps.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-12 text-center',
          className,
        )}
      >
        <Clock className="h-8 w-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No execution steps yet</p>
        {isLive && (
          <p className="text-xs text-muted-foreground/60 mt-1">
            Steps will appear here as the agent runs
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('px-4 py-3', className)}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          Execution Timeline
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {steps.length} step{steps.length !== 1 ? 's' : ''}
        </span>
        {isLive && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Live
            </span>
          </span>
        )}
      </div>

      <div>
        {steps.map((step, i) => (
          <TimelineStep
            key={step.id}
            step={step}
            isLast={i === steps.length - 1}
            isLive={isLive}
          />
        ))}
      </div>
    </div>
  );
}
