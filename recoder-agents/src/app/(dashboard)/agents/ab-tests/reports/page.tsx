'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Trophy,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  FlaskConical,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAbTestReports,
  useAbTestReportDetail,
  useCreateAbTestReport,
  useRecordSample,
  useCompleteTest,
  useAbTestSummary,
} from '@/hooks/agents/use-ab-test-reports';
import { useAgents } from '@/hooks/agents/use-agents';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { toast } from '@/lib/toast';
import type { AbTestReport, ReportFilters } from '@/lib/api/ab-test-reports';

// ---- Status badge colors ----

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const WINNER_LABELS: Record<string, string> = {
  a: 'Variant A',
  b: 'Variant B',
};

// ---- Create Report Dialog ----

function CreateReportDialog() {
  const [open, setOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [agentId, setAgentId] = useState<string | undefined>(undefined);

  const { data: agents } = useAgents();
  const createReport = useCreateAbTestReport();

  const handleCreate = async () => {
    if (!reportName || !agentId) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      await createReport.mutateAsync({
        agent_id: agentId,
        report_name: reportName,
      });
      toast.success('Report created');
      setOpen(false);
      setReportName('');
      setAgentId(undefined);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create report');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create A/B Test Report</DialogTitle>
          <DialogDescription>
            Set up a new A/B test report to compare variant performance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Report Name</Label>
            <Input
              placeholder="e.g. Prompt comparison test"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {(agents || []).map((agent: any) => (
                  <SelectItem key={agent.agent_id || agent.id} value={agent.agent_id || agent.id}>
                    {agent.name || agent.agent_id || agent.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createReport.isPending}>
            {createReport.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Report Card ----

function ReportCard({ report }: { report: AbTestReport }) {
  const [expanded, setExpanded] = useState(false);
  const completeTest = useCompleteTest();

  const totalSamples = report.sample_size_a + report.sample_size_b;
  const confidencePct = Math.min(report.confidence_level, 100);

  const handleComplete = async () => {
    try {
      await completeTest.mutateAsync(report.test_id);
      toast.success('Test completed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete test');
    }
  };

  // Extract metric keys from totals
  const variantATotals = report.metrics?.variant_a_totals || {};
  const variantBTotals = report.metrics?.variant_b_totals || {};
  const allMetricKeys = Array.from(
    new Set([...Object.keys(variantATotals), ...Object.keys(variantBTotals)])
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{report.report_name}</CardTitle>
            <CardDescription className="text-xs">
              Agent: {report.agent_id.slice(0, 8)}... | Created:{' '}
              {new Date(report.created_at).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_COLORS[report.status] || ''}>
              {report.status}
            </Badge>
            {report.winner && (
              <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                <Trophy className="mr-1 h-3 w-3" />
                {WINNER_LABELS[report.winner] || report.winner}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Variant Comparison Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Variant A</span>
              <span className="text-xs text-muted-foreground">
                {report.sample_size_a} samples
              </span>
            </div>
            {report.winner === 'a' && (
              <Badge variant="outline" className="text-green-600 text-xs mb-1">
                Winner
              </Badge>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Variant B</span>
              <span className="text-xs text-muted-foreground">
                {report.sample_size_b} samples
              </span>
            </div>
            {report.winner === 'b' && (
              <Badge variant="outline" className="text-green-600 text-xs mb-1">
                Winner
              </Badge>
            )}
          </div>
        </div>

        {/* Sample Size Display */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Samples</span>
            <span className="font-medium">{totalSamples}</span>
          </div>
          <Progress value={totalSamples > 0 ? Math.min(totalSamples, 100) : 0} className="h-1.5" />
        </div>

        {/* Confidence Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-medium">{confidencePct.toFixed(1)}%</span>
          </div>
          <Progress value={confidencePct} className="h-1.5" />
        </div>

        {/* Expandable Metrics Table */}
        {allMetricKeys.length > 0 && (
          <div>
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {expanded ? 'Hide' : 'Show'} Metrics ({allMetricKeys.length})
            </button>
            {expanded && (
              <div className="mt-2 border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-1.5 text-left font-medium">Metric</th>
                      <th className="px-3 py-1.5 text-right font-medium">Variant A</th>
                      <th className="px-3 py-1.5 text-right font-medium">Variant B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allMetricKeys.map((key) => {
                      const aVal = variantATotals[key];
                      const bVal = variantBTotals[key];
                      const aAvg =
                        report.sample_size_a > 0 && typeof aVal === 'number'
                          ? (aVal / report.sample_size_a).toFixed(2)
                          : '-';
                      const bAvg =
                        report.sample_size_b > 0 && typeof bVal === 'number'
                          ? (bVal / report.sample_size_b).toFixed(2)
                          : '-';
                      return (
                        <tr key={key} className="border-t">
                          <td className="px-3 py-1.5 text-muted-foreground">{key}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{aAvg}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{bAvg}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {report.status === 'running' && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleComplete}
            disabled={completeTest.isPending}
            className="w-full"
          >
            <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
            {completeTest.isPending ? 'Completing...' : 'Complete Test'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Summary Card ----

function SummaryCard() {
  const { data: summary, isLoading } = useAbTestSummary();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <RecoderLoader />
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Tests</span>
          </div>
          <p className="text-2xl font-bold mt-1">{summary.total_tests}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-muted-foreground">Running</span>
          </div>
          <p className="text-2xl font-bold mt-1">{summary.running_tests}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <span className="text-sm text-muted-foreground">Avg Confidence</span>
          </div>
          <p className="text-2xl font-bold mt-1">{summary.avg_confidence.toFixed(1)}%</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-green-500" />
            <span className="text-sm text-muted-foreground">Completed</span>
          </div>
          <p className="text-2xl font-bold mt-1">{summary.completed_tests}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Main Page ----

export default function AbTestReportsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [agentFilter, setAgentFilter] = useState<string | undefined>(undefined);

  const filters: ReportFilters = useMemo(
    () => ({
      ...(statusFilter && { status: statusFilter }),
      ...(agentFilter && { agent_id: agentFilter }),
    }),
    [statusFilter, agentFilter],
  );

  const { data: reports, isLoading } = useAbTestReports(
    Object.keys(filters).length > 0 ? filters : undefined,
  );
  const { data: agents } = useAgents();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">A/B Test Reports</h1>
          <p className="text-sm text-muted-foreground">
            Compare variant performance with structured test reports
          </p>
        </div>
        <CreateReportDialog />
      </div>

      {/* Summary */}
      <SummaryCard />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter || 'all'}
          onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={agentFilter || 'all'}
          onValueChange={(v) => setAgentFilter(v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {(agents || []).map((agent: any) => (
              <SelectItem key={agent.agent_id || agent.id} value={agent.agent_id || agent.id}>
                {agent.name || agent.agent_id || agent.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Report List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <RecoderLoader />
        </div>
      ) : !reports || reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No reports yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first A/B test report to start comparing variants
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <ReportCard key={report.test_id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}
