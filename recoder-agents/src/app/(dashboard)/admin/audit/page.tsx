'use client';

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  Activity,
  Shield,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';
import { useAuditLogs, useAuditSummary, useExportAuditLogs } from '@/hooks/platform/use-audit-logs';
import type { AuditLogFilters, AuditLog } from '@/lib/api/audit-logs';

const RESOURCE_TYPES = [
  'agent',
  'thread',
  'workflow',
  'pipeline',
  'team',
  'secret',
  'webhook',
  'knowledge_entry',
  'api_key',
  'settings',
  'billing',
] as const;

const RESOURCE_COLORS: Record<string, string> = {
  agent: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  thread: 'bg-green-500/10 text-green-700 dark:text-green-400',
  workflow: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  pipeline: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  team: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  secret: 'bg-red-500/10 text-red-700 dark:text-red-400',
  webhook: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  knowledge_entry: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  api_key: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  settings: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
  billing: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-500/10 text-green-700 dark:text-green-400',
  update: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  delete: 'bg-red-500/10 text-red-700 dark:text-red-400',
  view: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
  execute: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  export: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

function getActionColor(action: string): string {
  const verb = action.split('.')[0]?.toLowerCase() || action.toLowerCase();
  return ACTION_COLORS[verb] || 'bg-muted text-muted-foreground';
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = log.details && Object.keys(log.details).length > 0;

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {hasDetails ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}

        <span className="text-xs text-muted-foreground w-[140px] flex-shrink-0 font-mono">
          {formatTimestamp(log.created_at)}
        </span>

        <Badge variant="outline" className={`text-xs ${getActionColor(log.action)} border-0`}>
          {log.action}
        </Badge>

        <Badge
          variant="outline"
          className={`text-xs ${RESOURCE_COLORS[log.resource_type] || 'bg-muted text-muted-foreground'} border-0`}
        >
          {log.resource_type}
        </Badge>

        {log.resource_id && (
          <span className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
            {log.resource_id}
          </span>
        )}

        {log.ip_address && (
          <span className="text-xs text-muted-foreground ml-auto hidden lg:inline">
            {log.ip_address}
          </span>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="px-12 pb-3">
          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({
    limit: 50,
    offset: 0,
  });
  const [actionSearch, setActionSearch] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const activeFilters = useMemo(() => {
    const f: AuditLogFilters = {
      limit: filters.limit,
      offset: filters.offset,
    };
    if (resourceTypeFilter && resourceTypeFilter !== 'all') {
      f.resource_type = resourceTypeFilter;
    }
    if (actionSearch.trim()) {
      f.action = actionSearch.trim();
    }
    if (fromDate) f.from_date = new Date(fromDate).toISOString();
    if (toDate) f.to_date = new Date(toDate).toISOString();
    return f;
  }, [filters.limit, filters.offset, resourceTypeFilter, actionSearch, fromDate, toDate]);

  const { data, isLoading } = useAuditLogs(activeFilters);
  const { data: summary, isLoading: summaryLoading } = useAuditSummary();
  const exportMutation = useExportAuditLogs();

  const handleExport = async () => {
    const exportFrom = fromDate
      ? new Date(fromDate).toISOString()
      : new Date(Date.now() - 30 * 86400000).toISOString();
    const exportTo = toDate ? new Date(toDate).toISOString() : new Date().toISOString();

    try {
      const result = await exportMutation.mutateAsync({
        fromDate: exportFrom,
        toDate: exportTo,
      });
      const blob = new Blob([JSON.stringify(result.logs, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} audit log entries`);
    } catch (e) {
      toast.error('Failed to export audit logs');
    }
  };

  const handleLoadMore = () => {
    setFilters((prev) => ({
      ...prev,
      offset: (prev.offset || 0) + (prev.limit || 50),
    }));
  };

  const handleFilterReset = () => {
    setFilters({ limit: 50, offset: 0 });
    setActionSearch('');
    setResourceTypeFilter('all');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Audit Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all actions performed across the platform
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exportMutation.isPending}
        >
          <Download className="h-4 w-4 mr-2" />
          Export JSON
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Total Events (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {summary?.total?.toLocaleString() ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Most Active Resource
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold capitalize">
                {summary?.most_active_resource?.replace('_', ' ') ?? 'N/A'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Most Common Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {summary?.most_common_action ?? 'N/A'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={resourceTypeFilter} onValueChange={setResourceTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Resource type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            {RESOURCE_TYPES.map((rt) => (
              <SelectItem key={rt} value={rt}>
                {rt.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions..."
            value={actionSearch}
            onChange={(e) => {
              setActionSearch(e.target.value);
              setFilters((prev) => ({ ...prev, offset: 0 }));
            }}
            className="pl-9 w-[200px]"
          />
        </div>

        <Input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setFilters((prev) => ({ ...prev, offset: 0 }));
          }}
          className="w-[160px]"
          placeholder="From"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            setFilters((prev) => ({ ...prev, offset: 0 }));
          }}
          className="w-[160px]"
          placeholder="To"
        />

        <Button variant="ghost" size="sm" onClick={handleFilterReset}>
          Reset
        </Button>
      </div>

      {/* Log Table */}
      <Card>
        <div className="divide-y-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data?.logs?.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No audit log entries found</p>
            </div>
          ) : (
            data?.logs?.map((log) => <LogRow key={log.id} log={log} />)
          )}
        </div>
      </Card>

      {/* Pagination */}
      {data && data.total > (data.offset + data.limit) && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore}>
            Load More ({data.total - data.offset - data.limit} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
