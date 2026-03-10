'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity,
  Clock,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useWorkspaceActivitySummary, useWorkspaceActivityTimeline } from '@/hooks/workspaces/use-workspace-activity';
import { WorkspaceActivityFeed } from '@/components/dashboard/workspace-activity-feed';

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCards() {
  const { data: summary, isLoading } = useWorkspaceActivitySummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalEvents = summary?.total_events ?? 0;
  const mostActive =
    summary?.most_active_agents?.[0]?.name ?? 'N/A';
  const busiestHour =
    summary?.busiest_hours?.[0]
      ? `${String(summary.busiest_hours[0].hour).padStart(2, '0')}:00`
      : 'N/A';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{totalEvents}</p>
            <p className="text-xs text-muted-foreground">Events Today</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-lg font-semibold truncate">{mostActive}</p>
            <p className="text-xs text-muted-foreground">Most Active Agent</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-lg font-semibold">{busiestHour}</p>
            <p className="text-xs text-muted-foreground">Busiest Hour</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline chart
// ---------------------------------------------------------------------------

function TimelineChart() {
  const { data: timeline, isLoading } = useWorkspaceActivityTimeline(24);

  const chartData = useMemo(() => {
    if (!timeline) return [];
    return timeline.map((point) => {
      const date = new Date(point.hour);
      return {
        label: `${String(date.getHours()).padStart(2, '0')}:00`,
        count: point.count,
      };
    });
  }, [timeline]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Activity Timeline (Last 24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] animate-pulse rounded bg-muted" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No timeline data available
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 4, left: -20, bottom: 4 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivityFeedPage() {
  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-6 px-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity Feed</h1>
        <p className="text-sm text-muted-foreground">
          Track all workspace events and activity across your agents.
        </p>
      </div>

      {/* Summary */}
      <SummaryCards />

      {/* Timeline chart */}
      <TimelineChart />

      {/* Full activity list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-muted-foreground" />
            All Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorkspaceActivityFeed />
        </CardContent>
      </Card>
    </div>
  );
}
