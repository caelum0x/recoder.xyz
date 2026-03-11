'use client';

import React, { useState } from 'react';
import {
  Clock,
  Plus,
  Play,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  SkipForward,
  Timer,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import {
  useScheduledTasks,
  useCreateScheduledTask,
  useUpdateScheduledTask,
  useDeleteScheduledTask,
  useTriggerTask,
  useTaskRuns,
  useUpcomingRuns,
} from '@/hooks/agents/use-agent-scheduled-tasks';
import type { ScheduledTask, ScheduledTaskRun } from '@/lib/api/agent-scheduled-tasks';

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 9 AM', value: '0 9 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
  { label: 'Monthly (1st at 9 AM)', value: '0 9 1 * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Custom', value: 'custom' },
];

const STATUS_CONFIG: Record<string, { color: string; icon: React.ComponentType<any> }> = {
  pending: { color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: Clock },
  running: { color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Loader2 },
  completed: { color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: CheckCircle2 },
  failed: { color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: XCircle },
  timed_out: { color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: AlertTriangle },
  skipped: { color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', icon: SkipForward },
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);
  const isPast = diffMs < 0;

  if (absDiff < 60_000) return isPast ? 'Just now' : 'In < 1m';
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return isPast ? `${mins}m ago` : `In ${mins}m`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000);
    return isPast ? `${hrs}h ago` : `In ${hrs}h`;
  }
  const days = Math.round(absDiff / 86_400_000);
  return isPast ? `${days}d ago` : `In ${days}d`;
}

interface ScheduledTasksScreenProps {
  agentId: string;
}

export function ScheduledTasksScreen({ agentId }: ScheduledTasksScreenProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Form state
  const [taskName, setTaskName] = useState('');
  const [cronPreset, setCronPreset] = useState('0 * * * *');
  const [customCron, setCustomCron] = useState('');
  const [inputPayload, setInputPayload] = useState('{}');
  const [maxRetries, setMaxRetries] = useState('3');
  const [timeoutSeconds, setTimeoutSeconds] = useState('300');

  const { data: tasks, isLoading } = useScheduledTasks(agentId);
  const { data: upcoming } = useUpcomingRuns();
  const createMutation = useCreateScheduledTask(agentId);
  const updateMutation = useUpdateScheduledTask(agentId);
  const deleteMutation = useDeleteScheduledTask(agentId);
  const triggerMutation = useTriggerTask(agentId);

  const resetForm = () => {
    setTaskName('');
    setCronPreset('0 * * * *');
    setCustomCron('');
    setInputPayload('{}');
    setMaxRetries('3');
    setTimeoutSeconds('300');
    setEditingTask(null);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (task: ScheduledTask) => {
    setEditingTask(task);
    setTaskName(task.task_name);
    const preset = CRON_PRESETS.find((p) => p.value === task.cron_expression);
    if (preset && preset.value !== 'custom') {
      setCronPreset(task.cron_expression);
      setCustomCron('');
    } else {
      setCronPreset('custom');
      setCustomCron(task.cron_expression);
    }
    setInputPayload(JSON.stringify(task.input_payload || {}, null, 2));
    setMaxRetries(String(task.max_retries));
    setTimeoutSeconds(String(task.timeout_seconds));
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!taskName.trim()) {
      toast.error('Task name is required');
      return;
    }
    const cronExpr = cronPreset === 'custom' ? customCron : cronPreset;
    if (!cronExpr.trim()) {
      toast.error('Cron expression is required');
      return;
    }

    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(inputPayload);
    } catch {
      toast.error('Invalid JSON in input payload');
      return;
    }

    try {
      if (editingTask) {
        await updateMutation.mutateAsync({
          taskId: editingTask.id,
          data: {
            task_name: taskName,
            cron_expression: cronExpr,
            input_payload: parsedPayload,
            max_retries: parseInt(maxRetries) || 3,
            timeout_seconds: parseInt(timeoutSeconds) || 300,
          },
        });
        toast.success('Scheduled task updated');
      } else {
        await createMutation.mutateAsync({
          task_name: taskName,
          cron_expression: cronExpr,
          input_payload: parsedPayload,
          max_retries: parseInt(maxRetries) || 3,
          timeout_seconds: parseInt(timeoutSeconds) || 300,
        });
        toast.success('Scheduled task created');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save task');
    }
  };

  const handleDelete = async () => {
    if (!deleteTaskId) return;
    try {
      await deleteMutation.mutateAsync(deleteTaskId);
      toast.success('Scheduled task deleted');
      setDeleteTaskId(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete task');
    }
  };

  const handleTrigger = async (taskId: string) => {
    try {
      await triggerMutation.mutateAsync(taskId);
      toast.success('Task triggered');
    } catch (error: any) {
      toast.error(error.message || 'Failed to trigger task');
    }
  };

  const handleToggleActive = async (task: ScheduledTask) => {
    try {
      await updateMutation.mutateAsync({
        taskId: task.id,
        data: { is_active: !task.is_active },
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle task');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto pb-8 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Scheduled Tasks</h2>
          <p className="text-sm text-muted-foreground">
            Automate recurring agent tasks with cron-based scheduling
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* Upcoming Runs Timeline */}
      {upcoming && upcoming.length > 0 && (
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Upcoming Runs</h3>
          </div>
          <div className="space-y-2">
            {upcoming.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{task.task_name}</span>
                  {task.agent_name && (
                    <Badge variant="secondary" className="text-[10px]">
                      {task.agent_name}
                    </Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-xs flex-shrink-0">
                  {formatRelativeTime(task.next_run_at)}
                </span>
              </div>
            ))}
          </div>
        </SpotlightCard>
      )}

      {/* Task List */}
      {tasks && tasks.length > 0 ? (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              agentId={agentId}
              isExpanded={expandedTaskId === task.id}
              onToggleExpand={() =>
                setExpandedTaskId(expandedTaskId === task.id ? null : task.id)
              }
              onEdit={() => openEdit(task)}
              onDelete={() => setDeleteTaskId(task.id)}
              onTrigger={() => handleTrigger(task.id)}
              onToggleActive={() => handleToggleActive(task)}
              isTriggerPending={triggerMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            No scheduled tasks yet
          </p>
          <Button onClick={openCreate} variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create Your First Task
          </Button>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? 'Edit Scheduled Task' : 'New Scheduled Task'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="task-name">Task Name</Label>
              <Input
                id="task-name"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="Daily report generation"
              />
            </div>

            <div>
              <Label>Schedule</Label>
              <Select value={cronPreset} onValueChange={setCronPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cronPreset === 'custom' && (
                <Input
                  className="mt-2"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder="0 */2 * * *"
                />
              )}
            </div>

            <div>
              <Label htmlFor="input-payload">Input Payload (JSON)</Label>
              <Textarea
                id="input-payload"
                value={inputPayload}
                onChange={(e) => setInputPayload(e.target.value)}
                className="font-mono text-xs min-h-[80px]"
                placeholder='{"key": "value"}'
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="max-retries">Max Retries</Label>
                <Input
                  id="max-retries"
                  type="number"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(e.target.value)}
                  min={0}
                  max={10}
                />
              </div>
              <div>
                <Label htmlFor="timeout">Timeout (seconds)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(e.target.value)}
                  min={30}
                  max={3600}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              {editingTask ? 'Save Changes' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTaskId}
        onOpenChange={() => setDeleteTaskId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scheduled Task</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the task and all its run history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskCard sub-component
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: ScheduledTask;
  agentId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => void;
  onToggleActive: () => void;
  isTriggerPending: boolean;
}

function TaskCard({
  task,
  agentId,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onTrigger,
  onToggleActive,
  isTriggerPending,
}: TaskCardProps) {
  return (
    <SpotlightCard className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <button
              onClick={onToggleExpand}
              className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-medium truncate">{task.task_name}</h4>
                <Badge
                  variant={task.is_active ? 'default' : 'secondary'}
                  className="text-[10px]"
                >
                  {task.is_active ? 'Active' : 'Paused'}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {task.cron_human || task.cron_expression}
                </span>
                <span>
                  Next: {formatRelativeTime(task.next_run_at)}
                </span>
                <span>
                  Last: {formatRelativeTime(task.last_run_at)}
                </span>
                <span>Runs: {task.run_count}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <Switch
              checked={task.is_active}
              onCheckedChange={onToggleActive}
              className="scale-75"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onTrigger}
              disabled={isTriggerPending}
              title="Trigger Now"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onEdit}
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded: Run History */}
      {isExpanded && (
        <TaskRunHistory agentId={agentId} taskId={task.id} />
      )}
    </SpotlightCard>
  );
}

// ---------------------------------------------------------------------------
// TaskRunHistory sub-component
// ---------------------------------------------------------------------------

function TaskRunHistory({ agentId, taskId }: { agentId: string; taskId: string }) {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { data, isLoading } = useTaskRuns(agentId, taskId, {
    limit: 10,
    status: statusFilter,
  });

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-xs font-medium flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" />
          Run History
        </h5>
        <Select
          value={statusFilter || 'all'}
          onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="h-6 text-[10px] w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="timed_out">Timed Out</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : data?.runs && data.runs.length > 0 ? (
        <div className="space-y-1.5">
          {data.runs.map((run) => {
            const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending;
            const Icon = config.icon;
            return (
              <div
                key={run.id}
                className="flex items-center justify-between text-xs py-1.5 px-2 rounded-md bg-background"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-1 ${config.color}`}
                  >
                    <Icon className={`h-3 w-3 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                    {run.status}
                  </Badge>
                  {run.error_message && (
                    <span className="text-destructive truncate max-w-[200px]">
                      {run.error_message}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground flex-shrink-0">
                  {run.duration_ms != null && (
                    <span>{(run.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                  <span>{formatRelativeTime(run.started_at)}</span>
                </div>
              </div>
            );
          })}
          {data.total > data.runs.length && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              Showing {data.runs.length} of {data.total} runs
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">
          No runs yet
        </p>
      )}
    </div>
  );
}
