'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Play,
  Loader2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import {
  usePipeline,
  useUpdatePipeline,
  useExecutePipeline,
  usePipelineRuns,
} from '@/hooks/agents/use-pipelines';
import { useAgents } from '@/hooks/agents/use-agents';
import { PipelineExecutionView } from '@/components/pipelines/pipeline-execution-view';
import type { PipelineStep, PipelineRun } from '@/lib/api/pipelines';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRunTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDuration(startedAt: string, completedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const elapsed = Math.max(0, end - start);
  const totalSeconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const RUN_STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  completed: {
    label: 'Completed',
    className: 'bg-green-500/10 text-green-600',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  running: {
    label: 'Running',
    className: 'bg-blue-500/10 text-blue-600',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-500/10 text-red-600',
    icon: <XCircle className="h-3 w-3" />,
  },
  pending: {
    label: 'Pending',
    className: 'bg-yellow-500/10 text-yellow-600',
    icon: <Clock className="h-3 w-3" />,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

// ---------------------------------------------------------------------------
// Step Editor Row
// ---------------------------------------------------------------------------

function StepRow({
  step,
  index,
  agents,
  onChange,
  onRemove,
  canRemove,
}: {
  step: PipelineStep;
  index: number;
  agents: Array<{ agent_id: string; name: string }>;
  onChange: (updated: PipelineStep) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="group relative rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        {/* Step number */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0 mt-0.5">
          {index + 1}
        </div>

        <div className="flex-1 space-y-3 min-w-0">
          {/* Agent selector */}
          <div className="flex items-center gap-2">
            <Select
              value={step.agent_id || ''}
              onValueChange={(value) => {
                const agent = agents.find((a) => a.agent_id === value);
                onChange({
                  ...step,
                  agent_id: value,
                  agent_name: agent?.name || step.agent_name,
                });
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select an agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.agent_id} value={a.agent_id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-red-600 flex-shrink-0"
                onClick={onRemove}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Input mapping */}
          <Textarea
            placeholder="Input mapping (optional) — describe how to pass data from previous step..."
            value={step.input_mapping || ''}
            onChange={(e) =>
              onChange({ ...step, input_mapping: e.target.value || undefined })
            }
            rows={2}
            className="text-sm resize-none"
          />

          {/* Condition */}
          <Input
            placeholder="Condition (optional) — e.g. only run if previous step succeeded"
            value={step.condition || ''}
            onChange={(e) =>
              onChange({ ...step, condition: e.target.value || undefined })
            }
            className="text-sm"
          />
        </div>
      </div>

      {/* Connector arrow */}
      <div className="flex justify-center mt-2 text-muted-foreground/30">
        <div className="h-4 w-px bg-border" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PipelineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pipelineId = params.pipelineId as string;

  const { data: pipeline, isLoading } = usePipeline(pipelineId);
  const updateMutation = useUpdatePipeline();
  const executeMutation = useExecutePipeline();
  const { data: runs } = usePipelineRuns(pipelineId);
  const { data: agentsData } = useAgents({ limit: 100, sort_by: 'name', sort_order: 'asc' });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null);

  // Populate form from loaded pipeline
  useEffect(() => {
    if (pipeline) {
      setName(pipeline.name);
      setDescription(pipeline.description || '');
      const pipelineSteps = Array.isArray(pipeline.steps) ? pipeline.steps : [];
      setSteps(pipelineSteps);
      setHasChanges(false);
    }
  }, [pipeline]);

  // Agent list for selector
  const agentsList = React.useMemo(() => {
    if (!agentsData) return [];
    const list = Array.isArray(agentsData) ? agentsData : (agentsData as any).agents || [];
    return list.map((a: any) => ({
      agent_id: a.agent_id || a.id,
      name: a.name || a.agent_id || a.id,
    }));
  }, [agentsData]);

  const handleStepChange = useCallback(
    (index: number, updated: PipelineStep) => {
      setSteps((prev) => {
        const next = [...prev];
        next[index] = updated;
        return next;
      });
      setHasChanges(true);
    },
    [],
  );

  const handleRemoveStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  }, []);

  const handleAddStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      { agent_id: '', agent_name: '', input_mapping: undefined, condition: undefined },
    ]);
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      id: pipelineId,
      name,
      description: description || undefined,
      steps,
    });
    setHasChanges(false);
  };

  const handleRun = async () => {
    const result = await executeMutation.mutateAsync(pipelineId);
    setRunsOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="text-muted-foreground">Pipeline not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push('/pipelines')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pipelines
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push('/pipelines')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
          <GitBranch className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setHasChanges(true);
            }}
            className="text-lg font-semibold border-none shadow-none px-0 h-auto focus-visible:ring-0"
            placeholder="Pipeline name..."
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasChanges || updateMutation.isPending || steps.length < 2}
            onClick={handleSave}
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save
          </Button>
          <Button
            size="sm"
            disabled={executeMutation.isPending || steps.length < 2 || steps.some((s) => !s.agent_id)}
            onClick={handleRun}
          >
            {executeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1.5" />
            )}
            Run
          </Button>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6">
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setHasChanges(true);
          }}
          placeholder="Describe what this pipeline does..."
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      {/* Steps */}
      <div className="space-y-2 mb-6">
        <h2 className="text-sm font-medium text-muted-foreground">
          Steps ({steps.length})
        </h2>
        {steps.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-card">
            <p className="text-sm text-muted-foreground mb-2">
              No steps added yet. Add at least 2 steps to create a pipeline.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <StepRow
                key={index}
                step={step}
                index={index}
                agents={agentsList}
                onChange={(updated) => handleStepChange(index, updated)}
                onRemove={() => handleRemoveStep(index)}
                canRemove={steps.length > 2}
              />
            ))}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleAddStep}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Step
        </Button>
        {steps.length > 0 && steps.length < 2 && (
          <p className="text-xs text-amber-600">
            Pipelines require at least 2 steps.
          </p>
        )}
      </div>

      {/* Execution view for selected run */}
      {selectedRun && (
        <div className="mb-6 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Execution Details</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setSelectedRun(null)}
            >
              Close
            </Button>
          </div>
          <PipelineExecutionView run={selectedRun} steps={steps} />
        </div>
      )}

      {/* Run History */}
      <Collapsible open={runsOpen} onOpenChange={setRunsOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
            {runsOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Run History
            {runs && runs.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {runs.length}
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {!runs || runs.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg bg-card">
              No runs yet. Click &quot;Run&quot; to execute this pipeline.
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const statusCfg =
                  RUN_STATUS_CONFIG[run.status] || RUN_STATUS_CONFIG.pending;
                return (
                  <button
                    key={run.id}
                    onClick={() =>
                      setSelectedRun(
                        selectedRun?.id === run.id ? null : run,
                      )
                    }
                    className={cn(
                      'w-full text-left flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:border-foreground/20',
                      selectedRun?.id === run.id && 'border-primary/50 bg-primary/5',
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          'flex items-center gap-1 text-xs',
                          statusCfg.className,
                        )}
                      >
                        {statusCfg.icon}
                        {statusCfg.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {run.current_step}/{run.total_steps} steps
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                      <span>
                        {formatDuration(run.started_at, run.completed_at)}
                      </span>
                      <span>{formatRunTime(run.started_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
