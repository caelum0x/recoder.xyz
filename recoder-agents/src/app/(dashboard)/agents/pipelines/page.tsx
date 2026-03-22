'use client';

import React, { useState } from 'react';
import {
  Database,
  Globe,
  File,
  Webhook,
  Activity,
  Play,
  Pencil,
  Trash2,
  History,
  Plus,
  Cog,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  BarChart3,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { toast } from '@/lib/toast';
import { formatDistanceToNow } from 'date-fns';
import {
  usePipelines,
  usePipelineStats,
  useCreatePipeline,
  useUpdatePipeline,
  useDeletePipeline,
  useRunPipeline,
  usePipelineExecutions,
  useCancelExecution,
  type DataPipeline,
  type CreatePipelineData,
} from '@/hooks/agents/use-data-pipelines';

// ============================================================================
// Helpers
// ============================================================================

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  api: <Globe className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  file: <File className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
  stream: <Activity className="h-4 w-4" />,
};

const DEST_ICONS: Record<string, React.ReactNode> = {
  database: <Database className="h-4 w-4" />,
  file: <File className="h-4 w-4" />,
  api: <Globe className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
};

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    completed: { variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
    running: { variant: 'secondary', icon: <Clock className="h-3 w-3 animate-spin" /> },
    failed: { variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
    cancelled: { variant: 'outline', icon: <Ban className="h-3 w-3" /> },
  };
  const cfg = variants[status] ?? { variant: 'outline' as const, icon: null };
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
      {cfg.icon}
      {status}
    </Badge>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
      <div className="rounded-lg bg-muted p-2">{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Pipeline Flow Diagram
// ============================================================================

function PipelineFlowDiagram({
  sourceType,
  transformSteps,
  destinationType,
}: {
  sourceType: string;
  transformSteps: any[];
  destinationType: string;
}) {
  const steps = Array.isArray(transformSteps) ? transformSteps : [];
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
      <div className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1">
        {SOURCE_ICONS[sourceType] ?? <Globe className="h-4 w-4" />}
        <span className="capitalize">{sourceType}</span>
      </div>
      <ArrowRight className="h-3 w-3 shrink-0" />
      {steps.length > 0 ? (
        <>
          <div className="flex items-center gap-1 rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 px-2 py-1">
            <Cog className="h-4 w-4 text-amber-600" />
            <span>{steps.length} transform{steps.length !== 1 ? 's' : ''}</span>
          </div>
          <ArrowRight className="h-3 w-3 shrink-0" />
        </>
      ) : (
        <>
          <div className="flex items-center gap-1 rounded-md border border-dashed px-2 py-1 opacity-50">
            <Cog className="h-4 w-4" />
            <span>no transforms</span>
          </div>
          <ArrowRight className="h-3 w-3 shrink-0 opacity-50" />
        </>
      )}
      <div className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1">
        {DEST_ICONS[destinationType] ?? <Database className="h-4 w-4" />}
        <span className="capitalize">{destinationType}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Create/Edit Dialog
// ============================================================================

const EMPTY_FORM: CreatePipelineData = {
  pipeline_name: '',
  description: '',
  source_type: 'api',
  destination_type: 'database',
  transform_steps: [],
  schedule_cron: '',
  is_active: true,
};

function PipelineDialog({
  open,
  onClose,
  pipeline,
}: {
  open: boolean;
  onClose: () => void;
  pipeline?: DataPipeline | null;
}) {
  const isEdit = Boolean(pipeline);
  const [form, setForm] = useState<CreatePipelineData>(
    pipeline
      ? {
          pipeline_name: pipeline.pipeline_name,
          description: pipeline.description ?? '',
          source_type: pipeline.source_type,
          destination_type: pipeline.destination_type,
          transform_steps: pipeline.transform_steps,
          schedule_cron: pipeline.schedule_cron ?? '',
          is_active: pipeline.is_active,
        }
      : EMPTY_FORM
  );
  const [stepsRaw, setStepsRaw] = useState(
    JSON.stringify(pipeline?.transform_steps ?? [], null, 2)
  );
  const [stepsError, setStepsError] = useState('');

  const createMutation = useCreatePipeline();
  const updateMutation = useUpdatePipeline();

  const handleSubmit = async () => {
    let parsedSteps: any[] = [];
    try {
      parsedSteps = JSON.parse(stepsRaw);
      if (!Array.isArray(parsedSteps)) throw new Error('Must be an array');
      setStepsError('');
    } catch {
      setStepsError('Invalid JSON — must be an array of step objects');
      return;
    }

    const payload = { ...form, transform_steps: parsedSteps };

    try {
      if (isEdit && pipeline) {
        await updateMutation.mutateAsync({ id: pipeline.id, data: payload });
        toast.success('Pipeline updated');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Pipeline created');
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save pipeline');
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Pipeline' : 'Create Pipeline'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Pipeline Name *</Label>
            <Input
              value={form.pipeline_name}
              onChange={(e) => setForm((f) => ({ ...f, pipeline_name: e.target.value }))}
              placeholder="My ETL Pipeline"
            />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this pipeline do?"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Source Type</Label>
              <Select
                value={form.source_type}
                onValueChange={(v) => setForm((f) => ({ ...f, source_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['api', 'database', 'file', 'webhook', 'stream'].map((t) => (
                    <SelectItem key={t} value={t}>
                      <div className="flex items-center gap-2">
                        {SOURCE_ICONS[t]}
                        <span className="capitalize">{t}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Destination Type</Label>
              <Select
                value={form.destination_type}
                onValueChange={(v) => setForm((f) => ({ ...f, destination_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['database', 'file', 'api', 'webhook'].map((t) => (
                    <SelectItem key={t} value={t}>
                      <div className="flex items-center gap-2">
                        {DEST_ICONS[t]}
                        <span className="capitalize">{t}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Transform Steps (JSON array)</Label>
            <Textarea
              value={stepsRaw}
              onChange={(e) => setStepsRaw(e.target.value)}
              placeholder={'[\n  {"name": "filter", "type": "filter", "config": {}}\n]'}
              rows={5}
              className="font-mono text-xs"
            />
            {stepsError && <p className="text-xs text-destructive">{stepsError}</p>}
          </div>
          <div className="space-y-1">
            <Label>Schedule (cron expression)</Label>
            <Input
              value={form.schedule_cron}
              onChange={(e) => setForm((f) => ({ ...f, schedule_cron: e.target.value }))}
              placeholder="0 * * * * (hourly) — leave blank for manual"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.pipeline_name.trim()}>
            {isPending ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Execution History Sheet
// ============================================================================

function ExecutionHistorySheet({
  pipeline,
  open,
  onClose,
}: {
  pipeline: DataPipeline | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: executions, isLoading } = usePipelineExecutions(pipeline?.id ?? null);
  const cancelMutation = useCancelExecution();

  const handleCancel = async (execId: string) => {
    try {
      await cancelMutation.mutateAsync(execId);
      toast.success('Execution cancelled');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to cancel');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Execution History — {pipeline?.pipeline_name}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !executions?.length ? (
            <div className="py-12 text-center text-muted-foreground">
              No executions yet. Run the pipeline to see history.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Processed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((exec) => (
                  <TableRow key={exec.id}>
                    <TableCell>
                      <StatusBadge status={exec.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {exec.records_processed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-destructive">
                      {exec.records_failed > 0 ? exec.records_failed.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {exec.duration_ms != null ? `${(exec.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(exec.started_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {exec.status === 'running' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(exec.id)}
                          disabled={cancelMutation.isPending}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Pipeline Card
// ============================================================================

function PipelineCard({
  pipeline,
  onEdit,
  onDelete,
  onHistory,
}: {
  pipeline: DataPipeline;
  onEdit: (p: DataPipeline) => void;
  onDelete: (p: DataPipeline) => void;
  onHistory: (p: DataPipeline) => void;
}) {
  const runMutation = useRunPipeline();
  const updateMutation = useUpdatePipeline();

  const handleRun = async () => {
    try {
      await runMutation.mutateAsync(pipeline.id);
      toast.success(`Pipeline "${pipeline.pipeline_name}" ran successfully`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to run pipeline');
    }
  };

  const handleToggle = async (checked: boolean) => {
    try {
      await updateMutation.mutateAsync({ id: pipeline.id, data: { is_active: checked } });
      toast.success(checked ? 'Pipeline activated' : 'Pipeline deactivated');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update pipeline');
    }
  };

  const steps = Array.isArray(pipeline.transform_steps) ? pipeline.transform_steps : [];

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm truncate">{pipeline.pipeline_name}</h3>
            {pipeline.last_run_status && (
              <StatusBadge status={pipeline.last_run_status} />
            )}
          </div>
          {pipeline.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {pipeline.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={pipeline.is_active}
            onCheckedChange={handleToggle}
            disabled={updateMutation.isPending}
            aria-label="Toggle active"
          />
        </div>
      </div>

      {/* Flow diagram */}
      <PipelineFlowDiagram
        sourceType={pipeline.source_type}
        transformSteps={steps}
        destinationType={pipeline.destination_type}
      />

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <Play className="h-3 w-3" />
          {pipeline.run_count} run{pipeline.run_count !== 1 ? 's' : ''}
        </span>
        {pipeline.schedule_cron ? (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <code className="font-mono text-xs">{pipeline.schedule_cron}</code>
          </span>
        ) : (
          <span className="flex items-center gap-1 opacity-60">
            <Clock className="h-3 w-3" />
            Manual
          </span>
        )}
        {pipeline.last_run_at && (
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {formatDistanceToNow(new Date(pipeline.last_run_at), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="default"
          onClick={handleRun}
          disabled={runMutation.isPending}
          className="flex items-center gap-1"
        >
          <Play className="h-3.5 w-3.5" />
          Run
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onHistory(pipeline)}
          className="flex items-center gap-1"
        >
          <History className="h-3.5 w-3.5" />
          History
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onEdit(pipeline)}
          className="flex items-center gap-1"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(pipeline)}
          className="flex items-center gap-1 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Delete Confirm Dialog
// ============================================================================

function DeleteDialog({
  pipeline,
  open,
  onClose,
}: {
  pipeline: DataPipeline | null;
  open: boolean;
  onClose: () => void;
}) {
  const deleteMutation = useDeletePipeline();

  const handleDelete = async () => {
    if (!pipeline) return;
    try {
      await deleteMutation.mutateAsync(pipeline.id);
      toast.success(`Pipeline "${pipeline.pipeline_name}" deleted`);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete pipeline');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Pipeline</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-foreground">{pipeline?.pipeline_name}</span>? This
          will also delete all execution history and cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function DataPipelinesPage() {
  const { data: pipelines, isLoading } = usePipelines();
  const { data: stats } = usePipelineStats();

  const [createOpen, setCreateOpen] = useState(false);
  const [editPipeline, setEditPipeline] = useState<DataPipeline | null>(null);
  const [deletePipeline, setDeletePipeline] = useState<DataPipeline | null>(null);
  const [historyPipeline, setHistoryPipeline] = useState<DataPipeline | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Data Pipelines</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage ETL pipelines from source to destination with optional transforms
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create Pipeline
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Pipelines"
          value={stats?.total ?? '—'}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Active"
          value={stats?.active ?? '—'}
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
        />
        <StatCard
          label="Total Runs"
          value={stats?.total_executions ?? '—'}
          icon={<Zap className="h-4 w-4 text-blue-500" />}
        />
        <StatCard
          label="Success Rate"
          value={stats ? `${stats.success_rate}%` : '—'}
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
        />
        <StatCard
          label="Records Processed"
          value={stats ? stats.total_records_processed.toLocaleString() : '—'}
          icon={<BarChart3 className="h-4 w-4 text-purple-500" />}
        />
      </div>

      {/* Pipeline grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : !pipelines?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Activity className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
          <h3 className="text-lg font-semibold mb-1">No pipelines yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first pipeline to start moving and transforming data.
          </p>
          <Button onClick={() => setCreateOpen(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create Pipeline
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pipelines.map((pipeline) => (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              onEdit={setEditPipeline}
              onDelete={setDeletePipeline}
              onHistory={setHistoryPipeline}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <PipelineDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <PipelineDialog
        open={Boolean(editPipeline)}
        pipeline={editPipeline}
        onClose={() => setEditPipeline(null)}
      />

      <DeleteDialog
        pipeline={deletePipeline}
        open={Boolean(deletePipeline)}
        onClose={() => setDeletePipeline(null)}
      />

      <ExecutionHistorySheet
        pipeline={historyPipeline}
        open={Boolean(historyPipeline)}
        onClose={() => setHistoryPipeline(null)}
      />
    </div>
  );
}
