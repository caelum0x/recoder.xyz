'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Calendar,
  Clock,
  Play,
  Trash2,
  Pencil,
  Download,
  Eye,
  Plus,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  useScheduledReports,
  useCreateScheduledReport,
  useUpdateScheduledReport,
  useDeleteScheduledReport,
  useGenerateReport,
  useReportHistory,
  useReportData,
} from '@/hooks/reports/use-scheduled-reports';
import type { ScheduledReport, ReportHistory } from '@/lib/api/scheduled-reports';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_TYPES = [
  { value: 'agent_summary', label: 'Agent Summary', color: 'bg-blue-500' },
  { value: 'cost_breakdown', label: 'Cost Breakdown', color: 'bg-green-500' },
  { value: 'run_analytics', label: 'Run Analytics', color: 'bg-purple-500' },
  { value: 'health_digest', label: 'Health Digest', color: 'bg-amber-500' },
  { value: 'usage_overview', label: 'Usage Overview', color: 'bg-cyan-500' },
  { value: 'custom', label: 'Custom', color: 'bg-gray-500' },
] as const;

const OUTPUT_FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'markdown', label: 'Markdown' },
] as const;

const CRON_PRESETS = [
  { label: 'Daily 9am', cron: '0 9 * * *', description: 'Every day at 9:00 AM' },
  { label: 'Weekly Monday', cron: '0 9 * * 1', description: 'Every Monday at 9:00 AM' },
  { label: 'Monthly 1st', cron: '0 9 1 * *', description: 'First day of every month at 9:00 AM' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-700 border-green-500/20',
  failed: 'bg-red-500/10 text-red-700 border-red-500/20',
  partial: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
};

function getTypeBadgeColor(type: string): string {
  return REPORT_TYPES.find((t) => t.value === type)?.color || 'bg-gray-500';
}

function getTypeLabel(type: string): string {
  return REPORT_TYPES.find((t) => t.value === type)?.label || type;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// New Report Dialog
// ---------------------------------------------------------------------------

function NewReportDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState('agent_summary');
  const [agentIds, setAgentIds] = useState('');
  const [scheduleCron, setScheduleCron] = useState('0 9 * * *');
  const [scheduleDescription, setScheduleDescription] = useState('Every day at 9:00 AM');
  const [outputFormat, setOutputFormat] = useState('json');
  const [configJson, setConfigJson] = useState('{}');

  const createMutation = useCreateScheduledReport();

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Report name is required');
      return;
    }
    if (!scheduleCron.trim()) {
      toast.error('Cron schedule is required');
      return;
    }

    let config = {};
    try {
      config = JSON.parse(configJson);
    } catch {
      toast.error('Invalid JSON in config field');
      return;
    }

    const parsedAgentIds = agentIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    createMutation.mutate(
      {
        name: name.trim(),
        report_type: reportType,
        agent_ids: parsedAgentIds,
        schedule_cron: scheduleCron,
        schedule_description: scheduleDescription || undefined,
        output_format: outputFormat,
        config,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName('');
          setAgentIds('');
          setScheduleCron('0 9 * * *');
          setScheduleDescription('Every day at 9:00 AM');
          setOutputFormat('json');
          setConfigJson('{}');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Scheduled Report</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My weekly summary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Report Type</label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Agent IDs (comma-separated, optional)</label>
            <Input
              value={agentIds}
              onChange={(e) => setAgentIds(e.target.value)}
              placeholder="agent-id-1, agent-id-2"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cron Schedule</label>
            <Input
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
              placeholder="0 9 * * *"
            />
            <div className="flex gap-2 flex-wrap">
              {CRON_PRESETS.map((preset) => (
                <Button
                  key={preset.cron}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setScheduleCron(preset.cron);
                    setScheduleDescription(preset.description);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Schedule Description</label>
            <Input
              value={scheduleDescription}
              onChange={(e) => setScheduleDescription(e.target.value)}
              placeholder="Every day at 9:00 AM"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Output Format</label>
            <Select value={outputFormat} onValueChange={setOutputFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Config (JSON)</label>
            <Textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              placeholder="{}"
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Create Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Report Data Viewer Dialog
// ---------------------------------------------------------------------------

function ReportDataViewerDialog({
  historyId,
  open,
  onOpenChange,
}: {
  historyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: reportData, isLoading } = useReportData(open ? historyId : null);

  const handleCopy = () => {
    if (reportData?.data) {
      navigator.clipboard.writeText(JSON.stringify(reportData.data, null, 2));
      toast.success('Copied to clipboard');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Report Data
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="absolute right-2 top-2 z-10 gap-1"
            onClick={handleCopy}
          >
            <Copy className="h-3 w-3" />
            Copy
          </Button>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : (
            <pre className="bg-muted rounded-lg p-4 overflow-auto max-h-[50vh] text-xs font-mono">
              {reportData?.data
                ? JSON.stringify(reportData.data, null, 2)
                : 'No data available'}
            </pre>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Report History Section
// ---------------------------------------------------------------------------

function ReportHistorySection({ reportId }: { reportId: string }) {
  const { data: history, isLoading } = useReportHistory(reportId);
  const [viewHistoryId, setViewHistoryId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Loading history...
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No report generations yet. Click &quot;Generate Now&quot; to create one.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Generated</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((h) => (
            <TableRow key={h.id}>
              <TableCell>
                <Badge variant="outline" className={STATUS_COLORS[h.status] || ''}>
                  {h.status}
                </Badge>
              </TableCell>
              <TableCell className="tabular-nums">{h.row_count}</TableCell>
              <TableCell className="tabular-nums">
                {h.generation_time_ms != null ? `${h.generation_time_ms}ms` : '-'}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {formatDate(h.created_at)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setViewHistoryId(h.id)}
                >
                  <Eye className="h-3 w-3" />
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ReportDataViewerDialog
        historyId={viewHistoryId}
        open={!!viewHistoryId}
        onOpenChange={(open) => {
          if (!open) setViewHistoryId(null);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Report Row
// ---------------------------------------------------------------------------

function ReportRow({ report }: { report: ScheduledReport }) {
  const [expanded, setExpanded] = useState(false);
  const updateMutation = useUpdateScheduledReport();
  const deleteMutation = useDeleteScheduledReport();
  const generateMutation = useGenerateReport();

  const handleToggleActive = () => {
    updateMutation.mutate({
      reportId: report.id,
      data: { is_active: !report.is_active },
    });
  };

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="font-medium">{report.name}</div>
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className="gap-1"
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${getTypeBadgeColor(report.report_type)}`}
            />
            {getTypeLabel(report.report_type)}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {report.schedule_description || report.schedule_cron}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs tabular-nums">
          {formatDate(report.next_run_at)}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs tabular-nums">
          {formatDate(report.last_generated_at)}
        </TableCell>
        <TableCell>
          <Switch
            checked={report.is_active}
            onCheckedChange={handleToggleActive}
            disabled={updateMutation.isPending}
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => generateMutation.mutate(report.id)}
              disabled={generateMutation.isPending}
              title="Generate Now"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Hide history' : 'Show history'}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => deleteMutation.mutate(report.id)}
              disabled={deleteMutation.isPending}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <ReportHistorySection reportId={report.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ScheduledReportsPage() {
  const { data: reports, isLoading } = useScheduledReports();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Scheduled Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure automated report generation schedules
            </p>
          </div>
        </div>
        <NewReportDialog />
      </div>

      {/* Reports list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Reports
          </CardTitle>
          <CardDescription>
            {isLoading
              ? 'Loading...'
              : !reports || reports.length === 0
                ? 'No scheduled reports yet'
                : `${reports.length} report${reports.length !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading reports...
            </div>
          ) : !reports || reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileText className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">Create your first scheduled report</p>
              <NewReportDialog />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Last Generated</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
