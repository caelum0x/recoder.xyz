'use client';

import React, { useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MessageSquare,
  Wrench,
  Cpu,
  Clock,
  DollarSign,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  useThreadAnalytics,
  useCalculateThreadAnalytics,
} from '@/hooks/threads/use-thread-analytics';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface ThreadAnalyticsHeaderButtonProps {
  threadId: string;
}

export function ThreadAnalyticsHeaderButton({
  threadId,
}: ThreadAnalyticsHeaderButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: analytics, isLoading } = useThreadAnalytics(threadId);
  const calculateMutation = useCalculateThreadAnalytics(threadId);

  const hasData = analytics && analytics.total_messages > 0;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 cursor-pointer gap-1.5"
        >
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">Analytics</span>
          {isOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="absolute right-0 top-12 sm:top-14 z-30 w-80 sm:w-96 max-h-[70vh] overflow-y-auto bg-background border rounded-lg shadow-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Thread Analytics
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => calculateMutation.mutate()}
            disabled={calculateMutation.isPending}
          >
            {calculateMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            {hasData ? 'Recalculate' : 'Calculate'}
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !hasData && !calculateMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <BarChart3 className="h-8 w-8 opacity-30 mb-2" />
            <p className="text-xs">No analytics computed yet.</p>
            <p className="text-xs">
              Click &quot;Calculate&quot; to generate analytics from messages.
            </p>
          </div>
        )}

        {!isLoading && hasData && analytics && (
          <div className="space-y-3">
            {/* Quick stats grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Messages</p>
                  <p className="text-xs font-semibold">{analytics.total_messages}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Wrench className="h-3.5 w-3.5 text-amber-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Tool Calls</p>
                  <p className="text-xs font-semibold">{analytics.tool_call_count}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Cpu className="h-3.5 w-3.5 text-purple-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Tokens</p>
                  <p className="text-xs font-semibold">
                    {(analytics.total_tokens_in + analytics.total_tokens_out).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Clock className="h-3.5 w-3.5 text-cyan-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Duration</p>
                  <p className="text-xs font-semibold">
                    {formatDuration(analytics.duration_seconds)}
                  </p>
                </div>
              </div>
            </div>

            {/* Message breakdown */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Message Breakdown
              </p>
              <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-muted">
                {analytics.user_messages > 0 && (
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${(analytics.user_messages / analytics.total_messages) * 100}%`,
                    }}
                  />
                )}
                {analytics.assistant_messages > 0 && (
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: `${(analytics.assistant_messages / analytics.total_messages) * 100}%`,
                    }}
                  />
                )}
                {analytics.tool_messages > 0 && (
                  <div
                    className="h-full bg-amber-500"
                    style={{
                      width: `${(analytics.tool_messages / analytics.total_messages) * 100}%`,
                    }}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  User ({analytics.user_messages})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Assistant ({analytics.assistant_messages})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Tool ({analytics.tool_messages})
                </span>
              </div>
            </div>

            {/* Cost */}
            {analytics.total_cost > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Estimated Cost</p>
                  <p className="text-xs font-semibold">${analytics.total_cost.toFixed(4)}</p>
                </div>
              </div>
            )}

            {/* Token bars */}
            {(analytics.total_tokens_in > 0 || analytics.total_tokens_out > 0) && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Token Usage
                </p>
                {[
                  { label: 'Input', value: analytics.total_tokens_in, color: 'bg-indigo-500' },
                  { label: 'Output', value: analytics.total_tokens_out, color: 'bg-violet-500' },
                ].map(({ label, value, color }) => {
                  const total = analytics.total_tokens_in + analytics.total_tokens_out;
                  const pct = total > 0 ? (value / total) * 100 : 0;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-10">{label}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', color)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-14 text-right">
                        {value.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Computed at */}
            {analytics.computed_at && (
              <p className="text-[10px] text-muted-foreground text-right pt-1">
                Computed {format(parseISO(analytics.computed_at), 'MMM d, HH:mm')}
              </p>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
