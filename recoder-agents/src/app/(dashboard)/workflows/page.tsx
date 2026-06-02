'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Workflow as WorkflowIcon,
  Plus,
  Play,
  Trash2,
  Search,
  LayoutTemplate,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useAllWorkflows,
  type WorkflowWithAgent,
} from '@/hooks/workflows/use-all-workflows';
import {
  useCreateWorkflow,
  useDeleteWorkflow,
  useExecuteWorkflow,
  usePendingApprovals,
  useApproveGate,
  useRejectGate,
} from '@/hooks/workflows/use-workflows';
import type { Workflow } from '@/lib/api/workflows';

type StatusFilter = 'all' | Workflow['status'];

const STATUS_STYLES: Record<Workflow['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  archived: 'bg-zinc-500/15 text-zinc-500',
};

const STATUS_OPTIONS: StatusFilter[] = ['all', 'draft', 'active', 'paused', 'archived'];

export default function WorkflowsPage() {
  const { workflows, agents, isLoading, refetch } = useAllWorkflows();
  const { data: approvals } = usePendingApprovals();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workflows.filter((w) => {
      const matchesStatus = status === 'all' || w.status === status;
      const matchesQuery =
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q) ||
        w.agent_name.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [workflows, search, status]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <WorkflowIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
            <p className="text-sm text-muted-foreground">
              Multi-step automations that orchestrate your agents end to end.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/workflows/templates">
              <LayoutTemplate className="mr-2 h-4 w-4" />
              Templates
            </Link>
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Workflow
          </Button>
        </div>
      </header>

      {approvals && approvals.length > 0 && (
        <ApprovalsBanner count={approvals.length} approvals={approvals} />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows, agents, descriptions…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} className="capitalize">
                {option === 'all' ? 'All statuses' : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <WorkflowGridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          hasAny={workflows.length > 0}
          onCreate={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} onChanged={refetch} />
          ))}
        </div>
      )}

      <CreateWorkflowDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        onCreated={refetch}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflow card
// ---------------------------------------------------------------------------

function WorkflowCard({
  workflow,
  onChanged,
}: {
  workflow: WorkflowWithAgent;
  onChanged: () => void;
}) {
  const execute = useExecuteWorkflow();
  const remove = useDeleteWorkflow();

  const handleRun = async () => {
    try {
      await execute.mutateAsync({ workflowId: workflow.id });
      toast.success(`Started "${workflow.name}"`);
      onChanged();
    } catch {
      // handled by api layer
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete workflow "${workflow.name}"? This cannot be undone.`)) return;
    try {
      await remove.mutateAsync(workflow.id);
      toast.success(`Deleted "${workflow.name}"`);
      onChanged();
    } catch {
      // handled by api layer
    }
  };

  return (
    <Card className="flex flex-col transition-colors hover:border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-1 text-base">{workflow.name}</CardTitle>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
              STATUS_STYLES[workflow.status],
            )}
          >
            {workflow.status}
          </span>
        </div>
        <CardDescription className="line-clamp-2 min-h-[2.5rem]">
          {workflow.description || 'No description provided.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end gap-2 pb-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <WorkflowIcon className="h-3.5 w-3.5" />
          <span className="truncate">{workflow.agent_name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>v{workflow.version}</span>
        </div>
      </CardContent>
      <CardFooter className="gap-2 border-t pt-3">
        <Button
          size="sm"
          className="flex-1"
          onClick={handleRun}
          disabled={execute.isPending}
        >
          {execute.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          Run
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/workflows/${workflow.id}`}>
            Open
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={remove.isPending}
          aria-label="Delete workflow"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pending approvals banner
// ---------------------------------------------------------------------------

function ApprovalsBanner({
  count,
  approvals,
}: {
  count: number;
  approvals: ReturnType<typeof usePendingApprovals>['data'] extends infer T
    ? T extends Array<infer U>
      ? U[]
      : never
    : never;
}) {
  const approve = useApproveGate();
  const reject = useRejectGate();

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          {count} approval{count === 1 ? '' : 's'} waiting on you
        </span>
        <Link
          href="/workflows/approvals"
          className="text-xs font-medium underline-offset-2 hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {approvals.slice(0, 4).map((gate) => (
          <div
            key={gate.id}
            className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {gate.workflow_name || 'Workflow'} · {gate.node_label || 'Approval gate'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Requested {new Date(gate.requested_at).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => approve.mutate(gate.id)}
                disabled={approve.isPending}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-500" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => reject.mutate(gate.id)}
                disabled={reject.isPending}
              >
                <XCircle className="mr-1 h-3.5 w-3.5 text-red-500" />
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateWorkflowDialog({
  open,
  onOpenChange,
  agents,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: ReturnType<typeof useAllWorkflows>['agents'];
  onCreated: () => void;
}) {
  const create = useCreateWorkflow();
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const reset = () => {
    setAgentId('');
    setName('');
    setDescription('');
  };

  const handleSubmit = async () => {
    if (!agentId) {
      toast.error('Pick an agent to own this workflow.');
      return;
    }
    if (!name.trim()) {
      toast.error('Give the workflow a name.');
      return;
    }
    try {
      await create.mutateAsync({
        agent_id: agentId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success(`Created "${name.trim()}"`);
      reset();
      onOpenChange(false);
      onCreated();
    } catch {
      // handled by api layer
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>
            Workflows belong to an agent and chain steps — tasks, approvals,
            branches — into a repeatable automation.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Owner agent</label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an agent…" />
              </SelectTrigger>
              <SelectContent>
                {agents.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No agents yet — create one first.
                  </div>
                ) : (
                  agents.map((agent) => (
                    <SelectItem key={agent.agent_id} value={agent.agent_id}>
                      {agent.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ship feature branch"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow do?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Empty + loading states
// ---------------------------------------------------------------------------

function EmptyState({
  hasAny,
  onCreate,
}: {
  hasAny: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">
        <WorkflowIcon className="h-6 w-6" />
      </div>
      <div>
        <p className="font-medium">
          {hasAny ? 'No workflows match your filters' : 'No workflows yet'}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasAny
            ? 'Try clearing the search or status filter.'
            : 'Build your first multi-step agent automation to get started.'}
        </p>
      </div>
      {!hasAny && (
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Workflow
        </Button>
      )}
    </div>
  );
}

function WorkflowGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex flex-col">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2 h-8 w-full" />
          </CardHeader>
          <CardContent className="pb-3">
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
          <CardFooter className="border-t pt-3">
            <Skeleton className="h-8 w-full" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
