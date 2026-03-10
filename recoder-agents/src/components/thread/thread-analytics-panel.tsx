'use client';

import React, { useState } from 'react';
import {
  BarChart3,
  MessageSquare,
  Cpu,
  Clock,
  DollarSign,
  Wrench,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  User,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useThreadAnalytics,
  useCalculateThreadAnalytics,
} from '@/hooks/threads/use-thread-analytics';
import { format, parseISO } from 'date-fns';

interface ThreadAnalyticsPanelProps {
  threadId: string;
  className?: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  colorClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
      <div className={cn('p-2 rounded-md bg-background', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
        {subValue && (
          <p className="text-xs text-muted-foreground">{subValue}</p>
        )}
      </div>
    </div>
  );
}

function MessageBreakdownBar({
  userMessages,
  assistantMessages,
  toolMessages,
  total,
}: {
  userMessages: number;
  assistantMessages: number;
  toolMessages: number;
  total: number;
}) {
  if (total === 0) return null;

  const userPct = (userMessages / total) * 100;
  const assistantPct = (assistantMessages / total) * 100;
  const toolPct = (toolMessages / total) * 100;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Message Breakdown</p>
      <div className="w-full h-3 rounded-full overflow-hidden flex bg-muted">
        {userPct > 0 && (
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${userPct}%` }}
            title={`User: ${userMessages}`}
          />
        )}
        {assistantPct > 0 && (
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${assistantPct}%` }}
            title={`Assistant: ${assistantMessages}`}
          />
        )}
        {toolPct > 0 && (
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${toolPct}%` }}
            title={`Tool: ${toolMessages}`}
          />
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          User ({userMessages})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Assistant ({assistantMessages})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Tool ({toolMessages})
        </span>
      </div>
    </div>
  );
}

function TokenBars({
  tokensIn,
  tokensOut,
}: {
  tokensIn: number;
  tokensOut: number;
}) {
  const total = tokensIn + tokensOut;
  if (total === 0) return null;

  const inPct = (tokensIn / total) * 100;
  const outPct = (tokensOut / total) * 100;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Token Usage</p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12">Input</span>
          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${inPct}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground w-16 text-right">
            {tokensIn.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12">Output</span>
          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${outPct}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground w-16 text-right">
            {tokensOut.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function ToolBreakdown({ tools }: { tools: Record<string, number> }) {
  const entries = Object.entries(tools).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  const maxCount = Math.max(...entries.map(([, v]) => v));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Tool Usage</p>
      <div className="space-y-1.5">
        {entries.slice(0, 8).map(([name, count]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-28 truncate" title={name}>
              {name}
            </span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-6 text-right">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ThreadAnalyticsPanel({
  threadId,
  className,
}: ThreadAnalyticsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: analytics, isLoading } = useThreadAnalytics(threadId);
  const calculateMutation = useCalculateThreadAnalytics(threadId);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className={cn('border-t border-border', className)}>
      {/* Collapsible header */}
      <button
        className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Thread Analytics</span>
        {analytics && analytics.total_messages > 0 && (
          <Badge variant="secondary" className="ml-auto text-xs h-5">
            {analytics.total_messages} msgs
          </Badge>
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!isLoading && analytics && (
            <>
              {/* Recalculate button */}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => calculateMutation.mutate()}
                  disabled={calculateMutation.isPending}
                >
                  <RefreshCw
                    className={cn(
                      'h-3 w-3',
                      calculateMutation.isPending && 'animate-spin'
                    )}
                  />
                  {calculateMutation.isPending ? 'Computing...' : 'Recalculate'}
                </Button>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  icon={MessageSquare}
                  label="Messages"
                  value={analytics.total_messages}
                  colorClass="text-blue-500"
                />
                <StatCard
                  icon={Wrench}
                  label="Tool Calls"
                  value={analytics.tool_call_count}
                  colorClass="text-amber-500"
                />
                <StatCard
                  icon={Cpu}
                  label="Tokens"
                  value={(analytics.total_tokens_in + analytics.total_tokens_out).toLocaleString()}
                  subValue={`In: ${analytics.total_tokens_in.toLocaleString()} / Out: ${analytics.total_tokens_out.toLocaleString()}`}
                  colorClass="text-purple-500"
                />
                <StatCard
                  icon={Clock}
                  label="Duration"
                  value={formatDuration(analytics.duration_seconds)}
                  subValue={
                    analytics.first_message_at
                      ? `Started ${format(parseISO(analytics.first_message_at), 'MMM d, HH:mm')}`
                      : undefined
                  }
                  colorClass="text-cyan-500"
                />
              </div>

              {analytics.total_cost > 0 && (
                <StatCard
                  icon={DollarSign}
                  label="Estimated Cost"
                  value={`$${analytics.total_cost.toFixed(4)}`}
                  colorClass="text-emerald-500"
                />
              )}

              {/* Message breakdown pie */}
              <MessageBreakdownBar
                userMessages={analytics.user_messages}
                assistantMessages={analytics.assistant_messages}
                toolMessages={analytics.tool_messages}
                total={analytics.total_messages}
              />

              {/* Token bars */}
              <TokenBars
                tokensIn={analytics.total_tokens_in}
                tokensOut={analytics.total_tokens_out}
              />

              {/* Tool breakdown */}
              <ToolBreakdown tools={analytics.tool_breakdown} />

              {/* Computed at */}
              {analytics.computed_at && (
                <p className="text-xs text-muted-foreground text-right">
                  Computed {format(parseISO(analytics.computed_at), 'MMM d, HH:mm')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
