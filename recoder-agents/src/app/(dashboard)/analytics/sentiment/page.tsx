'use client';

import React, { useState } from 'react';
import {
  Smile,
  Frown,
  Meh,
  TrendingUp,
  BarChart3,
  Brain,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useSentimentOverview,
  useSentimentTrend,
} from '@/hooks/threads/use-thread-sentiment';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ============================================================================
// Constants
// ============================================================================

const SENTIMENT_COLORS: Record<string, string> = {
  very_positive: '#22c55e',
  positive: '#4ade80',
  neutral: '#9ca3af',
  negative: '#f97316',
  very_negative: '#ef4444',
};

const SENTIMENT_LABELS: Record<string, string> = {
  very_positive: 'Very Positive',
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  very_negative: 'Very Negative',
};

// ============================================================================
// Distribution Pie Chart
// ============================================================================

function DistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const data = Object.entries(distribution).map(([sentiment, count]) => ({
    name: SENTIMENT_LABELS[sentiment] || sentiment,
    value: count,
    sentiment,
  }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            Sentiment Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          No sentiment data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Sentiment Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
            >
              {data.map((entry) => (
                <Cell
                  key={entry.sentiment}
                  fill={SENTIMENT_COLORS[entry.sentiment] || '#9ca3af'}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Trend Line Chart
// ============================================================================

function TrendChart({ threadId }: { threadId: string }) {
  const { data: trend, isLoading } = useSentimentTrend(threadId, {
    enabled: !!threadId,
  });

  if (!threadId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Sentiment Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          Select a thread to view sentiment trend
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Sentiment Trend
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }

  const chartData = (trend || []).map((point) => ({
    message: `Msg ${point.message_index}`,
    value: point.value,
    sentiment: point.sentiment,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Sentiment Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No sentiment data for this thread
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <XAxis dataKey="message" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[-2, 2]}
                ticks={[-2, -1, 0, 1, 2]}
                tickFormatter={(v) => {
                  const labels: Record<number, string> = {
                    '-2': 'V.Neg',
                    '-1': 'Neg',
                    '0': 'Neutral',
                    '1': 'Pos',
                    '2': 'V.Pos',
                  };
                  return labels[String(v) as unknown as keyof typeof labels] || String(v);
                }}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                formatter={(value: number) => {
                  const labels: Record<number, string> = {
                    2: 'Very Positive',
                    1: 'Positive',
                    0: 'Neutral',
                    [-1]: 'Negative',
                    [-2]: 'Very Negative',
                  };
                  return [labels[value] || String(value), 'Sentiment'];
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4, fill: '#6366f1' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Thread Lists
// ============================================================================

function ThreadList({
  title,
  icon: Icon,
  threads,
  variant,
}: {
  title: string;
  icon: React.ElementType;
  threads: Array<{ thread_id: string; avg_sentiment: number; message_count: number }>;
  variant: 'positive' | 'negative';
}) {
  const badgeClass =
    variant === 'positive'
      ? 'bg-green-500/15 text-green-600 border-green-500/30'
      : 'bg-red-500/15 text-red-600 border-red-500/30';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No threads found</p>
        ) : (
          <div className="space-y-2">
            {threads.map((t) => (
              <div
                key={t.thread_id}
                className="flex items-center justify-between p-2 rounded-lg border"
              >
                <span className="text-sm font-mono truncate max-w-[200px]" title={t.thread_id}>
                  {t.thread_id.slice(0, 20)}...
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t.message_count} msgs
                  </span>
                  <Badge className={badgeClass} variant="outline">
                    {t.avg_sentiment > 0 ? '+' : ''}{t.avg_sentiment.toFixed(1)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Per-Agent Bar Chart
// ============================================================================

function AgentSentimentChart({
  data,
}: {
  data: Array<{ agent_id: string; avg_sentiment: number; message_count: number }>;
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            Per-Agent Sentiment
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          No per-agent data available
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    agent: d.agent_id.length > 15 ? d.agent_id.slice(0, 15) + '...' : d.agent_id,
    sentiment: d.avg_sentiment,
    messages: d.message_count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4" />
          Per-Agent Sentiment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <XAxis type="number" domain={[-2, 2]} />
            <YAxis type="category" dataKey="agent" width={120} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) => [value.toFixed(2), 'Avg Sentiment']}
            />
            <Bar dataKey="sentiment" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={
                    entry.sentiment >= 1
                      ? '#22c55e'
                      : entry.sentiment >= 0
                        ? '#4ade80'
                        : entry.sentiment >= -1
                          ? '#f97316'
                          : '#ef4444'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function SentimentAnalyticsPage() {
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const { data: overview, isLoading } = useSentimentOverview();

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <h1 className="text-2xl font-bold">Sentiment Analytics</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Collect all thread IDs from both positive and negative lists for the selector
  const allThreadIds = [
    ...(overview?.most_positive_threads || []).map((t) => t.thread_id),
    ...(overview?.most_negative_threads || []).map((t) => t.thread_id),
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sentiment Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Analyze conversation sentiment across threads and agents
          </p>
        </div>
      </div>

      {/* Distribution + Trend Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionChart distribution={overview?.distribution || {}} />

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Thread:</label>
            <Select value={selectedThreadId || 'none'} onValueChange={(v) => setSelectedThreadId(v === 'none' ? '' : v)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a thread" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a thread...</SelectItem>
                {allThreadIds.map((tid) => (
                  <SelectItem key={tid} value={tid}>
                    {tid.slice(0, 24)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TrendChart threadId={selectedThreadId} />
        </div>
      </div>

      {/* Positive / Negative Thread Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ThreadList
          title="Most Positive Threads"
          icon={Smile}
          threads={overview?.most_positive_threads || []}
          variant="positive"
        />
        <ThreadList
          title="Most Negative Threads"
          icon={Frown}
          threads={overview?.most_negative_threads || []}
          variant="negative"
        />
      </div>

      {/* Per-Agent Comparison */}
      <AgentSentimentChart data={overview?.per_agent_avg || []} />
    </div>
  );
}
