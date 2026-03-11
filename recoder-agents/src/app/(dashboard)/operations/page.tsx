'use client';

import { useState, useCallback } from 'react';
import {
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Hash,
  Target,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBulkOperations, useBulkOpStats } from '@/hooks/use-bulk-operations';
import type { BulkOperation } from '@/lib/api/bulk-operations';

// ============================================================================
// Helpers
// ============================================================================

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: 'Pending', icon: <Clock className="h-3 w-3" />, color: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processing', icon: <Loader2 className="h-3 w-3 animate-spin" />, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  completed: { label: 'Completed', icon: <CheckCircle2 className="h-3 w-3" />, color: 'bg-green-500/10 text-green-600 border-green-500/30' },
  failed: { label: 'Failed', icon: <AlertCircle className="h-3 w-3" />, color: 'bg-red-500/10 text-red-600 border-red-500/30' },
  partial: { label: 'Partial', icon: <AlertTriangle className="h-3 w-3" />, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

const TYPE_LABELS: Record<string, string> = {
  agent_update: 'Agent Update',
  agent_delete: 'Agent Delete',
  agent_export: 'Agent Export',
  thread_delete: 'Thread Delete',
  thread_archive: 'Thread Archive',
  thread_export: 'Thread Export',
  tag_assign: 'Tag Assign',
  tag_remove: 'Tag Remove',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatDuration(started: string | null, completed: string | null): string {
  if (!started || !completed) return '-';
  try {
    const ms = new Date(completed).getTime() - new Date(started).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  } catch {
    return '-';
  }
}

// ============================================================================
// Operation Row
// ============================================================================

function OperationRow({ op }: { op: BulkOperation }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_META[op.status] || STATUS_META.pending;
  const progressPct =
    op.target_count > 0
      ? Math.round((op.processed_count / op.target_count) * 100)
      : 0;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8">
          <Button variant="ghost" size="icon" className="h-6 w-6">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </Button>
        </TableCell>

        <TableCell>
          <Badge variant="outline" className="text-xs font-medium">
            {TYPE_LABELS[op.operation_type] || op.operation_type}
          </Badge>
        </TableCell>

        <TableCell className="text-center tabular-nums">
          {op.target_count}
        </TableCell>

        <TableCell>
          {op.status === 'processing' ? (
            <div className="flex items-center gap-2 min-w-[120px]">
              <Progress value={progressPct} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {progressPct}%
              </span>
            </div>
          ) : (
            <Badge variant="outline" className={`text-xs gap-1 ${status.color}`}>
              {status.icon}
              {status.label}
            </Badge>
          )}
        </TableCell>

        <TableCell className="tabular-nums text-center">
          <span className="text-green-600">{op.processed_count}</span>
          {op.error_count > 0 && (
            <>
              {' / '}
              <span className="text-red-500">{op.error_count} err</span>
            </>
          )}
        </TableCell>

        <TableCell className="text-muted-foreground text-xs tabular-nums">
          {formatDuration(op.started_at, op.completed_at)}
        </TableCell>

        <TableCell className="text-muted-foreground text-xs">
          {formatDate(op.created_at)}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/20 p-4">
            <div className="space-y-3">
              {/* Target IDs */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Target IDs ({op.target_ids.length})
                </p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {op.target_ids.map((id) => (
                    <Badge key={id} variant="outline" className="text-[10px] font-mono">
                      {id.slice(0, 12)}...
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Errors */}
              {op.errors && op.errors.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-500 mb-1">
                    Errors ({op.errors.length})
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {op.errors.map((err, i) => (
                      <div
                        key={i}
                        className="text-xs bg-red-500/5 border border-red-500/20 rounded px-2 py-1 font-mono"
                      >
                        <span className="text-red-500">{err.target_id.slice(0, 8)}...</span>{' '}
                        {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Params */}
              {op.params && Object.keys(op.params).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Parameters</p>
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(op.params, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function OperationsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const filters = {
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(typeFilter !== 'all' && { operation_type: typeFilter }),
    limit: 50,
  };

  const { data: operations, isLoading } = useBulkOperations(
    Object.keys(filters).length > 1 ? filters : { limit: 50 },
  );
  const { data: stats } = useBulkOpStats();

  return (
    <div className="min-h-[100dvh] flex items-start justify-center">
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Bulk Operations</h1>
            <p className="text-sm text-muted-foreground">
              History of batch operations across agents and threads
            </p>
          </div>
        </div>

        {/* Stats header */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Hash className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Ops</p>
                  <p className="text-lg font-semibold tabular-nums">{stats.total_operations}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                  <p className="text-lg font-semibold tabular-nums">{stats.success_rate_pct}%</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Most Used</p>
                  <p className="text-sm font-medium truncate">
                    {stats.most_used_operation
                      ? TYPE_LABELS[stats.most_used_operation] || stats.most_used_operation
                      : '-'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Target className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Targets</p>
                  <p className="text-lg font-semibold tabular-nums">{stats.avg_targets_per_op}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[170px] h-9 text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="agent_delete">Agent Delete</SelectItem>
              <SelectItem value="agent_update">Agent Update</SelectItem>
              <SelectItem value="agent_export">Agent Export</SelectItem>
              <SelectItem value="thread_delete">Thread Delete</SelectItem>
              <SelectItem value="thread_archive">Thread Archive</SelectItem>
              <SelectItem value="thread_export">Thread Export</SelectItem>
              <SelectItem value="tag_assign">Tag Assign</SelectItem>
              <SelectItem value="tag_remove">Tag Remove</SelectItem>
            </SelectContent>
          </Select>

          {operations && (
            <span className="text-xs text-muted-foreground ml-auto">
              {operations.length} operation{operations.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Operations table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading operations...
              </span>
            </CardContent>
          ) : !operations || operations.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Layers className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                No operations yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Bulk operations will appear here when you perform batch actions
              </p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Targets</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Result</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((op) => (
                  <OperationRow key={op.id} op={op} />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
