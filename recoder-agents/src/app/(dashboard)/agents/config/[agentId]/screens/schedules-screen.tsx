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
  AlertCircle,
  SkipForward,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useAgentSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useTriggerSchedule,
  useScheduleExecutions,
} from '@/hooks/agents/use-agent-schedules';
import type { AgentSchedule, ScheduleExecution } from '@/lib/api/agent-schedules';

interface SchedulesScreenProps {
  agentId: string;
}

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 9:00 AM', value: '0 9 * * *' },
  { label: 'Weekly (Monday)', value: '0 9 * * 1' },
  { label: 'Monthly (1st)', value: '0 9 1 * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

function StatusBadge({ status }: { status: ScheduleExecution['status'] }) {
  const config = {
    completed: { icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    failed: { icon: XCircle, className: 'bg-red-500/10 text-red-600 border-red-500/20' },
    running: { icon: Loader2, className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    pending: { icon: Clock, className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    skipped: { icon: SkipForward, className: 'bg-muted text-muted-foreground border-border' },
  };
  const { icon: Icon, className } = config[status] || config.pending;

  return (
    <Badge variant="outline" className={cn('gap-1 font-normal', className)}>
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ExecutionHistory({ scheduleId }: { scheduleId: string }) {
  const { data, isLoading } = useScheduleExecutions(scheduleId, { limit: 10 });

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!data?.executions?.length) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No executions yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {data.executions.map((exec) => (
        <div key={exec.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <div className="flex items-center gap-3">
            <StatusBadge status={exec.status} />
            <span className="text-muted-foreground">{formatDate(exec.started_at)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground max-w-[40%] truncate">
            {exec.error && (
              <span className="text-red-500 truncate" title={exec.error}>
                {exec.error}
              </span>
            )}
            {exec.output_summary && (
              <span className="truncate" title={exec.output_summary}>
                {exec.output_summary}
              </span>
            )}
            {exec.completed_at && (
              <span className="flex-shrink-0">
                Done {formatDate(exec.completed_at)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SchedulesScreen({ agentId }: SchedulesScreenProps) {
  const { data: schedules, isLoading } = useAgentSchedules(agentId);
  const createMutation = useCreateSchedule(agentId);
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteSchedule();
  const triggerMutation = useTriggerSchedule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<AgentSchedule | null>(null);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCron, setFormCron] = useState('0 9 * * *');
  const [formTimezone, setFormTimezone] = useState('UTC');
  const [formMessage, setFormMessage] = useState('');
  const [formMaxRuns, setFormMaxRuns] = useState('');

  const resetForm = () => {
    setFormName('');
    setFormCron('0 9 * * *');
    setFormTimezone('UTC');
    setFormMessage('');
    setFormMaxRuns('');
    setEditingSchedule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (schedule: AgentSchedule) => {
    setEditingSchedule(schedule);
    setFormName(schedule.name);
    setFormCron(schedule.cron_expression);
    setFormTimezone(schedule.timezone);
    setFormMessage(schedule.input_message || '');
    setFormMaxRuns(schedule.max_runs?.toString() || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      if (editingSchedule) {
        await updateMutation.mutateAsync({
          scheduleId: editingSchedule.id,
          data: {
            name: formName,
            cron_expression: formCron,
            timezone: formTimezone,
            input_message: formMessage || undefined,
            max_runs: formMaxRuns ? parseInt(formMaxRuns) : undefined,
          },
        });
        toast.success('Schedule updated');
      } else {
        await createMutation.mutateAsync({
          name: formName,
          cron_expression: formCron,
          timezone: formTimezone,
          input_message: formMessage || undefined,
          max_runs: formMaxRuns ? parseInt(formMaxRuns) : undefined,
        });
        toast.success('Schedule created');
      }
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save schedule');
    }
  };

  const handleToggleActive = async (schedule: AgentSchedule) => {
    try {
      await updateMutation.mutateAsync({
        scheduleId: schedule.id,
        data: { is_active: !schedule.is_active },
      });
      toast.success(schedule.is_active ? 'Schedule paused' : 'Schedule activated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle schedule');
    }
  };

  const handleDelete = async () => {
    if (!deleteScheduleId) return;
    try {
      await deleteMutation.mutateAsync(deleteScheduleId);
      toast.success('Schedule deleted');
      setDeleteScheduleId(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete schedule');
    }
  };

  const handleTrigger = async (scheduleId: string) => {
    try {
      await triggerMutation.mutateAsync(scheduleId);
      toast.success('Schedule triggered manually');
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger schedule');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto pb-12 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-12 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedules
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automate agent runs on a recurring schedule
          </p>
        </div>
        <Button onClick={openCreateDialog} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Schedule
        </Button>
      </div>

      {/* Schedule list */}
      {(!schedules || schedules.length === 0) ? (
        <SpotlightCard className="bg-card border-dashed">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No schedules yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create a schedule to run this agent automatically
            </p>
            <Button onClick={openCreateDialog} variant="outline" size="sm" className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              Create Schedule
            </Button>
          </div>
        </SpotlightCard>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <SpotlightCard key={schedule.id} className="bg-card">
              <div className="p-4">
                {/* Schedule header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-sm">{schedule.name}</h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        schedule.is_active
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {schedule.is_active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={schedule.is_active}
                      onCheckedChange={() => handleToggleActive(schedule)}
                      className="mr-2"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleTrigger(schedule.id)}
                      title="Run now"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(schedule)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => setDeleteScheduleId(schedule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Schedule details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
                  <div>
                    <span className="block text-muted-foreground/60">Cron</span>
                    <span className="text-foreground">{schedule.cron_human || schedule.cron_expression}</span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground/60">Timezone</span>
                    <span className="text-foreground">{schedule.timezone}</span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground/60">Next Run</span>
                    <span className="text-foreground">{formatDate(schedule.next_run_at)}</span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground/60">Runs</span>
                    <span className="text-foreground">
                      {schedule.run_count}
                      {schedule.max_runs ? ` / ${schedule.max_runs}` : ''}
                    </span>
                  </div>
                </div>

                {schedule.last_run_at && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Last run: {formatDate(schedule.last_run_at)}
                  </div>
                )}

                {/* Execution history collapsible */}
                <Collapsible
                  open={expandedHistory === schedule.id}
                  onOpenChange={(open) =>
                    setExpandedHistory(open ? schedule.id : null)
                  }
                >
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {expandedHistory === schedule.id ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      Execution History
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 border rounded-xl overflow-hidden">
                      <ExecutionHistory scheduleId={schedule.id} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </SpotlightCard>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? 'Edit Schedule' : 'New Schedule'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Daily report generation"
              />
            </div>

            <div className="space-y-2">
              <Label>Cron Expression</Label>
              <Input
                value={formCron}
                onChange={(e) => setFormCron(e.target.value)}
                placeholder="0 9 * * *"
                className="font-mono text-sm"
              />
              <div className="flex flex-wrap gap-1.5 mt-1">
                {CRON_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-7 text-xs',
                      formCron === preset.value && 'bg-primary text-primary-foreground'
                    )}
                    onClick={() => setFormCron(preset.value)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={formTimezone} onValueChange={setFormTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Input Message (optional)</Label>
              <Textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Message to send to the agent on each run..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Max Runs (optional)</Label>
              <Input
                type="number"
                value={formMaxRuns}
                onChange={(e) => setFormMaxRuns(e.target.value)}
                placeholder="Leave empty for unlimited"
                min={1}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              {editingSchedule ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteScheduleId}
        onOpenChange={(open) => !open && setDeleteScheduleId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the schedule and all its execution history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
