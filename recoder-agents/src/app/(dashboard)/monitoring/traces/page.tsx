'use client';

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Zap,
  BarChart2,
  ListChecks,
  AlertCircle,
  Terminal,
  Brain,
  Database,
  GitBranch,
  FileOutput,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useTraces,
  useTraceStats,
  useCreateTrace,
  useDeleteTrace,
  useAddTraceStep,
  useTraceDetail,
} from '@/hooks/agents/use-execution-traces';
import type { ExecutionTrace, TraceStep } from '@/lib/api/execution-traces';

// ============================================================================
// Constants
// ============================================================================

const STATUS_CONFIG = {
  running: {
    label: 'Running',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    icon: Loader2,
    animate: true,
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    icon: CheckCircle2,
    animate: false,
  },
  failed: {
    label: 'Failed',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    icon: XCircle,
    animate: false,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-muted text-muted-foreground border-border',
    icon: AlertCircle,
    animate: false,
  },
} as const;

const STEP_TYPE_CONFIG = {
  action: { label: 'Action', color: 'bg-blue-500/10 text-blue-600', icon: Play },
  decision: { label: 'Decision', color: 'bg-purple-500/10 text-purple-600', icon: GitBranch },
  tool_call: { label: 'Tool Call', color: 'bg-orange-500/10 text-orange-600', icon: Terminal },
  llm_call: { label: 'LLM Call', color: 'bg-indigo-500/10 text-indigo-600', icon: Brain },
  data_fetch: { label: 'Data Fetch', color: 'bg-cyan-500/10 text-cyan-600', icon: Database },
  output: { label: 'Output', color: 'bg-green-500/10 text-green-600', icon: FileOutput },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;
type StepTypeKey = keyof typeof STEP_TYPE_CONFIG;

// ============================================================================
// Status Badge
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as StatusKey] ?? {
    label: status,
    color: 'bg-muted text-muted-foreground border-border',
    icon: Activity,
    animate: false,
  };
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        cfg.color
      )}
    >
      <Icon className={cn('h-3 w-3', cfg.animate && 'animate-spin')} />
      {cfg.label}
    </span>
  );
}

// ============================================================================
// Step Timeline
// ============================================================================

function StepItem({ step }: { step: TraceStep }) {
  const [expanded, setExpanded] = useState(false);
  const typeCfg = STEP_TYPE_CONFIG[step.step_type as StepTypeKey] ?? {
    label: step.step_type,
    color: 'bg-muted text-muted-foreground',
    icon: Activity,
  };
  const TypeIcon = typeCfg.icon;

  return (
    <div className="relative pl-8">
      {/* Circle marker */}
      <div className="absolute left-0 top-1 h-6 w-6 rounded-full border-2 border-muted bg-background flex items-center justify-center text-xs font-bold text-muted-foreground">
        {step.step_index}
      </div>

      <div
        className="border rounded-lg p-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{step.step_name}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
              typeCfg.color
            )}
          >
            <TypeIcon className="h-3 w-3" />
            {typeCfg.label}
          </span>
          {step.status === 'failed' ? (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          ) : step.status === 'skipped' ? (
            <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          )}
          <span className="ml-auto text-xs text-muted-foreground">{step.duration_ms}ms</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>

        {step.error_message && (
          <p className="text-xs text-red-500 mt-1">{step.error_message}</p>
        )}

        {expanded && (
          <div className="mt-3 grid grid-cols-1 gap-2 border-t pt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
              <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-40">
                {JSON.stringify(step.input_data, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
              <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-40">
                {JSON.stringify(step.output_data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Trace Detail Sheet
// ============================================================================

function TraceDetailSheet({
  trace,
  open,
  onClose,
}: {
  trace: ExecutionTrace;
  open: boolean;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useTraceDetail(open ? trace.id : null);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{trace.trace_name ?? 'Execution Trace'}</SheetTitle>
          <SheetDescription>
            <span className="font-mono text-xs">{trace.agent_id}</span>
            {trace.thread_id && (
              <span className="ml-2 text-xs text-muted-foreground">· thread: {trace.thread_id}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Trace meta */}
        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
          <StatusBadge status={trace.status} />
          <span className="text-muted-foreground flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" />
            {trace.total_steps} steps
          </span>
          {trace.duration_ms != null && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {trace.duration_ms}ms
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            Started: {new Date(trace.started_at).toLocaleString()}
          </span>
        </div>

        {/* Steps timeline */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !detail?.steps?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No steps recorded for this trace.
          </p>
        ) : (
          <div className="space-y-3">
            {detail.steps.map((step) => (
              <StepItem key={step.id} step={step} />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Create Trace Dialog
// ============================================================================

function CreateTraceDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    agent_id: '',
    thread_id: '',
    trace_name: '',
  });
  const [addStep, setAddStep] = useState(false);
  const [stepForm, setStepForm] = useState({
    step_name: '',
    step_type: 'action' as TraceStep['step_type'],
  });

  const createTrace = useCreateTrace();
  const addTraceStep = useAddTraceStep();

  const handleSubmit = async () => {
    if (!form.agent_id) {
      toast.error('Agent ID is required');
      return;
    }
    try {
      const trace = await createTrace.mutateAsync({
        agent_id: form.agent_id,
        thread_id: form.thread_id || undefined,
        trace_name: form.trace_name || undefined,
      });

      if (addStep && stepForm.step_name) {
        await addTraceStep.mutateAsync({
          traceId: trace.id,
          data: {
            step_index: 0,
            step_name: stepForm.step_name,
            step_type: stepForm.step_type,
          },
        });
      }

      toast.success('Trace created');
      setOpen(false);
      setForm({ agent_id: '', thread_id: '', trace_name: '' });
      setAddStep(false);
    } catch {
      toast.error('Failed to create trace');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Create Trace
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Execution Trace</DialogTitle>
          <DialogDescription>Start a new execution trace for an agent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Agent ID *</Label>
            <Input
              value={form.agent_id}
              onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
              placeholder="agent_abc123"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Thread ID</Label>
            <Input
              value={form.thread_id}
              onChange={(e) => setForm((f) => ({ ...f, thread_id: e.target.value }))}
              placeholder="optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Trace Name</Label>
            <Input
              value={form.trace_name}
              onChange={(e) => setForm((f) => ({ ...f, trace_name: e.target.value }))}
              placeholder="e.g. run-analysis-v2"
            />
          </div>

          <div className="border-t pt-3">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setAddStep((v) => !v)}
            >
              {addStep ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Add initial step
            </button>
            {addStep && (
              <div className="mt-3 space-y-2">
                <div className="space-y-1.5">
                  <Label>Step Name</Label>
                  <Input
                    value={stepForm.step_name}
                    onChange={(e) => setStepForm((f) => ({ ...f, step_name: e.target.value }))}
                    placeholder="initialize"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Step Type</Label>
                  <Select
                    value={stepForm.step_type}
                    onValueChange={(v) =>
                      setStepForm((f) => ({ ...f, step_type: v as TraceStep['step_type'] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STEP_TYPE_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createTrace.isPending || addTraceStep.isPending}>
            {createTrace.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Trace Table Row
// ============================================================================

function TraceRow({ trace }: { trace: ExecutionTrace }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const deleteTrace = useDeleteTrace();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteTrace.mutateAsync(trace.id);
      toast.success('Trace deleted');
    } catch {
      toast.error('Failed to delete trace');
    }
  };

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
        <td className="px-4 py-3 text-sm font-medium">
          {trace.trace_name ?? <span className="text-muted-foreground italic">unnamed</span>}
        </td>
        <td className="px-4 py-3 text-xs font-mono text-muted-foreground truncate max-w-[140px]">
          {trace.agent_id}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={trace.status} />
        </td>
        <td className="px-4 py-3 text-sm text-center">{trace.total_steps}</td>
        <td className="px-4 py-3 text-sm text-right">
          {trace.duration_ms != null ? `${trace.duration_ms}ms` : '—'}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {new Date(trace.started_at).toLocaleString()}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setSheetOpen(true)}
            >
              View Steps
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteTrace.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {sheetOpen && (
        <TraceDetailSheet trace={trace} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      )}
    </>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function ExecutionTracesPage() {
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filters = {
    agent_id: agentFilter || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  };

  const { data: traces, isLoading: tracesLoading } = useTraces(filters);
  const { data: stats, isLoading: statsLoading } = useTraceStats();

  // Chart data from by_status
  const chartData = stats
    ? Object.entries(stats.by_status).map(([status, count]) => ({
        name: status.charAt(0).toUpperCase() + status.slice(1),
        count,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Execution Traces</h2>
          <p className="text-sm text-muted-foreground">
            Monitor agent execution traces and step-by-step activity.
          </p>
        </div>
        <CreateTraceDialog />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Total Traces</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Avg Duration</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-2xl font-bold">{Math.round(stats?.avg_duration_ms ?? 0)}ms</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" /> Completed
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-2xl font-bold text-green-600">{stats?.by_status.completed ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-500" /> Failed
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-2xl font-bold text-red-600">{stats?.by_status.failed ?? 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Chart */}
      {stats && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="h-4 w-4" /> Traces by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Agent ID</Label>
          <Input
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            placeholder="Filter by agent..."
            className="h-8 w-52 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {tracesLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !traces?.length ? (
            <div className="py-16 text-center">
              <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No traces found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a trace to start recording agent execution activity.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Agent
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Steps
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Duration
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Started
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {traces.map((trace) => (
                    <TraceRow key={trace.id} trace={trace} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
