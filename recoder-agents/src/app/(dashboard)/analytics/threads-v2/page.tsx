'use client';

import React, { useState } from 'react';
import {
  BarChart2,
  TrendingUp,
  MessageSquare,
  Clock,
  Star,
  Zap,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  useAnalyticsSummary,
  useAnalyticsTrends,
  useTopThreadsV2,
  useUpsertThreadAnalytics,
  useRecordThreadEvent,
  useThreadEvents,
} from '@/hooks/threads/use-thread-analytics-v2';

const EVENT_TYPES = [
  'message_sent',
  'message_received',
  'file_uploaded',
  'tool_used',
  'session_start',
  'session_end',
  'error',
  'rating',
] as const;

const EVENT_COLORS: Record<string, string> = {
  message_sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  message_received: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  file_uploaded: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  tool_used: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  session_start: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  session_end: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  rating: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
};

// ─── Summary Stat Card ────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  colorClass?: string;
}) {
  return (
    <SpotlightCard className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg bg-muted', colorClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold mt-0.5">{value}</p>
        </div>
      </div>
    </SpotlightCard>
  );
}

// ─── Summary Section ──────────────────────────────────────────────────────────

function SummarySection() {
  const { data: summary, isLoading } = useAnalyticsSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (!summary) {
    return (
      <SpotlightCard className="p-8 text-center mb-6">
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
        <p className="text-sm text-muted-foreground">No analytics data yet</p>
      </SpotlightCard>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      <StatCard
        icon={BarChart2}
        label="Total Threads"
        value={summary.total_threads}
        colorClass="text-blue-500"
      />
      <StatCard
        icon={MessageSquare}
        label="Avg Messages"
        value={summary.avg_messages.toFixed(1)}
        colorClass="text-green-500"
      />
      <StatCard
        icon={Zap}
        label="Avg Tokens"
        value={summary.avg_tokens.toFixed(0)}
        colorClass="text-purple-500"
      />
      <StatCard
        icon={Clock}
        label="Avg Response (ms)"
        value={Math.round(summary.avg_response_time).toLocaleString()}
        colorClass="text-amber-500"
      />
      <StatCard
        icon={Star}
        label="Avg Satisfaction"
        value={`${summary.avg_satisfaction.toFixed(2)} / 5`}
        colorClass="text-yellow-500"
      />
    </div>
  );
}

// ─── Trends Chart ─────────────────────────────────────────────────────────────

function TrendsChart() {
  const { data: trends, isLoading } = useAnalyticsTrends();

  if (isLoading) return <Skeleton className="h-64 w-full mb-6" />;

  if (!trends || trends.length === 0) {
    return (
      <SpotlightCard className="p-6 text-center mb-6">
        <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
        <p className="text-sm text-muted-foreground">No trend data for the last 30 days</p>
      </SpotlightCard>
    );
  }

  const formatted = trends.map((t) => ({
    ...t,
    date: format(parseISO(t.date), 'MMM d'),
  }));

  return (
    <SpotlightCard className="p-4 mb-6">
      <h3 className="text-sm font-medium mb-4">Engagement Trends (Last 30 Days)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={formatted} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 5]}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="thread_count"
            name="Thread Count"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avg_satisfaction"
            name="Avg Satisfaction"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </SpotlightCard>
  );
}

// ─── Top Threads Table ────────────────────────────────────────────────────────

function TopThreadsTable() {
  const { data: threads, isLoading } = useTopThreadsV2(15);

  if (isLoading) return <Skeleton className="h-48 w-full mb-6" />;

  return (
    <SpotlightCard className="p-4 mb-6">
      <h3 className="text-sm font-medium mb-3">Top Threads by Messages</h3>
      {threads && threads.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 text-muted-foreground font-medium">#</th>
                <th className="pb-2 text-muted-foreground font-medium">Thread ID</th>
                <th className="pb-2 text-muted-foreground font-medium">Agent</th>
                <th className="pb-2 text-muted-foreground font-medium text-right">Messages</th>
                <th className="pb-2 text-muted-foreground font-medium text-right hidden sm:table-cell">
                  User
                </th>
                <th className="pb-2 text-muted-foreground font-medium text-right hidden sm:table-cell">
                  Agent
                </th>
                <th className="pb-2 text-muted-foreground font-medium text-right hidden md:table-cell">
                  Tokens
                </th>
                <th className="pb-2 text-muted-foreground font-medium text-right hidden md:table-cell">
                  Complete%
                </th>
                <th className="pb-2 text-muted-foreground font-medium text-right hidden lg:table-cell">
                  Satisfaction
                </th>
              </tr>
            </thead>
            <tbody>
              {threads.map((t, idx) => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="py-2 font-mono">{t.thread_id.slice(0, 12)}…</td>
                  <td className="py-2 text-muted-foreground">
                    {t.agent_id ? t.agent_id.slice(0, 8) : '—'}
                  </td>
                  <td className="py-2 text-right">
                    <Badge variant="secondary" className="text-xs font-mono">
                      {t.total_messages}
                    </Badge>
                  </td>
                  <td className="py-2 text-right text-muted-foreground hidden sm:table-cell">
                    {t.user_messages}
                  </td>
                  <td className="py-2 text-right text-muted-foreground hidden sm:table-cell">
                    {t.agent_messages}
                  </td>
                  <td className="py-2 text-right text-muted-foreground hidden md:table-cell">
                    {t.total_tokens.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-muted-foreground hidden md:table-cell">
                    {t.completion_rate.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right hidden lg:table-cell">
                    {t.user_satisfaction_score != null ? (
                      <span className="text-yellow-500">
                        {'★'.repeat(Math.round(t.user_satisfaction_score))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">
          No thread analytics data yet
        </p>
      )}
    </SpotlightCard>
  );
}

// ─── Record Analytics Panel ───────────────────────────────────────────────────

function RecordAnalyticsPanel() {
  const [threadId, setThreadId] = useState('');
  const [totalMessages, setTotalMessages] = useState('');
  const [userMessages, setUserMessages] = useState('');
  const [agentMessages, setAgentMessages] = useState('');
  const [totalTokens, setTotalTokens] = useState('');
  const [avgResponseTime, setAvgResponseTime] = useState('');
  const [satisfaction, setSatisfaction] = useState('');
  const [completionRate, setCompletionRate] = useState('');

  const upsertMutation = useUpsertThreadAnalytics();

  const handleSubmit = async () => {
    if (!threadId.trim()) {
      toast.error('Thread ID is required');
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        threadId,
        data: {
          total_messages: totalMessages ? parseInt(totalMessages) : undefined,
          user_messages: userMessages ? parseInt(userMessages) : undefined,
          agent_messages: agentMessages ? parseInt(agentMessages) : undefined,
          total_tokens: totalTokens ? parseInt(totalTokens) : undefined,
          avg_response_time_ms: avgResponseTime ? parseInt(avgResponseTime) : undefined,
          user_satisfaction_score: satisfaction ? parseFloat(satisfaction) : undefined,
          completion_rate: completionRate ? parseFloat(completionRate) : undefined,
        },
      });
      toast.success('Analytics recorded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to record analytics');
    }
  };

  return (
    <SpotlightCard className="p-4 mb-6">
      <h3 className="text-sm font-medium mb-3">Record Thread Analytics</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <Label className="text-xs">Thread ID *</Label>
          <Input
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            placeholder="thread_id"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Total Messages</Label>
          <Input
            type="number"
            value={totalMessages}
            onChange={(e) => setTotalMessages(e.target.value)}
            placeholder="0"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">User Messages</Label>
          <Input
            type="number"
            value={userMessages}
            onChange={(e) => setUserMessages(e.target.value)}
            placeholder="0"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Agent Messages</Label>
          <Input
            type="number"
            value={agentMessages}
            onChange={(e) => setAgentMessages(e.target.value)}
            placeholder="0"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Total Tokens</Label>
          <Input
            type="number"
            value={totalTokens}
            onChange={(e) => setTotalTokens(e.target.value)}
            placeholder="0"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Avg Response (ms)</Label>
          <Input
            type="number"
            value={avgResponseTime}
            onChange={(e) => setAvgResponseTime(e.target.value)}
            placeholder="0"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Satisfaction (0-5)</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            max="5"
            value={satisfaction}
            onChange={(e) => setSatisfaction(e.target.value)}
            placeholder="4.5"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Completion Rate (%)</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={completionRate}
            onChange={(e) => setCompletionRate(e.target.value)}
            placeholder="80.0"
            className="mt-1 h-8 text-xs"
          />
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={upsertMutation.isPending}
        className="gap-2"
      >
        {upsertMutation.isPending ? 'Saving…' : 'Save Analytics'}
      </Button>
    </SpotlightCard>
  );
}

// ─── Event Timeline ───────────────────────────────────────────────────────────

function EventTimeline() {
  const [threadId, setThreadId] = useState('');
  const [activeThreadId, setActiveThreadId] = useState('');
  const [showRecordPanel, setShowRecordPanel] = useState(false);
  const [eventType, setEventType] = useState<string>(EVENT_TYPES[0]);
  const [eventData, setEventData] = useState('{}');

  const { data: events, isLoading } = useThreadEvents(activeThreadId);
  const recordMutation = useRecordThreadEvent();

  const handleLoad = () => {
    if (!threadId.trim()) {
      toast.error('Enter a thread ID');
      return;
    }
    setActiveThreadId(threadId.trim());
  };

  const handleRecord = async () => {
    if (!activeThreadId) {
      toast.error('Load a thread first');
      return;
    }
    let parsedData = {};
    try {
      parsedData = JSON.parse(eventData || '{}');
    } catch {
      toast.error('Invalid JSON for event data');
      return;
    }
    try {
      await recordMutation.mutateAsync({
        threadId: activeThreadId,
        data: { event_type: eventType, event_data: parsedData },
      });
      toast.success('Event recorded');
      setEventData('{}');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to record event');
    }
  };

  return (
    <SpotlightCard className="p-4">
      <h3 className="text-sm font-medium mb-3">Event Timeline</h3>

      {/* Thread load */}
      <div className="flex items-center gap-2 mb-4">
        <Input
          value={threadId}
          onChange={(e) => setThreadId(e.target.value)}
          placeholder="Enter thread ID"
          className="h-8 text-xs"
          onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
        />
        <Button size="sm" variant="outline" onClick={handleLoad} className="h-8 text-xs">
          Load
        </Button>
      </div>

      {/* Record event panel */}
      <div className="mb-4">
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          onClick={() => setShowRecordPanel(!showRecordPanel)}
        >
          {showRecordPanel ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Record New Event
        </button>
        {showRecordPanel && (
          <div className="space-y-2 p-3 border border-border rounded-lg bg-muted/20">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Event Type</Label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="mt-1 w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Event Data (JSON)</Label>
                <Input
                  value={eventData}
                  onChange={(e) => setEventData(e.target.value)}
                  placeholder="{}"
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleRecord}
              disabled={recordMutation.isPending || !activeThreadId}
              className="h-7 text-xs gap-1"
            >
              {recordMutation.isPending ? 'Recording…' : 'Record Event'}
            </Button>
          </div>
        )}
      </div>

      {/* Timeline */}
      {activeThreadId && (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <div className="relative pl-4">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-3">
                {events.map((ev) => (
                  <div key={ev.id} className="relative flex gap-3">
                    <div className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            EVENT_COLORS[ev.event_type] ??
                              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                          )}
                        >
                          {ev.event_type}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(parseISO(ev.occurred_at), 'MMM d, HH:mm:ss')}
                        </span>
                      </div>
                      {ev.event_data && Object.keys(ev.event_data).length > 0 && (
                        <pre className="text-[10px] font-mono text-muted-foreground bg-muted/40 rounded p-1.5 overflow-x-auto">
                          {JSON.stringify(ev.event_data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No events found for this thread
            </p>
          )}
        </>
      )}

      {!activeThreadId && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Enter a thread ID and click Load to see events
        </p>
      )}
    </SpotlightCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ThreadAnalyticsV2Page() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="border-b border-border px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Thread Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Engagement trends, satisfaction scores, and event timelines
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Summary stats */}
          <SummarySection />

          {/* Engagement trends chart */}
          <TrendsChart />

          {/* Top threads table */}
          <TopThreadsTable />

          {/* Record analytics */}
          <RecordAnalyticsPanel />

          {/* Event timeline */}
          <EventTimeline />
        </div>
      </div>
    </div>
  );
}
