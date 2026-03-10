'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ScrollText,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { useAgentLogs, useLogSummary } from '@/hooks/agents/use-execution-logs';
import type { ExecutionLog } from '@/lib/api/execution-logs';

// ---- Types ----

interface LogsScreenProps {
  agentId: string;
}

const LEVELS = [
  { value: 'all', label: 'All Levels' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
];

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'general', label: 'General' },
  { value: 'tool_call', label: 'Tool Call' },
  { value: 'llm_request', label: 'LLM Request' },
  { value: 'llm_response', label: 'LLM Response' },
  { value: 'system', label: 'System' },
  { value: 'user_input', label: 'User Input' },
];

const PAGE_SIZE = 50;

// ---- Helpers ----

function getLevelColor(level: string) {
  switch (level) {
    case 'error':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'warn':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'info':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'debug':
      return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function getLevelIcon(level: string) {
  switch (level) {
    case 'error':
      return <AlertCircle className="h-3 w-3" />;
    case 'warn':
      return <AlertTriangle className="h-3 w-3" />;
    case 'info':
      return <Info className="h-3 w-3" />;
    case 'debug':
      return <Bug className="h-3 w-3" />;
    default:
      return <Info className="h-3 w-3" />;
  }
}

function getCategoryLabel(category: string) {
  const entry = CATEGORIES.find((c) => c.value === category);
  return entry?.label || category;
}

function formatTimestamp(ts: string): string {
  try {
    return format(parseISO(ts), 'MMM d, HH:mm:ss.SSS');
  } catch {
    return ts;
  }
}

// ---- Component ----

export function LogsScreen({ agentId }: LogsScreenProps) {
  const [levelFilter, setLevelFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [offset, setOffset] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      level: levelFilter !== 'all' ? levelFilter : undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [levelFilter, categoryFilter, offset]
  );

  const {
    data: logs,
    isLoading: logsLoading,
    isFetching: logsFetching,
    refetch: refetchLogs,
  } = useAgentLogs(agentId, filters);

  // Auto-refresh: poll every 10s when enabled
  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      refetchLogs();
    }, 10_000);
    return () => clearInterval(interval);
  }, [autoRefresh, refetchLogs]);

  const {
    data: summary,
    isLoading: summaryLoading,
  } = useLogSummary(agentId);

  const handleToggleExpand = useCallback((logId: string) => {
    setExpandedLogId((prev) => (prev === logId ? null : logId));
  }, []);

  const handleResetFilters = useCallback(() => {
    setLevelFilter('all');
    setCategoryFilter('all');
    setOffset(0);
  }, []);

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const handleLoadPrevious = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
  }, []);

  // Loading state
  if (logsLoading && summaryLoading) {
    return <LogsLoadingSkeleton />;
  }

  return (
    <div className="flex-1 overflow-auto pb-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-1 pt-1 pb-4">
        <SummaryCard
          label="Total Logs"
          value={summary?.total ?? 0}
          icon={ScrollText}
          color="text-foreground"
        />
        <SummaryCard
          label="Errors"
          value={summary?.error ?? 0}
          icon={AlertCircle}
          color="text-red-500"
          bgColor="bg-red-500/5"
        />
        <SummaryCard
          label="Warnings"
          value={summary?.warn ?? 0}
          icon={AlertTriangle}
          color="text-amber-500"
          bgColor="bg-amber-500/5"
        />
        <SummaryCard
          label="Debug"
          value={summary?.debug ?? 0}
          icon={Bug}
          color="text-zinc-400"
          bgColor="bg-zinc-500/5"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 px-1 pb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setOffset(0); }}>
            <SelectTrigger className="h-9 w-[140px] text-sm">
              <SelectValue placeholder="All Levels" />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setOffset(0); }}>
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {(levelFilter !== 'all' || categoryFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={handleResetFilters}
            >
              Clear filters
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
              Auto-refresh
            </Label>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetchLogs()}
            disabled={logsFetching}
          >
            <RefreshCw className={cn('h-4 w-4', logsFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Log Table */}
      {!logs || logs.length === 0 ? (
        <EmptyState hasFilters={levelFilter !== 'all' || categoryFilter !== 'all'} />
      ) : (
        <div className="px-1 space-y-1.5">
          {logs.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              isExpanded={expandedLogId === log.id}
              onToggleExpand={handleToggleExpand}
            />
          ))}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-xl"
              onClick={handleLoadPrevious}
              disabled={offset === 0}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Showing {offset + 1} - {offset + logs.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-xl"
              onClick={handleLoadMore}
              disabled={logs.length < PAGE_SIZE}
            >
              Load more
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sub Components ----

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor?: string;
}) {
  return (
    <SpotlightCard className={cn('bg-card border border-border', bgColor)}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={cn('h-4 w-4', color)} />
        </div>
        <span className={cn('text-xl font-semibold tabular-nums', color)}>
          {value.toLocaleString()}
        </span>
      </div>
    </SpotlightCard>
  );
}

function LogRow({
  log,
  isExpanded,
  onToggleExpand,
}: {
  log: ExecutionLog;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}) {
  const hasMetadata =
    log.metadata && Object.keys(log.metadata).length > 0;

  return (
    <SpotlightCard className="bg-card border border-border">
      <div className="px-4 py-3">
        {/* Main row */}
        <div className="flex items-start gap-3">
          {/* Timestamp */}
          <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap pt-0.5 flex-shrink-0">
            {formatTimestamp(log.timestamp)}
          </span>

          {/* Level badge */}
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 flex items-center gap-1 flex-shrink-0',
              getLevelColor(log.level)
            )}
          >
            {getLevelIcon(log.level)}
            {log.level}
          </Badge>

          {/* Category badge */}
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 flex-shrink-0"
          >
            {getCategoryLabel(log.category)}
          </Badge>

          {/* Message */}
          <p className="text-sm text-foreground flex-1 min-w-0 break-words line-clamp-2">
            {log.message}
          </p>

          {/* Expand button */}
          {hasMetadata && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => onToggleExpand(log.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Expanded metadata */}
        {isExpanded && hasMetadata && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted-foreground font-medium">Metadata</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                run: {log.agent_run_id}
              </span>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 overflow-auto max-h-64">
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </SpotlightCard>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
        <ScrollText className="h-6 w-6 text-muted-foreground" />
      </div>
      <h4 className="text-sm font-semibold text-foreground mb-2">
        {hasFilters ? 'No logs match your filters' : 'No execution logs yet'}
      </h4>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
        {hasFilters
          ? 'Try adjusting the level or category filters to see more results.'
          : 'Logs will appear here when your agent runs. Start a conversation to generate your first logs.'}
      </p>
    </div>
  );
}

function LogsLoadingSkeleton() {
  return (
    <div className="flex-1 overflow-auto pb-6">
      <div className="px-1 pt-1 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-[140px] rounded-lg" />
          <Skeleton className="h-9 w-[160px] rounded-lg" />
          <div className="ml-auto" />
          <Skeleton className="h-6 w-24 rounded-lg" />
        </div>

        {/* Log rows */}
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
