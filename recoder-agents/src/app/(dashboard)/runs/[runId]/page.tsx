'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Bot,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Coins,
  Zap,
  Cpu,
  Hash,
  Play,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExecutionTimeline, parseMessagesToSteps } from '@/components/thread/execution-timeline';
import { ExecutionStats } from '@/components/thread/execution-stats';
import { ToolCallTracker, type TrackedToolCall } from '@/components/thread/tool-call-tracker';
import { useRunDetail } from '@/hooks/threads/use-runs';
import { useActiveRuns } from '@/hooks/threads/use-active-runs';
import { RunReplayViewer } from '@/components/thread/run-replay-viewer';
import type { UnifiedMessage, ParsedContent, ParsedMetadata } from '@/components/thread/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const elapsed = Math.max(0, end - start);
  const totalSeconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

const STATUS_CONFIG = {
  running: {
    label: 'Running',
    icon: Loader2,
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50',
    iconClassName: 'animate-spin',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50',
    iconClassName: '',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
    iconClassName: '',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50',
    iconClassName: '',
  },
  cancelled: {
    label: 'Cancelled',
    icon: AlertTriangle,
    className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-300 dark:border-zinc-700/50',
    iconClassName: '',
  },
} as const;

function extractToolCalls(messages: UnifiedMessage[]): TrackedToolCall[] {
  const calls: TrackedToolCall[] = [];

  for (const msg of messages) {
    if (msg.type !== 'assistant') continue;

    let parsedContent: ParsedContent | null = null;
    let parsedMeta: ParsedMetadata | null = null;
    try { parsedContent = JSON.parse(msg.content || '{}'); } catch { /* skip */ }
    try { parsedMeta = JSON.parse(msg.metadata || '{}'); } catch { /* skip */ }

    const toolCallsList = parsedContent?.tool_calls ?? parsedMeta?.tool_calls ?? [];
    for (const tc of toolCallsList) {
      const fnName = (tc as any).function?.name ?? (tc as any).function_name ?? 'unknown';
      const args = (tc as any).function?.arguments ?? (tc as any).arguments;

      // Find the matching tool result in subsequent messages
      const tcId = (tc as any).id ?? (tc as any).tool_call_id;
      const resultMsg = tcId
        ? messages.find((m) => {
            if (m.type !== 'tool') return false;
            try {
              const c = JSON.parse(m.content || '{}');
              const mt = JSON.parse(m.metadata || '{}');
              return c.tool_call_id === tcId || mt.tool_call_id === tcId;
            } catch { return false; }
          })
        : undefined;

      let resultMeta: ParsedMetadata | null = null;
      if (resultMsg) {
        try { resultMeta = JSON.parse(resultMsg.metadata || '{}'); } catch { /* skip */ }
      }

      const success = resultMeta?.result?.success;
      const hasResult = resultMsg !== undefined;
      const durationMs =
        resultMsg && msg.created_at
          ? Math.max(
              0,
              new Date(resultMsg.created_at).getTime() -
                new Date(msg.created_at).getTime(),
            )
          : undefined;

      calls.push({
        name: fnName,
        status: !hasResult
          ? 'running'
          : success === false
            ? 'failed'
            : 'success',
        duration_ms: durationMs,
        input_preview:
          typeof args === 'string'
            ? args.slice(0, 200)
            : args
              ? JSON.stringify(args).slice(0, 200)
              : undefined,
        output_preview: resultMeta?.result?.output
          ? String(resultMeta.result.output).slice(0, 200)
          : undefined,
      });
    }
  }

  return calls;
}

// ---------------------------------------------------------------------------
// Run detail page
// ---------------------------------------------------------------------------

export default function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const router = useRouter();
  const runId = params.runId;

  // Try to get from run detail endpoint
  const { data: runDetail, isLoading: isDetailLoading } = useRunDetail(runId);

  // Also check active runs for live data
  const { data: activeRuns } = useActiveRuns();
  const activeRun = activeRuns?.find((r) => r.id === runId);

  // Determine run info from either source
  const run = runDetail ?? (activeRun
    ? {
        ...activeRun,
        completed_at: undefined,
        thread_id: undefined,
        project_id: undefined,
        total_tokens: activeRun.token_count,
        error_message: undefined,
        messages: undefined,
      }
    : null);

  const isRunning = run?.status === 'running' || run?.status === 'pending';

  // Convert messages for our components
  const messages: UnifiedMessage[] = useMemo(() => {
    if (!runDetail?.messages) return [];
    return runDetail.messages.map((m) => ({
      message_id: m.message_id,
      thread_id: runDetail.thread_id || runId,
      type: m.type as UnifiedMessage['type'],
      is_llm_message: m.type === 'assistant',
      content: m.content,
      metadata: m.metadata,
      created_at: m.created_at,
      updated_at: m.updated_at,
    }));
  }, [runDetail?.messages, runDetail?.thread_id, runId]);

  const toolCalls = useMemo(() => extractToolCalls(messages), [messages]);
  const steps = useMemo(() => parseMessagesToSteps(messages), [messages]);

  // Loading state
  if (isDetailLoading && !activeRun) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading run details...</p>
        </div>
      </div>
    );
  }

  // Not found
  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-muted-foreground/40" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Run not found</h2>
          <p className="text-sm text-muted-foreground mt-1">
            This run may have expired or the ID is invalid.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/runs')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Runs
        </Button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[run.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0 mt-0.5"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-bold tracking-tight truncate">
                {run.agent_name}
              </h1>
            </div>
            <Badge
              variant="outline"
              className={cn('flex items-center gap-1.5', statusConfig.className)}
            >
              <StatusIcon className={cn('h-3 w-3', statusConfig.iconClassName)} />
              {statusConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {runId.slice(0, 8)}
            </span>
            <span className="text-muted-foreground/40">|</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Started {formatDateTime(run.started_at)}
            </span>
            {run.model && (
              <>
                <span className="text-muted-foreground/40">|</span>
                <span className="flex items-center gap-1">
                  <Cpu className="h-3 w-3" />
                  {run.model}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {run.status === 'failed' && (run as any).error_message && (
        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 p-4">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Execution Failed
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                {(run as any).error_message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main content: two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left panel (60%) — Timeline */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border bg-card">
            <ScrollArea className="max-h-[600px]">
              <ExecutionTimeline
                threadId={run.thread_id || runId}
                messages={messages}
                isLive={isRunning}
              />
            </ScrollArea>
          </div>
        </div>

        {/* Right panel (40%) — Stats + Tool Calls */}
        <div className="lg:col-span-2 space-y-4">
          {/* Execution Stats */}
          <div className="rounded-xl border bg-card p-4">
            <ExecutionStats
              threadId={run.thread_id || runId}
              messages={messages}
              startedAt={run.started_at}
              isRunning={isRunning}
              model={run.model}
              tokenCount={run.token_count || (run as any).total_tokens}
              estimatedCost={run.estimated_cost}
            />
          </div>

          {/* Tool Call Tracker */}
          <div className="rounded-xl border bg-card p-4">
            <ToolCallTracker toolCalls={toolCalls} />
          </div>

          {/* Completion summary */}
          {!isRunning && run.status === 'completed' && (
            <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  Run Completed
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Total Time</span>
                  <p className="font-semibold mt-0.5">
                    {formatDuration(
                      run.started_at,
                      (run as any).completed_at,
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Steps</span>
                  <p className="font-semibold mt-0.5">{steps.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tokens</span>
                  <p className="font-semibold mt-0.5 flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {(run.token_count || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cost</span>
                  <p className="font-semibold mt-0.5 flex items-center gap-1">
                    <Coins className="h-3 w-3" />
                    ${(run.estimated_cost || 0).toFixed(4)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Run Replay Viewer */}
      {run.status === 'completed' && run.agent_id && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Play className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Run Replay</h3>
          </div>
          <RunReplayViewer agentId={run.agent_id} runId={runId} />
        </div>
      )}

      {/* Bottom: Raw messages */}
      {messages.length > 0 && (
        <div className="mt-6">
          <div className="rounded-xl border bg-card">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold">
                Raw Messages ({messages.length})
              </h3>
            </div>
            <ScrollArea className="max-h-[400px]">
              <div className="divide-y">
                {messages.map((msg) => {
                  let displayContent = '';
                  try {
                    const parsed = JSON.parse(msg.content || '{}');
                    displayContent =
                      parsed.content ||
                      (parsed.tool_calls
                        ? `[${parsed.tool_calls.length} tool call(s)]`
                        : JSON.stringify(parsed).slice(0, 200));
                  } catch {
                    displayContent = msg.content?.slice(0, 200) || '';
                  }

                  return (
                    <div
                      key={msg.message_id}
                      className="px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0',
                            msg.type === 'user'
                              ? 'bg-blue-50 dark:bg-blue-950/30'
                              : msg.type === 'assistant'
                                ? 'bg-purple-50 dark:bg-purple-950/30'
                                : 'bg-amber-50 dark:bg-amber-950/30',
                          )}
                        >
                          {msg.type}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatDateTime(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 break-words line-clamp-3">
                        {displayContent}
                      </p>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
