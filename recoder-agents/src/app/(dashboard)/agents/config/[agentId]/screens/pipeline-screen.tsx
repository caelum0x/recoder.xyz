'use client';

import React, { useState } from 'react';
import {
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
  ArrowRight,
  GitMerge,
  Shield,
  Zap,
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
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useDeploymentPipelines,
  useCreatePipeline,
  useUpdatePipeline,
  useDeletePipeline,
  useStartPipelineRun,
  usePipelineRuns,
  usePipelineRunDetail,
  useAdvanceRun,
  useCancelRun,
  usePipelineGates,
  usePassGate,
  useFailGate,
} from '@/hooks/agents/use-deployment-pipelines';
import type {
  DeploymentPipeline,
  PipelineRun,
  PipelineGate,
  PipelineStage,
} from '@/lib/api/deployment-pipelines';

// ============================================================================
// Types
// ============================================================================

interface StageFormItem {
  name: string;
  type: 'test' | 'build' | 'deploy' | 'validate';
  config: string; // raw JSON string
}

// ============================================================================
// Helpers
// ============================================================================

const STAGE_TYPE_COLORS: Record<string, string> = {
  test: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  build: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  deploy: 'bg-green-500/10 text-green-400 border-green-500/20',
  validate: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const GATE_TYPE_COLORS: Record<string, string> = {
  manual: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  auto: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  approval: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const GATE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  passed: 'bg-green-500/10 text-green-400 border-green-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  skipped: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

function RunStatusBadge({ status }: { status: PipelineRun['status'] }) {
  const map: Record<PipelineRun['status'], { label: string; className: string; animate?: boolean }> = {
    running: { label: 'Running', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20', animate: true },
    paused: { label: 'Paused', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    completed: { label: 'Completed', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
    failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
    cancelled: { label: 'Cancelled', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  };
  const cfg = map[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        cfg.className
      )}
    >
      {cfg.animate && <Loader2 className="h-3 w-3 animate-spin" />}
      {cfg.label}
    </span>
  );
}

function StageFlow({ stages, currentIndex }: { stages: PipelineStage[]; currentIndex?: number }) {
  if (!stages || stages.length === 0) {
    return <span className="text-xs text-muted-foreground italic">No stages defined</span>;
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {stages.map((stage, i) => (
        <React.Fragment key={i}>
          <span
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium border',
              currentIndex !== undefined && i === currentIndex
                ? 'bg-blue-600 text-white border-blue-500 ring-2 ring-blue-400/40'
                : currentIndex !== undefined && i < currentIndex
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : STAGE_TYPE_COLORS[stage.type] ?? 'bg-muted text-muted-foreground border-border'
            )}
          >
            {stage.name}
          </span>
          {i < stages.length - 1 && (
            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================================================================
// New Pipeline Dialog
// ============================================================================

function NewPipelineDialog({
  agentId,
  open,
  onClose,
}: {
  agentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const createMutation = useCreatePipeline();
  const [pipelineName, setPipelineName] = useState('');
  const [autoPromote, setAutoPromote] = useState(false);
  const [stages, setStages] = useState<StageFormItem[]>([
    { name: '', type: 'build', config: '{}' },
  ]);

  const addStage = () =>
    setStages((prev) => [...prev, { name: '', type: 'deploy', config: '{}' }]);

  const removeStage = (idx: number) =>
    setStages((prev) => prev.filter((_, i) => i !== idx));

  const updateStage = (idx: number, field: keyof StageFormItem, value: string) =>
    setStages((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );

  const handleSave = async () => {
    if (!pipelineName.trim()) {
      toast.error('Pipeline name is required');
      return;
    }
    const parsedStages = stages
      .filter((s) => s.name.trim())
      .map((s) => {
        let cfg: Record<string, unknown> = {};
        try {
          cfg = JSON.parse(s.config || '{}');
        } catch {
          // ignore invalid JSON
        }
        return { name: s.name.trim(), type: s.type, config: cfg };
      });

    try {
      await createMutation.mutateAsync({
        pipeline_name: pipelineName.trim(),
        agent_id: agentId,
        stages: parsedStages,
        auto_promote: autoPromote,
      });
      toast.success('Pipeline created');
      setPipelineName('');
      setStages([{ name: '', type: 'build', config: '{}' }]);
      setAutoPromote(false);
      onClose();
    } catch {
      toast.error('Failed to create pipeline');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Deployment Pipeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Pipeline Name</Label>
            <Input
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              placeholder="e.g. Production Deploy"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={autoPromote} onCheckedChange={setAutoPromote} id="auto-promote" />
            <Label htmlFor="auto-promote" className="cursor-pointer">
              Auto-promote through stages
            </Label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Stages</Label>
              <Button variant="outline" size="sm" onClick={addStage}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Stage
              </Button>
            </div>
            <div className="space-y-3">
              {stages.map((stage, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground w-16">
                      Stage {idx + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => removeStage(idx)}
                      disabled={stages.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={stage.name}
                        onChange={(e) => updateStage(idx, 'name', e.target.value)}
                        placeholder="Stage name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={stage.type}
                        onValueChange={(v) =>
                          updateStage(idx, 'type', v as StageFormItem['type'])
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="test">Test</SelectItem>
                          <SelectItem value="build">Build</SelectItem>
                          <SelectItem value="deploy">Deploy</SelectItem>
                          <SelectItem value="validate">Validate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Config (JSON)</Label>
                    <Textarea
                      value={stage.config}
                      onChange={(e) => updateStage(idx, 'config', e.target.value)}
                      placeholder="{}"
                      className="h-16 text-xs font-mono resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Run History Panel
// ============================================================================

function RunHistoryPanel({ pipeline }: { pipeline: DeploymentPipeline }) {
  const { data: runs, isLoading } = usePipelineRuns(pipeline.id);
  const advanceMutation = useAdvanceRun();
  const cancelMutation = useCancelRun();
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2 mt-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-2 italic">No runs yet. Click Run to start.</p>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      {runs.map((run) => {
        const isExpanded = expandedRunId === run.id;
        const stageCount = pipeline.stages.length;
        const progress = stageCount > 0 ? (run.current_stage_index / stageCount) * 100 : 0;

        return (
          <div key={run.id} className="border border-border rounded-lg">
            <button
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
              onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <RunStatusBadge status={run.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Stage {run.current_stage_index + 1}/{stageCount || '?'}
                  </span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()}
                </p>
                {run.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    Done {new Date(run.completed_at).toLocaleString()}
                  </p>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border p-3 space-y-3">
                {/* Actions */}
                {(run.status === 'running' || run.status === 'paused') && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        advanceMutation.mutate(
                          { runId: run.id },
                          { onSuccess: () => toast.success('Advanced to next stage') }
                        )
                      }
                      disabled={advanceMutation.isPending}
                    >
                      {advanceMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <SkipForward className="h-3.5 w-3.5 mr-1" />
                      )}
                      Advance
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        cancelMutation.mutate(run.id, {
                          onSuccess: () => toast.success('Run cancelled'),
                        })
                      }
                      disabled={cancelMutation.isPending}
                    >
                      {cancelMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                      )}
                      Cancel
                    </Button>
                  </div>
                )}

                {/* Stage results */}
                {run.stage_results && run.stage_results.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Stage Results</p>
                    <div className="space-y-1.5">
                      {run.stage_results.map((sr, idx) => (
                        <details key={idx} className="group">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                            <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                            Stage {(sr.stage_index ?? idx) + 1} — {sr.advanced_at
                              ? new Date(sr.advanced_at).toLocaleString()
                              : ''}
                          </summary>
                          <pre className="mt-1.5 text-xs font-mono bg-muted/60 rounded p-2 overflow-auto max-h-32">
                            {JSON.stringify(sr.result, null, 2)}
                          </pre>
                        </details>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Gate Controls Panel
// ============================================================================

function GateControlsPanel({ pipelineId }: { pipelineId: string }) {
  const { data: gates, isLoading } = usePipelineGates(pipelineId);
  const passMutation = usePassGate();
  const failMutation = useFailGate();

  if (isLoading) {
    return <Skeleton className="h-16 w-full mt-2" />;
  }

  if (!gates || gates.length === 0) {
    return <p className="text-xs text-muted-foreground mt-2 italic">No gates configured.</p>;
  }

  return (
    <div className="space-y-2 mt-2">
      {gates.map((gate) => (
        <div key={gate.id} className="border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Stage {gate.stage_index + 1} Gate</span>
            <Badge
              variant="outline"
              className={cn('text-xs ml-auto', GATE_TYPE_COLORS[gate.gate_type])}
            >
              {gate.gate_type}
            </Badge>
            <Badge
              variant="outline"
              className={cn('text-xs', GATE_STATUS_COLORS[gate.status])}
            >
              {gate.status}
            </Badge>
          </div>

          {gate.status === 'pending' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-green-400 hover:text-green-400"
                onClick={() =>
                  passMutation.mutate(gate.id, {
                    onSuccess: () => toast.success('Gate passed'),
                    onError: () => toast.error('Failed to pass gate'),
                  })
                }
                disabled={passMutation.isPending}
              >
                {passMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                )}
                Pass Gate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-400 hover:text-red-400"
                onClick={() =>
                  failMutation.mutate(gate.id, {
                    onSuccess: () => toast.error('Gate failed'),
                    onError: () => toast.error('Failed to update gate'),
                  })
                }
                disabled={failMutation.isPending}
              >
                {failMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                )}
                Fail Gate
              </Button>
            </div>
          )}

          {gate.evaluated_at && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Evaluated {new Date(gate.evaluated_at).toLocaleString()}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Pipeline Card
// ============================================================================

function PipelineCard({
  pipeline,
  agentId,
  onEdit,
  onDelete,
}: {
  pipeline: DeploymentPipeline;
  agentId: string;
  onEdit: (p: DeploymentPipeline) => void;
  onDelete: (p: DeploymentPipeline) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const startRunMutation = useStartPipelineRun();
  const updateMutation = useUpdatePipeline();

  const handleToggleActive = async () => {
    try {
      await updateMutation.mutateAsync({
        pipelineId: pipeline.id,
        data: { is_active: !pipeline.is_active },
      });
      toast.success(pipeline.is_active ? 'Pipeline deactivated' : 'Pipeline activated');
    } catch {
      toast.error('Failed to update pipeline');
    }
  };

  const handleRun = async () => {
    try {
      await startRunMutation.mutateAsync(pipeline.id);
      toast.success('Pipeline run started');
      setExpanded(true);
    } catch {
      toast.error('Failed to start pipeline run');
    }
  };

  return (
    <SpotlightCard className="overflow-hidden">
      {/* Header row */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm truncate">{pipeline.pipeline_name}</span>
                {pipeline.auto_promote && (
                  <Badge variant="outline" className="text-xs border-blue-500/20 text-blue-400 bg-blue-500/10">
                    Auto-promote
                  </Badge>
                )}
              </div>
              <StageFlow stages={pipeline.stages} />
            </div>
          </button>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Switch
              checked={pipeline.is_active}
              onCheckedChange={handleToggleActive}
              disabled={updateMutation.isPending}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRun}
              disabled={startRunMutation.isPending || !pipeline.is_active}
            >
              {startRunMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
              )}
              Run
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(pipeline)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(pipeline)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border space-y-5">
            {/* Stage count info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GitMerge className="h-3.5 w-3.5" />
              <span>{pipeline.stages.length} stage{pipeline.stages.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Gate controls */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Gates
              </p>
              <GateControlsPanel pipelineId={pipeline.id} />
            </div>

            {/* Run history */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Run History
              </p>
              <RunHistoryPanel pipeline={pipeline} />
            </div>
          </div>
        )}
      </div>
    </SpotlightCard>
  );
}

// ============================================================================
// Edit Pipeline Dialog
// ============================================================================

function EditPipelineDialog({
  pipeline,
  open,
  onClose,
}: {
  pipeline: DeploymentPipeline;
  open: boolean;
  onClose: () => void;
}) {
  const updateMutation = useUpdatePipeline();
  const [pipelineName, setPipelineName] = useState(pipeline.pipeline_name);
  const [autoPromote, setAutoPromote] = useState(pipeline.auto_promote);
  const [stages, setStages] = useState<StageFormItem[]>(
    pipeline.stages.map((s) => ({
      name: s.name,
      type: s.type,
      config: JSON.stringify(s.config ?? {}, null, 2),
    }))
  );

  const addStage = () =>
    setStages((prev) => [...prev, { name: '', type: 'deploy', config: '{}' }]);
  const removeStage = (idx: number) =>
    setStages((prev) => prev.filter((_, i) => i !== idx));
  const updateStage = (idx: number, field: keyof StageFormItem, value: string) =>
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const handleSave = async () => {
    if (!pipelineName.trim()) {
      toast.error('Pipeline name is required');
      return;
    }
    const parsedStages = stages
      .filter((s) => s.name.trim())
      .map((s) => {
        let cfg: Record<string, unknown> = {};
        try { cfg = JSON.parse(s.config || '{}'); } catch { /* ignore */ }
        return { name: s.name.trim(), type: s.type, config: cfg };
      });
    try {
      await updateMutation.mutateAsync({
        pipelineId: pipeline.id,
        data: { pipeline_name: pipelineName.trim(), stages: parsedStages, auto_promote: autoPromote },
      });
      toast.success('Pipeline updated');
      onClose();
    } catch {
      toast.error('Failed to update pipeline');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Pipeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Pipeline Name</Label>
            <Input
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={autoPromote} onCheckedChange={setAutoPromote} id="edit-auto-promote" />
            <Label htmlFor="edit-auto-promote" className="cursor-pointer">
              Auto-promote through stages
            </Label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Stages</Label>
              <Button variant="outline" size="sm" onClick={addStage}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Stage
              </Button>
            </div>
            <div className="space-y-3">
              {stages.map((stage, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground w-16">
                      Stage {idx + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => removeStage(idx)}
                      disabled={stages.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={stage.name}
                        onChange={(e) => updateStage(idx, 'name', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={stage.type}
                        onValueChange={(v) => updateStage(idx, 'type', v as StageFormItem['type'])}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="test">Test</SelectItem>
                          <SelectItem value="build">Build</SelectItem>
                          <SelectItem value="deploy">Deploy</SelectItem>
                          <SelectItem value="validate">Validate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Config (JSON)</Label>
                    <Textarea
                      value={stage.config}
                      onChange={(e) => updateStage(idx, 'config', e.target.value)}
                      className="h-16 text-xs font-mono resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export function PipelineScreen({ agentId }: { agentId: string }) {
  const { data: pipelines, isLoading } = useDeploymentPipelines(agentId);
  const deleteMutation = useDeletePipeline();

  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<DeploymentPipeline | null>(null);
  const [deletingPipeline, setDeletingPipeline] = useState<DeploymentPipeline | null>(null);

  const handleConfirmDelete = async () => {
    if (!deletingPipeline) return;
    try {
      await deleteMutation.mutateAsync(deletingPipeline.id);
      toast.success('Pipeline deleted');
    } catch {
      toast.error('Failed to delete pipeline');
    } finally {
      setDeletingPipeline(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Deployment Pipelines</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure multi-stage deployment pipelines with gate controls and run history.
          </p>
        </div>
        <Button onClick={() => setIsNewDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Pipeline
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : !pipelines || pipelines.length === 0 ? (
        <SpotlightCard className="py-12 text-center">
          <GitMerge className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="font-medium text-muted-foreground">No pipelines yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first deployment pipeline to automate staged rollouts.
          </p>
          <Button className="mt-4" onClick={() => setIsNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Pipeline
          </Button>
        </SpotlightCard>
      ) : (
        <div className="space-y-3">
          {pipelines.map((pipeline) => (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              agentId={agentId}
              onEdit={setEditingPipeline}
              onDelete={setDeletingPipeline}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <NewPipelineDialog
        agentId={agentId}
        open={isNewDialogOpen}
        onClose={() => setIsNewDialogOpen(false)}
      />

      {editingPipeline && (
        <EditPipelineDialog
          pipeline={editingPipeline}
          open={!!editingPipeline}
          onClose={() => setEditingPipeline(null)}
        />
      )}

      <AlertDialog
        open={!!deletingPipeline}
        onOpenChange={(v) => !v && setDeletingPipeline(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pipeline</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deletingPipeline?.pipeline_name}&quot;? This will also delete all
              associated runs and gates. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
