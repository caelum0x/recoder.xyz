'use client';

import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  PieChart,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useCostProjects,
  useCreateCostProject,
  useUpdateCostProject,
  useDeleteCostProject,
  useCostAllocations,
  useCostReport,
} from '@/hooks/billing/use-cost-allocation';
import type {
  CostProject,
  CreateCostProjectRequest,
} from '@/lib/api/cost-allocation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Constants
// ============================================================================

const COLOR_PRESETS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
];

type PeriodOption = '7' | '14' | '30';

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

// ============================================================================
// New Project Dialog
// ============================================================================

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createProject = useCreateCostProject();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    const request: CreateCostProjectRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      budget: budget ? parseFloat(budget) : undefined,
      color,
    };
    createProject.mutate(request, {
      onSuccess: () => {
        onOpenChange(false);
        setName('');
        setDescription('');
        setBudget('');
        setColor(COLOR_PRESETS[0]);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Cost Project</DialogTitle>
          <DialogDescription>
            Create a project to track and allocate run costs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Marketing Campaigns"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Budget ($)</label>
            <Input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="e.g., 100.00"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-all',
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createProject.isPending}
          >
            {createProject.isPending ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Project Card
// ============================================================================

function ProjectCard({ project }: { project: CostProject }) {
  const deleteProject = useDeleteCostProject();
  const budgetPct =
    project.budget && project.budget > 0
      ? Math.min((project.total_spend / project.budget) * 100, 100)
      : null;

  const budgetColor =
    budgetPct !== null
      ? budgetPct >= 90
        ? 'text-red-500'
        : budgetPct >= 70
          ? 'text-yellow-500'
          : 'text-green-500'
      : '';

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <CardTitle className="text-base">{project.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                if (confirm('Delete this project? Allocations will be unlinked.')) {
                  deleteProject.mutate(project.id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
        {project.description && (
          <CardDescription className="text-xs mt-1">
            {project.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">
              ${project.total_spend.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">
              {project.run_count} run{project.run_count !== 1 ? 's' : ''}
            </span>
          </div>

          {project.budget !== null && project.budget !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Budget</span>
                <span className={cn('font-medium', budgetColor)}>
                  {budgetPct !== null ? `${budgetPct.toFixed(0)}%` : '0%'} of $
                  {project.budget.toFixed(2)}
                </span>
              </div>
              <Progress
                value={budgetPct ?? 0}
                className="h-2"
              />
            </div>
          )}

          {!project.is_active && (
            <Badge variant="secondary" className="text-xs">
              Inactive
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Cost Report Chart
// ============================================================================

function CostReportChart({
  projects,
}: {
  projects: Array<{
    project_name: string;
    project_color: string;
    total_spend: number;
    budget?: number | null;
  }>;
}) {
  const chartData = projects.map((p) => ({
    name: p.project_name.length > 15 ? p.project_name.slice(0, 15) + '...' : p.project_name,
    spend: Number(p.total_spend.toFixed(2)),
    budget: p.budget ? Number(p.budget.toFixed(2)) : 0,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No project data to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          formatter={(value: number, name: string) => [
            `$${value.toFixed(2)}`,
            name === 'spend' ? 'Actual Spend' : 'Budget',
          ]}
        />
        <Legend />
        <Bar dataKey="spend" fill="#6366f1" name="Actual Spend" radius={[4, 4, 0, 0]} />
        <Bar dataKey="budget" fill="#94a3b8" name="Budget" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function CostAllocationPage() {
  const [period, setPeriod] = useState<PeriodOption>('30');
  const [showNewProject, setShowNewProject] = useState(false);

  const days = parseInt(period, 10);

  const { data: projects, isLoading: projectsLoading } = useCostProjects();
  const { data: report, isLoading: reportLoading } = useCostReport(days);
  const { data: allocationsData, isLoading: allocationsLoading } = useCostAllocations({
    days,
    limit: 50,
  });

  const allocations = allocationsData?.allocations ?? [];
  const topAgents = report?.top_agents ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Cost Allocation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and allocate agent run costs across projects
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowNewProject(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spend</p>
                <p className="text-2xl font-bold">
                  {reportLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    `$${(report?.total_spend ?? 0).toFixed(2)}`
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <PieChart className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Projects</p>
                <p className="text-2xl font-bold">
                  {projectsLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    projects?.length ?? 0
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unallocated</p>
                <p className="text-2xl font-bold">
                  {reportLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    `$${(report?.unallocated_spend ?? 0).toFixed(2)}`
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Projects</h2>
        {projectsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : !projects || projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <PieChart className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No projects yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create a project to start tracking costs
              </p>
              <Button onClick={() => setShowNewProject(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>

      {/* Cost Report Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Budget vs Actual
          </CardTitle>
          <CardDescription>
            Spending compared to budgets over the last {days} days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <CostReportChart projects={report?.projects ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Top Agents by Cost */}
      {topAgents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Agents by Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent ID</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topAgents.map((agent) => (
                  <TableRow key={agent.agent_id}>
                    <TableCell className="font-mono text-sm">
                      {agent.agent_id.length > 12
                        ? `${agent.agent_id.slice(0, 12)}...`
                        : agent.agent_id}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${agent.cost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right">{agent.runs}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Allocation Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Recent Allocations
          </CardTitle>
          <CardDescription>
            Run cost allocations for the last {days} days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allocationsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : allocations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No allocations found for this period
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">
                      {a.run_id.length > 10
                        ? `${a.run_id.slice(0, 10)}...`
                        : a.run_id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.agent_id
                        ? a.agent_id.length > 10
                          ? `${a.agent_id.slice(0, 10)}...`
                          : a.agent_id
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {a.project_name ? (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: a.project_color || '#6366f1',
                            color: a.project_color || '#6366f1',
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full mr-1 inline-block"
                            style={{
                              backgroundColor: a.project_color || '#6366f1',
                            }}
                          />
                          {a.project_name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Unallocated
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${a.cost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {(a.tokens_in + a.tokens_out).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.model || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(() => {
                        try {
                          return format(parseISO(a.allocated_at), 'MMM d, HH:mm');
                        } catch {
                          return a.allocated_at;
                        }
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Project Dialog */}
      <NewProjectDialog open={showNewProject} onOpenChange={setShowNewProject} />
    </div>
  );
}
