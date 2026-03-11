'use client';

import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
  Settings,
  ShieldCheck,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { formatDistanceToNow, parseISO, isPast } from 'date-fns';
import {
  useApprovalWorkflows,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useApprovalRequests,
  useApproveRequest,
  useRejectRequest,
  useCancelRequest,
  useApprovalStats,
} from '@/hooks/agents/use-approval-workflows';
import type { ApprovalWorkflow, ApprovalRequest } from '@/lib/api/approval-workflows';

// ── Status helpers ─────────────────────────────────────────────────────────

const REQUEST_STATUS_CONFIG: Record<
  ApprovalRequest['status'],
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    icon: XCircle,
  },
  expired: {
    label: 'Expired',
    className: 'bg-muted text-muted-foreground',
    icon: AlertCircle,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground',
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: ApprovalRequest['status'] }) {
  const config = REQUEST_STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

// ── New Workflow Dialog ────────────────────────────────────────────────────

function NewWorkflowDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [timeoutHours, setTimeoutHours] = useState(24);
  const [autoReject, setAutoReject] = useState(false);

  const createWorkflow = useCreateWorkflow();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Workflow name is required');
      return;
    }
    try {
      await createWorkflow.mutateAsync({
        workflow_name: name.trim(),
        agent_id: agentId.trim() || undefined,
        approval_timeout_hours: timeoutHours,
        auto_reject_on_timeout: autoReject,
      });
      toast.success('Workflow created');
      setOpen(false);
      setName('');
      setAgentId('');
      setTimeoutHours(24);
      setAutoReject(false);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create workflow');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Approval Workflow</DialogTitle>
          <DialogDescription>
            Configure a workflow to gate agent actions behind human approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Workflow Name</Label>
            <Input
              placeholder="e.g. Production Deploy Gate"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Agent ID (optional — leave blank to apply to all)</Label>
            <Input
              placeholder="Agent ID"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Approval Timeout (hours)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={timeoutHours}
              onChange={(e) => setTimeoutHours(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="cursor-pointer">Auto-reject on timeout</Label>
            <Switch checked={autoReject} onCheckedChange={setAutoReject} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createWorkflow.isPending}>
            {createWorkflow.isPending ? 'Creating...' : 'Create Workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Pending Request Card ───────────────────────────────────────────────────

function PendingRequestCard({ request }: { request: ApprovalRequest }) {
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const approveReq = useApproveRequest();
  const rejectReq = useRejectRequest();
  const cancelReq = useCancelRequest();

  const isExpired = request.expires_at ? isPast(parseISO(request.expires_at)) : false;

  const handleApprove = async () => {
    try {
      await approveReq.mutateAsync({ requestId: request.id, decisionNote: note || undefined });
      toast.success('Request approved');
      setApproveOpen(false);
      setNote('');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to approve');
    }
  };

  const handleReject = async () => {
    try {
      await rejectReq.mutateAsync({ requestId: request.id, decisionNote: note || undefined });
      toast.success('Request rejected');
      setRejectOpen(false);
      setNote('');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to reject');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelReq.mutateAsync(request.id);
      toast.success('Request cancelled');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to cancel');
    }
  };

  return (
    <Card className="border border-amber-500/20 bg-amber-500/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs">
                {request.agent_id.slice(0, 12)}…
              </Badge>
              <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-xs">
                {request.action_type}
              </Badge>
              {isExpired && (
                <Badge variant="destructive" className="text-xs">Expired</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 font-mono break-all line-clamp-3 mb-2">
              {JSON.stringify(request.action_data, null, 2).slice(0, 300)}
            </div>
            {request.expires_at && (
              <p className="text-xs text-muted-foreground">
                Expires {formatDistanceToNow(parseISO(request.expires_at), { addSuffix: true })}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {/* Approve dialog */}
            <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white gap-1"
                  disabled={isExpired}
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Approve
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Approve Request</DialogTitle>
                  <DialogDescription>Optionally add a note for this decision.</DialogDescription>
                </DialogHeader>
                <Textarea
                  placeholder="Decision note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleApprove}
                    disabled={approveReq.isPending}
                  >
                    {approveReq.isPending ? 'Approving...' : 'Approve'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Reject dialog */}
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1"
                  disabled={isExpired}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Reject Request</DialogTitle>
                  <DialogDescription>Optionally add a note for this decision.</DialogDescription>
                </DialogHeader>
                <Textarea
                  placeholder="Decision note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={rejectReq.isPending}
                  >
                    {rejectReq.isPending ? 'Rejecting...' : 'Reject'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={handleCancel}
              disabled={cancelReq.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Workflow Row ───────────────────────────────────────────────────────────

function WorkflowRow({ workflow }: { workflow: ApprovalWorkflow }) {
  const updateWorkflow = useUpdateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const toggleActive = async () => {
    try {
      await updateWorkflow.mutateAsync({
        workflowId: workflow.id,
        data: { is_active: !workflow.is_active },
      });
    } catch {
      toast.error('Failed to update workflow');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteWorkflow.mutateAsync(workflow.id);
      toast.success('Workflow deleted');
      setDeleteOpen(false);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete');
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{workflow.workflow_name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {workflow.agent_id ? `${workflow.agent_id.slice(0, 16)}…` : 'All agents'}
      </TableCell>
      <TableCell className="text-sm">
        {workflow.approval_timeout_hours}h
        {workflow.auto_reject_on_timeout && (
          <span className="ml-1 text-xs text-muted-foreground">(auto-reject)</span>
        )}
      </TableCell>
      <TableCell>
        <Switch
          checked={workflow.is_active}
          onCheckedChange={toggleActive}
          disabled={updateWorkflow.isPending}
        />
      </TableCell>
      <TableCell>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Workflow</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{workflow.workflow_name}"? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteWorkflow.isPending}>
                {deleteWorkflow.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState('');

  const { data: stats, isLoading: statsLoading } = useApprovalStats();
  const { data: pendingRequests, isLoading: pendingLoading } = useApprovalRequests({
    status: 'pending',
  });
  const { data: allRequests, isLoading: requestsLoading } = useApprovalRequests({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    agent_id: agentFilter.trim() || undefined,
  });
  const { data: workflows, isLoading: workflowsLoading } = useApprovalWorkflows();

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approval Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and action pending agent approval requests.
          </p>
        </div>
        <NewWorkflowDialog />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-16 mt-0.5" />
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-semibold tabular-nums">
                    {stats?.pending_count ?? 0}
                  </p>
                  {(stats?.pending_count ?? 0) > 0 && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Approval Rate</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-16 mt-0.5" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums">
                  {stats?.approval_rate.toFixed(1) ?? '0.0'}%
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Timer className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Decision Time</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-20 mt-0.5" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums">
                  {stats?.avg_decision_time_hours.toFixed(1) ?? '0.0'}h
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Requests */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-500" />
          Pending Requests
          {(pendingRequests?.length ?? 0) > 0 && (
            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs tabular-nums">
              {pendingRequests!.length}
            </Badge>
          )}
        </h2>
        {pendingLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : !pendingRequests?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <CheckCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-muted-foreground">No pending requests</p>
              <p className="text-xs text-muted-foreground mt-1">All caught up!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <PendingRequestCard key={req.id} request={req} />
            ))}
          </div>
        )}
      </div>

      {/* All Requests Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">All Requests</CardTitle>
              <CardDescription>Complete history of approval requests.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Filter by agent ID"
                className="h-8 w-44 text-xs"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {requestsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !allRequests?.length ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No requests found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Action Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Decided</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <StatusBadge status={req.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {req.agent_id.slice(0, 12)}…
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {req.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(parseISO(req.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {req.decided_at
                          ? formatDistanceToNow(parseISO(req.decided_at), { addSuffix: true })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {req.decision_note || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workflow Config */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Workflow Configuration
              </CardTitle>
              <CardDescription>Manage approval workflow rules.</CardDescription>
            </div>
            <NewWorkflowDialog />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {workflowsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !workflows?.length ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No workflows configured. Create one to start gating agent actions.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Agent Scope</TableHead>
                    <TableHead>Timeout</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflows.map((wf) => (
                    <WorkflowRow key={wf.id} workflow={wf} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
