'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  GitBranch,
  Plus,
  Play,
  Trash2,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Inbox,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  usePipelines,
  useDeletePipeline,
  useExecutePipeline,
  useCreatePipeline,
} from '@/hooks/agents/use-pipelines';
import type { Pipeline } from '@/lib/api/pipelines';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  completed: {
    label: 'Completed',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  running: {
    label: 'Running',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-500/10 text-red-600 border-red-500/20',
    icon: <XCircle className="h-3 w-3" />,
  },
  pending: {
    label: 'Pending',
    className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    icon: <Clock className="h-3 w-3" />,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground border-border',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

// ---------------------------------------------------------------------------
// Pipeline Card
// ---------------------------------------------------------------------------

function PipelineCard({
  pipeline,
  onRun,
  onDelete,
  isRunning,
}: {
  pipeline: Pipeline;
  onRun: () => void;
  onDelete: () => void;
  isRunning: boolean;
}) {
  const status = pipeline.last_run_status
    ? STATUS_CONFIG[pipeline.last_run_status] || null
    : null;

  return (
    <div className="group relative rounded-xl border bg-card p-5 transition-colors hover:border-foreground/20">
      <Link
        href={`/pipelines/${pipeline.id}`}
        className="absolute inset-0 z-0 rounded-xl"
      />
      <div className="relative z-10 pointer-events-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
              <GitBranch className="h-4 w-4" />
            </div>
            <h3 className="font-medium truncate">{pipeline.name}</h3>
          </div>
          {status && (
            <Badge
              variant="outline"
              className={cn('flex items-center gap-1 text-xs flex-shrink-0', status.className)}
            >
              {status.icon}
              {status.label}
            </Badge>
          )}
        </div>

        {/* Description */}
        {pipeline.description && (
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {pipeline.description}
          </p>
        )}

        {/* Steps preview */}
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          {pipeline.steps.slice(0, 4).map((step, i) => (
            <React.Fragment key={i}>
              <span className="truncate max-w-[100px]">
                {step.agent_name || step.agent_id.slice(0, 8)}
              </span>
              {i < Math.min(pipeline.steps.length, 4) - 1 && (
                <ArrowRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
              )}
            </React.Fragment>
          ))}
          {pipeline.steps.length > 4 && (
            <span className="text-muted-foreground/50">
              +{pipeline.steps.length - 4} more
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{pipeline.steps.length} steps</span>
            <span>{pipeline.run_count ?? 0} runs</span>
            <span>{formatDate(pipeline.created_at)}</span>
          </div>
          <div className="flex items-center gap-1 pointer-events-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isRunning}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRun();
              }}
            >
              {isRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-600"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PipelinesPage() {
  const router = useRouter();
  const { data: pipelines, isLoading } = usePipelines();
  const deleteMutation = useDeletePipeline();
  const executeMutation = useExecutePipeline();
  const createMutation = useCreatePipeline();

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await executeMutation.mutateAsync(id);
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  };

  const handleCreateNew = async () => {
    try {
      const pipeline = await createMutation.mutateAsync({
        name: 'New Pipeline',
        description: '',
        steps: [
          { agent_id: '', agent_name: 'Step 1' },
          { agent_id: '', agent_name: 'Step 2' },
        ],
      });
      router.push(`/pipelines/${pipeline.id}`);
    } catch {
      // Pipeline creation requires valid steps — navigate to a "new" route
      // For now, the API requires agent_ids; we handle with placeholder steps
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Agent Pipelines
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chain multiple agents together for complex multi-step workflows.
          </p>
        </div>
        <Button onClick={handleCreateNew} disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          New Pipeline
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !pipelines || pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
            <Inbox className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">No pipelines yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Chain multiple agents together for complex workflows. Each step
            passes its output to the next agent in the sequence.
          </p>
          <Button className="mt-4" onClick={handleCreateNew} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Pipeline
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pipelines.map((pipeline) => (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              onRun={() => handleRun(pipeline.id)}
              onDelete={() => setDeleteTarget(pipeline.id)}
              isRunning={runningId === pipeline.id}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pipeline</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this pipeline and all its run history.
              This action cannot be undone.
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
