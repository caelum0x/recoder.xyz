'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ListTodo,
  Plus,
  RefreshCw,
  Trash2,
  X,
  RotateCcw,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BanIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  useQueuedTasks,
  useEnqueueTask,
  useTaskDetail,
  useCancelTask,
  useRetryTask,
  useTaskQueueStats,
  useDeleteCompletedTasks,
} from '@/hooks/agents/use-task-queue';
import type { QueuedTask, TaskStatus } from '@/lib/api/task-queue';

// ============================================================================
// Helpers
// ============================================================================

function formatTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return format(parseISO(ts), 'MMM d, HH:mm');
  } catch {
    return ts;
  }
}

function getPriorityColor(priority: number): string {
  if (priority <= 3) return 'bg-red-500/10 text-red-600 border-red-500/20';
  if (priority <= 6) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
  return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
}

function getStatusBadge(status: TaskStatus) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-500/20 gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-500/20 gap-1">
          <AlertCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1">
          <BanIcon className="h-3 w-3" />
          Cancelled
        </Badge>
      );
    case 'retrying':
      return (
        <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 border-purple-500/20 gap-1">
          <RotateCcw className="h-3 w-3" />
          Retrying
        </Badge>
      );
  }
}

// ============================================================================
// Enqueue Dialog
// ============================================================================

interface EnqueueDialogProps {
  open: boolean;
  onClose: () => void;
}

function EnqueueDialog({ open, onClose }: EnqueueDialogProps) {
  const enqueueTask = useEnqueueTask();
  const [taskType, setTaskType] = useState('');
  const [taskName, setTaskName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [payloadText, setPayloadText] = useState('{}');
  const [priority, setPriority] = useState(5);
  const [maxRetries, setMaxRetries] = useState(3);
  const [scheduledAt, setScheduledAt] = useState('');
  const [payloadError, setPayloadError] = useState('');

  const resetForm = useCallback(() => {
    setTaskType('');
    setTaskName('');
    setAgentId('');
    setPayloadText('{}');
    setPriority(5);
    setMaxRetries(3);
    setScheduledAt('');
    setPayloadError('');
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch {
      setPayloadError('Invalid JSON payload');
      return;
    }
    setPayloadError('');
    try {
      await enqueueTask.mutateAsync({
        task_type: taskType.trim(),
        task_name: taskName.trim(),
        agent_id: agentId.trim() || undefined,
        payload: parsedPayload,
        priority,
        max_retries: maxRetries,
        scheduled_at: scheduledAt || undefined,
      });
      toast.success('Task enqueued successfully');
      handleClose();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to enqueue task');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enqueue Task</DialogTitle>
          <DialogDescription>
            Add a new task to the queue with priority and retry configuration.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task_type">Task Type *</Label>
              <Input
                id="task_type"
                placeholder="e.g. email_send"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task_name">Task Name *</Label>
              <Input
                id="task_name"
                placeholder="e.g. Send welcome email"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent_id">Agent ID (optional)</Label>
            <Input
              id="agent_id"
              placeholder="Agent ID to associate with this task"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payload">Payload (JSON)</Label>
            <Textarea
              id="payload"
              rows={4}
              className="font-mono text-xs"
              value={payloadText}
              onChange={(e) => {
                setPayloadText(e.target.value);
                setPayloadError('');
              }}
            />
            {payloadError && (
              <p className="text-xs text-destructive">{payloadError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Priority: {priority}</Label>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[priority]}
              onValueChange={([v]) => setPriority(v)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1 (Highest)</span>
              <span>10 (Lowest)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="max_retries">Max Retries</Label>
              <Input
                id="max_retries"
                type="number"
                min={0}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_at">Scheduled At (optional)</Label>
              <Input
                id="scheduled_at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={enqueueTask.isPending}>
              {enqueueTask.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enqueueing…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Enqueue Task
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Task Detail Sheet
// ============================================================================

interface TaskDetailSheetProps {
  taskId: string | null;
  onClose: () => void;
}

function TaskDetailSheet({ taskId, onClose }: TaskDetailSheetProps) {
  const { data: task, isLoading } = useTaskDetail(taskId);

  return (
    <Sheet open={!!taskId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Task Detail</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : task ? (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Task Name" value={task.task_name} />
              <InfoRow label="Task Type" value={task.task_type} />
              <InfoRow label="Agent ID" value={task.agent_id ?? '—'} />
              <InfoRow label="Status" value={<span>{getStatusBadge(task.status)}</span>} />
              <InfoRow label="Priority" value={
                <Badge variant="outline" className={cn('text-xs', getPriorityColor(task.priority))}>
                  {task.priority}
                </Badge>
              } />
              <InfoRow label="Retries" value={`${task.retry_count} / ${task.max_retries}`} />
              <InfoRow label="Created" value={formatTs(task.created_at)} />
              <InfoRow label="Scheduled" value={formatTs(task.scheduled_at)} />
              <InfoRow label="Started" value={formatTs(task.started_at)} />
              <InfoRow label="Completed" value={formatTs(task.completed_at)} />
            </div>

            {task.error_message && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Error Message</p>
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-xs text-destructive font-mono whitespace-pre-wrap break-all">
                  {task.error_message}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Payload</p>
              <pre className="rounded-lg bg-muted p-3 text-xs overflow-auto max-h-48 break-all">
                {JSON.stringify(task.payload, null, 2)}
              </pre>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Result</p>
              <pre className="rounded-lg bg-muted p-3 text-xs overflow-auto max-h-48 break-all">
                {JSON.stringify(task.result, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Task not found.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

// ============================================================================
// Stats Bar
// ============================================================================

function StatsBar() {
  const { data: stats, isLoading } = useTaskQueueStats();

  const cards = [
    {
      label: 'Pending',
      count: stats?.pending_count ?? 0,
      color: 'text-amber-600',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      label: 'Running',
      count: stats?.running_count ?? 0,
      color: 'text-blue-600',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: 'Completed',
      count: stats?.completed_count ?? 0,
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      label: 'Failed',
      count: stats?.failed_count ?? 0,
      color: 'text-red-600',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            'rounded-xl border p-4 flex flex-col gap-1',
            card.bg,
            card.border
          )}
        >
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className={cn('text-2xl font-bold tabular-nums', card.color)}>{card.count}</p>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Status Chart
// ============================================================================

function StatusChart() {
  const { data: stats } = useTaskQueueStats();

  const chartData = [
    { name: 'Pending', count: stats?.pending_count ?? 0, fill: '#f59e0b' },
    { name: 'Running', count: stats?.running_count ?? 0, fill: '#3b82f6' },
    { name: 'Completed', count: stats?.completed_count ?? 0, fill: '#10b981' },
    { name: 'Failed', count: stats?.failed_count ?? 0, fill: '#ef4444' },
    { name: 'Retrying', count: stats?.retrying_count ?? 0, fill: '#a855f7' },
    { name: 'Cancelled', count: stats?.cancelled_count ?? 0, fill: '#6b7280' },
  ];

  const hasData = chartData.some((d) => d.count > 0);
  if (!hasData) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium mb-3">Task Counts by Status</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <rect key={index} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Task Row
// ============================================================================

interface TaskRowProps {
  task: QueuedTask;
  onViewDetail: (id: string) => void;
}

function TaskRow({ task, onViewDetail }: TaskRowProps) {
  const cancelTask = useCancelTask();
  const retryTask = useRetryTask();

  const handleCancel = async () => {
    try {
      await cancelTask.mutateAsync(task.id);
      toast.success('Task cancelled');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to cancel task');
    }
  };

  const handleRetry = async () => {
    try {
      await retryTask.mutateAsync(task.id);
      toast.success('Task queued for retry');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to retry task');
    }
  };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <div className="font-medium text-sm truncate max-w-[160px]" title={task.task_name}>
          {task.task_name}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{task.task_type}</div>
      </td>
      <td className="py-3 px-4 text-xs text-muted-foreground truncate max-w-[100px]">
        {task.agent_id ?? '—'}
      </td>
      <td className="py-3 px-4">
        <Badge variant="outline" className={cn('text-xs', getPriorityColor(task.priority))}>
          {task.priority}
        </Badge>
      </td>
      <td className="py-3 px-4">{getStatusBadge(task.status)}</td>
      <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
        {task.retry_count}/{task.max_retries}
      </td>
      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
        {formatTs(task.created_at)}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          {(task.status === 'pending' || task.status === 'retrying') && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={handleCancel}
              disabled={cancelTask.isPending}
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
          )}
          {(task.status === 'failed' || task.status === 'retrying') && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={handleRetry}
              disabled={retryTask.isPending}
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => onViewDetail(task.id)}
          >
            <Eye className="h-3 w-3" />
            View
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// Page
// ============================================================================

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Retrying', value: 'retrying' },
  { label: 'Cancelled', value: 'cancelled' },
];

const CLEAR_DAYS_OPTIONS = [7, 14, 30];

export default function TaskQueuePage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [enqueueOpen, setEnqueueOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [clearDays, setClearDays] = useState(7);

  const deleteCompletedTasks = useDeleteCompletedTasks();
  const { data: stats } = useTaskQueueStats();

  const filters = statusFilter !== 'all' ? { status: statusFilter as TaskStatus } : undefined;
  const { data: tasks, isLoading, error, refetch } = useQueuedTasks(filters);

  // Auto-refresh when there are running tasks
  const hasRunning = (stats?.running_count ?? 0) > 0;
  useEffect(() => {
    if (!hasRunning) return;
    const interval = setInterval(() => refetch(), 10_000);
    return () => clearInterval(interval);
  }, [hasRunning, refetch]);

  const handleClearCompleted = async () => {
    try {
      const result = await deleteCompletedTasks.mutateAsync(clearDays);
      toast.success(`Deleted ${result.deleted_count} completed task(s)`);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to clear completed tasks');
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <ListTodo className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Task Queue</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage background tasks with priority, retries, and status tracking
            </p>
          </div>
        </div>
        <Button onClick={() => setEnqueueOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Enqueue Task
        </Button>
      </div>

      {/* Stats Bar */}
      <StatsBar />

      {/* Chart */}
      <StatusChart />

      {/* Toolbar: filter tabs + clear */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={statusFilter === tab.value ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 gap-1.5 text-xs"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Select
            value={String(clearDays)}
            onValueChange={(v) => setClearDays(Number(v))}
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLEAR_DAYS_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)} className="text-xs">
                  Older than {d}d
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleClearCompleted}
            disabled={deleteCompletedTasks.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Completed
          </Button>
        </div>
      </div>

      {/* Task Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {(error as Error).message || 'Failed to load tasks'}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : !tasks || tasks.length === 0 ? (
          <div className="p-12 text-center">
            <ListTodo className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No tasks found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {statusFilter !== 'all'
                ? `No tasks with status "${statusFilter}".`
                : 'Click "Enqueue Task" to add your first task.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">
                    Task
                  </th>
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">
                    Agent ID
                  </th>
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">
                    Priority
                  </th>
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">
                    Retries
                  </th>
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">
                    Created
                  </th>
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onViewDetail={(id) => setDetailTaskId(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs & Sheets */}
      <EnqueueDialog open={enqueueOpen} onClose={() => setEnqueueOpen(false)} />
      <TaskDetailSheet taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
    </div>
  );
}
