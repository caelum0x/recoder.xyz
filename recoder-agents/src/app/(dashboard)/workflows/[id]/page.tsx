'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  CircleDashed,
  Ban,
  GitBranch,
  Boxes,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useWorkflow,
  useWorkflowExecutions,
  useExecuteWorkflow,
} from '@/hooks/workflows/use-workflows';
import type { WorkflowExecution, WorkflowNode } from '@/lib/api/workflows';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  archived: 'bg-zinc-500/15 text-zinc-500',
};

const NODE_ICON: Record<WorkflowNode['node_type'], typeof Boxes> = {
  agent: Boxes,
  tool: Boxes,
  condition: GitBranch,
  loop: CircleDashed,
  parallel: GitBranch,
  delay: Clock,
  approval: CheckCircle2,
  input: ChevronLeft,
  output: ChevronLeft,
};

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: workflow, isLoading } = useWorkflow(id);
  const { data: executions } = useWorkflowExecutions(id);
  const execute = useExecuteWorkflow();

  const handleRun = async () => {
    try {
      await execute.mutateAsync({ workflowId: id });
      toast.success('Workflow run started.');
    } catch {
      // handled by api layer
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 py-16 text-center">
        <p className="font-medium">Workflow not found</p>
        <Button variant="outline" asChild>
          <Link href="/workflows">Back to workflows</Link>
        </Button>
      </div>
    );
  }

  const nodes = workflow.nodes ?? [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/workflows"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Workflows
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{workflow.name}</h1>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
                  STATUS_STYLES[workflow.status] ?? STATUS_STYLES.draft,
                )}
              >
                {workflow.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {workflow.description || 'No description provided.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Version {workflow.version} · {nodes.length} step
              {nodes.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/agents/config/${workflow.agent_id}?screen=workflows`}>
                Edit in designer
              </Link>
            </Button>
            <Button onClick={handleRun} disabled={execute.isPending}>
              {execute.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run now
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Steps</CardTitle>
        </CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              This workflow has no steps yet. Open the designer to build it.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {nodes.map((node, index) => {
                const Icon = NODE_ICON[node.node_type] ?? Boxes;
                return (
                  <li
                    key={node.id}
                    className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">{node.label}</span>
                    <span className="rounded bg-background px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground">
                      {node.node_type}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {!executions || executions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No runs yet. Hit “Run now” to start the first one.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {executions.map((execution) => (
                <RunRow key={execution.id} execution={execution} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const RUN_STATUS: Record<
  WorkflowExecution['status'],
  { icon: typeof CheckCircle2; className: string }
> = {
  pending: { icon: CircleDashed, className: 'text-muted-foreground' },
  running: { icon: Loader2, className: 'text-blue-500 animate-spin' },
  paused: { icon: Clock, className: 'text-amber-500' },
  completed: { icon: CheckCircle2, className: 'text-emerald-500' },
  failed: { icon: XCircle, className: 'text-red-500' },
  cancelled: { icon: Ban, className: 'text-zinc-500' },
};

function RunRow({ execution }: { execution: WorkflowExecution }) {
  const meta = RUN_STATUS[execution.status] ?? RUN_STATUS.pending;
  const Icon = meta.icon;

  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <Icon className={cn('h-4 w-4', meta.className)} />
      <span className="capitalize">{execution.status}</span>
      <span className="flex-1 truncate text-xs text-muted-foreground">
        {new Date(execution.started_at).toLocaleString()}
      </span>
      {typeof execution.duration_seconds === 'number' && (
        <span className="text-xs text-muted-foreground">
          {execution.duration_seconds.toFixed(1)}s
        </span>
      )}
      {typeof execution.total_cost === 'number' && (
        <span className="text-xs text-muted-foreground">
          ${execution.total_cost.toFixed(4)}
        </span>
      )}
    </li>
  );
}
