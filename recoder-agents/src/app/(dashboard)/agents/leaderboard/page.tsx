'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Trophy,
  TrendingUp,
  Zap,
  DollarSign,
  Activity,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAgentLeaderboard } from '@/hooks/agents/use-agent-comparison';
import type { LeaderboardEntry } from '@/lib/api/agent-comparison';

type MetricKey = 'runs' | 'success_rate' | 'cost_efficiency' | 'speed';

interface MetricTab {
  key: MetricKey;
  label: string;
  icon: React.ElementType;
  valueAccessor: (entry: LeaderboardEntry) => string;
  valueLabel: string;
}

const METRIC_TABS: MetricTab[] = [
  {
    key: 'runs',
    label: 'Most Used',
    icon: Activity,
    valueAccessor: (e) => e.total_runs.toLocaleString(),
    valueLabel: 'Total Runs',
  },
  {
    key: 'success_rate',
    label: 'Best Success Rate',
    icon: TrendingUp,
    valueAccessor: (e) => `${e.success_rate}%`,
    valueLabel: 'Success Rate',
  },
  {
    key: 'cost_efficiency',
    label: 'Most Cost-Efficient',
    icon: DollarSign,
    valueAccessor: (e) => `$${e.avg_cost_per_run.toFixed(4)}`,
    valueLabel: 'Cost/Run',
  },
  {
    key: 'speed',
    label: 'Fastest',
    icon: Zap,
    valueAccessor: (e) => `${e.avg_latency_ms.toLocaleString()}ms`,
    valueLabel: 'Avg Latency',
  },
];

function getRankDisplay(rank: number): React.ReactNode {
  switch (rank) {
    case 1:
      return <span className="text-lg" title="1st place">&#129351;</span>;
    case 2:
      return <span className="text-lg" title="2nd place">&#129352;</span>;
    case 3:
      return <span className="text-lg" title="3rd place">&#129353;</span>;
    default:
      return <span className="text-sm text-muted-foreground font-mono">{rank}</span>;
  }
}

function SummaryCards({ data }: { data: LeaderboardEntry[] }) {
  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return { totalAgents: 0, totalRuns: 0, avgSuccessRate: 0, totalSpend: 0 };
    }
    const totalRuns = data.reduce((sum, e) => sum + e.total_runs, 0);
    const avgSuccessRate =
      data.length > 0
        ? data.reduce((sum, e) => sum + e.success_rate, 0) / data.length
        : 0;
    const totalSpend = data.reduce((sum, e) => sum + e.total_cost, 0);
    return {
      totalAgents: data.length,
      totalRuns,
      avgSuccessRate: Math.round(avgSuccessRate * 10) / 10,
      totalSpend: Math.round(totalSpend * 100) / 100,
    };
  }, [data]);

  const cards = [
    {
      title: 'Total Agents',
      value: stats.totalAgents.toString(),
      icon: BarChart3,
      description: 'With recorded runs',
    },
    {
      title: 'Total Runs',
      value: stats.totalRuns.toLocaleString(),
      icon: Activity,
      description: 'Across all agents',
    },
    {
      title: 'Avg Success Rate',
      value: `${stats.avgSuccessRate}%`,
      icon: TrendingUp,
      description: 'Mean across agents',
    },
    {
      title: 'Total Spend',
      value: `$${stats.totalSpend.toFixed(2)}`,
      icon: DollarSign,
      description: 'All-time cost',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold tracking-tight">{value(card)}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function value(card: { value: string }): string {
  return card.value;
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/50">
        <CardContent className="pt-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-20 ml-auto" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-border/50">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Trophy className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No leaderboard data yet</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Run your agents to start seeing performance metrics here. The leaderboard will populate
          once agents have completed at least one run.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Start a new task
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

export default function LeaderboardPage() {
  const [metric, setMetric] = useState<MetricKey>('runs');
  const { data: leaderboard, isLoading, error } = useAgentLeaderboard(metric, 25);

  const activeTab = METRIC_TABS.find((t) => t.key === metric) || METRIC_TABS[0];

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-yellow-500" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agent Leaderboard</h1>
            <p className="text-sm text-muted-foreground">
              <Link href="/agents" className="hover:underline">
                Agents
              </Link>
              <span className="mx-1.5">/</span>
              Leaderboard
            </p>
          </div>
        </div>
      </div>

      {/* Metric Tabs */}
      <Tabs
        value={metric}
        onValueChange={(v) => setMetric(v as MetricKey)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          {METRIC_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5 text-xs sm:text-sm">
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ').pop()}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Content */}
      {isLoading ? (
        <LeaderboardSkeleton />
      ) : error || !leaderboard ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              Failed to load leaderboard. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : leaderboard.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <SummaryCards data={leaderboard} />

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <activeTab.icon className="h-4 w-4" />
                Ranked by {activeTab.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Rank</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">{activeTab.valueLabel}</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Success</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((entry) => (
                    <TableRow
                      key={entry.agent_id}
                      className={cn(
                        'transition-colors',
                        entry.rank <= 3 && 'bg-muted/30'
                      )}
                    >
                      <TableCell className="text-center">
                        {getRankDisplay(entry.rank)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/agents/config/${entry.agent_id}`}
                          className="font-medium hover:underline text-foreground"
                        >
                          {entry.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {entry.model}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {activeTab.valueAccessor(entry)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {entry.total_runs.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span
                          className={cn(
                            entry.success_rate >= 90
                              ? 'text-green-600 dark:text-green-400'
                              : entry.success_rate >= 70
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {entry.success_rate}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
