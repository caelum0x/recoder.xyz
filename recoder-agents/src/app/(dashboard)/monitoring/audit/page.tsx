'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Shield,
  Download,
  Search,
  Clock,
  Activity,
  Zap,
  ChevronDown,
  ChevronRight,
  Filter,
  BarChart3,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import {
  useAuditLogs,
  useAuditSummary,
  useAuditTimeline,
  type AuditLogEntry,
  type AuditLogFilters,
} from '@/hooks/monitoring/use-audit-log';
import { exportAuditLogs } from '@/lib/api/audit-log';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESOURCE_TYPES = [
  'agent',
  'thread',
  'webhook',
  'api_key',
  'team',
  'billing',
  'settings',
  'deployment',
  'integration',
] as const;

const RESOURCE_TYPE_COLORS: Record<string, string> = {
  agent: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  thread: 'bg-green-500/10 text-green-500 border-green-500/20',
  webhook: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  api_key: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  team: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  billing: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  settings: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  deployment: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  integration: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
};

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [actionSearch, setActionSearch] = useState('');
  const [resourceIdSearch, setResourceIdSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Build effective filters including search debounce
  const effectiveFilters: AuditLogFilters = useMemo(
    () => ({
      ...filters,
      action: actionSearch || undefined,
      resource_id: resourceIdSearch || undefined,
    }),
    [filters, actionSearch, resourceIdSearch]
  );

  const { data: logsData, isLoading: logsLoading } = useAuditLogs(effectiveFilters);
  const { data: summary, isLoading: summaryLoading } = useAuditSummary(7);
  const { data: timeline, isLoading: timelineLoading } = useAuditTimeline(30);

  const logs = logsData?.logs ?? [];
  const total = logsData?.total ?? 0;
  const currentPage = Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Handlers
  const handleResourceTypeChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      resource_type: value === 'all' ? undefined : value,
      offset: 0,
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({
      ...prev,
      offset: (page - 1) * PAGE_SIZE,
    }));
  };

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const data = await exportAuditLogs(effectiveFilters);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Audit logs exported');
    } catch {
      toast.error('Failed to export audit logs');
    } finally {
      setIsExporting(false);
    }
  }, [effectiveFilters]);

  // Compute max bar height for timeline
  const maxTimelineCount = useMemo(() => {
    if (!timeline || timeline.length === 0) return 1;
    return Math.max(...timeline.map((t) => t.count), 1);
  }, [timeline]);

  // Summary helpers
  const mostActiveResource = useMemo(() => {
    if (!summary?.events_by_resource?.length) return '--';
    return summary.events_by_resource[0].resource_type;
  }, [summary]);

  const topAction = useMemo(() => {
    if (!summary?.top_actions?.length) return '--';
    return summary.top_actions[0].action;
  }, [summary]);

  const peakHour = useMemo(() => {
    if (!summary?.most_active_hours?.length) return '--';
    const h = summary.most_active_hours[0].hour;
    return `${h}:00`;
  }, [summary]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (logsLoading && summaryLoading) {
    return (
      <ScrollArea className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </ScrollArea>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScrollArea className="flex-1 overflow-y-auto">
      <div className="space-y-6 pb-8 p-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Audit Log
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track all actions and changes across your resources.
            </p>
          </div>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            icon={Activity}
            label="Total Events (7d)"
            value={summaryLoading ? '--' : String(summary?.total_events ?? 0)}
            color="blue"
          />
          <SummaryCard
            icon={BarChart3}
            label="Most Active Resource"
            value={summaryLoading ? '--' : mostActiveResource}
            color="green"
          />
          <SummaryCard
            icon={Zap}
            label="Top Action"
            value={summaryLoading ? '--' : topAction}
            color="amber"
          />
          <SummaryCard
            icon={Clock}
            label="Peak Hour"
            value={summaryLoading ? '--' : peakHour}
            color="purple"
          />
        </div>

        {/* Timeline Chart */}
        <SpotlightCard className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Events Timeline (30 days)
              </h3>
            </div>
            <Badge variant="outline" className="text-xs">
              {timeline?.length ?? 0} days
            </Badge>
          </div>

          {timelineLoading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : !timeline || timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <BarChart3 className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No timeline data yet.</p>
            </div>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {timeline.map((entry) => {
                const height = (entry.count / maxTimelineCount) * 100;
                return (
                  <div
                    key={entry.date}
                    className="flex-1 group relative"
                    title={`${entry.date}: ${entry.count} events`}
                  >
                    <div
                      className="bg-primary/60 hover:bg-primary/80 transition-colors rounded-t-sm w-full"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap z-10 shadow-md">
                      {entry.date}: {entry.count}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SpotlightCard>

        {/* Filter Bar */}
        <SpotlightCard className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Filters
            </div>

            <Select
              value={filters.resource_type ?? 'all'}
              onValueChange={handleResourceTypeChange}
            >
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Resource type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {RESOURCE_TYPES.map((rt) => (
                  <SelectItem key={rt} value={rt}>
                    {rt.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search action..."
                className="h-8 pl-8 text-xs w-[180px]"
                value={actionSearch}
                onChange={(e) => {
                  setActionSearch(e.target.value);
                  setFilters((prev) => ({ ...prev, offset: 0 }));
                }}
              />
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Resource ID..."
                className="h-8 pl-8 text-xs w-[180px]"
                value={resourceIdSearch}
                onChange={(e) => {
                  setResourceIdSearch(e.target.value);
                  setFilters((prev) => ({ ...prev, offset: 0 }));
                }}
              />
            </div>

            <Input
              type="date"
              className="h-8 text-xs w-[140px]"
              value={filters.date_from ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  date_from: e.target.value || undefined,
                  offset: 0,
                }))
              }
              placeholder="From date"
            />

            <Input
              type="date"
              className="h-8 text-xs w-[140px]"
              value={filters.date_to ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  date_to: e.target.value || undefined,
                  offset: 0,
                }))
              }
              placeholder="To date"
            />
          </div>
        </SpotlightCard>

        {/* Log Table */}
        <SpotlightCard className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Audit Events</h3>
            <Badge variant="outline" className="text-xs">
              {total} total
            </Badge>
          </div>

          {logsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Shield className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No audit events found.</p>
              <p className="text-xs mt-1">Events will appear here as actions are performed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-2 font-medium w-6" />
                    <th className="text-left py-2 pr-4 font-medium">Time</th>
                    <th className="text-left py-2 pr-4 font-medium">Action</th>
                    <th className="text-left py-2 pr-4 font-medium">Resource</th>
                    <th className="text-left py-2 pr-4 font-medium">Resource ID</th>
                    <th className="text-left py-2 pr-4 font-medium">Details</th>
                    <th className="text-left py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <AuditLogRow
                      key={log.id}
                      log={log}
                      isExpanded={expandedRow === log.id}
                      onToggle={() =>
                        setExpandedRow((prev) => (prev === log.id ? null : log.id))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="h-7 text-xs px-2"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="h-7 text-xs px-2"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </SpotlightCard>
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colorClasses = {
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-green-500 bg-green-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
  };

  return (
    <SpotlightCard className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', colorClasses[color])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold mt-0.5 truncate">{value}</p>
        </div>
      </div>
    </SpotlightCard>
  );
}

function AuditLogRow({
  log,
  isExpanded,
  onToggle,
}: {
  log: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails =
    log.details && Object.keys(log.details).length > 0;
  const colorClass =
    RESOURCE_TYPE_COLORS[log.resource_type] ??
    'bg-muted text-muted-foreground border-muted';

  const detailsPreview = useMemo(() => {
    if (!hasDetails) return '--';
    const keys = Object.keys(log.details);
    if (keys.length <= 2) {
      return keys.map((k) => `${k}: ${JSON.stringify(log.details[k])}`).join(', ');
    }
    return `${keys.length} fields`;
  }, [log.details, hasDetails]);

  return (
    <>
      <tr
        className={cn(
          'border-b border-muted/50 hover:bg-muted/20 transition-colors cursor-pointer',
          isExpanded && 'bg-muted/10'
        )}
        onClick={onToggle}
      >
        <td className="py-2.5 pr-2">
          {hasDetails ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : null}
        </td>
        <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">
          {log.created_at
            ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true })
            : '--'}
        </td>
        <td className="py-2.5 pr-4 font-medium text-foreground">
          {log.action}
        </td>
        <td className="py-2.5 pr-4">
          <Badge
            variant="outline"
            className={cn('text-xs font-normal border', colorClass)}
          >
            {log.resource_type.replace('_', ' ')}
          </Badge>
        </td>
        <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs truncate max-w-[140px]">
          {log.resource_id ?? '--'}
        </td>
        <td className="py-2.5 pr-4 text-muted-foreground text-xs truncate max-w-[200px]">
          {detailsPreview}
        </td>
        <td className="py-2.5 text-muted-foreground text-xs font-mono">
          {log.ip_address ?? '--'}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr className="bg-muted/5">
          <td colSpan={7} className="p-4">
            <div className="rounded-lg bg-muted/30 p-3 border">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Full Details
              </p>
              <pre className="text-xs text-foreground overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {JSON.stringify(log.details, null, 2)}
              </pre>
              {log.user_agent && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">User Agent:</span>{' '}
                    {log.user_agent}
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
