// Advanced report builder for analytics with visualization and export options
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Plus,
  X,
  Save,
  Download,
  Play,
  Calendar as CalendarIcon,
  FileText,
  BarChart3,
  PieChart,
  LineChart,
  Table,
  Settings,
  Database,
  Filter,
  GroupIcon,
  SortAsc,
  Target,
  Clock,
  Mail,
  Share2,
  Copy,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportField {
  id: string;
  field: string;
  label: string;
  aggregation?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct';
  format?: 'number' | 'currency' | 'percentage' | 'date' | 'text';
  visible: boolean;
}

interface ReportFilter {
  id: string;
  field: string;
  operator: string;
  value: any;
}

interface ReportGrouping {
  id: string;
  field: string;
  interval?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

interface ReportSorting {
  id: string;
  field: string;
  direction: 'asc' | 'desc';
}

interface ReportVisualization {
  type: 'table' | 'bar' | 'line' | 'pie' | 'area' | 'scatter';
  xAxis?: string;
  yAxis?: string;
  groupBy?: string;
  colorBy?: string;
}

interface ReportSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  recipients: string[];
  format: 'pdf' | 'csv' | 'excel';
}

interface ReportConfig {
  id?: string;
  name: string;
  description?: string;
  dataSource: string;
  fields: ReportField[];
  filters: ReportFilter[];
  grouping: ReportGrouping[];
  sorting: ReportSorting[];
  visualization: ReportVisualization;
  schedule?: ReportSchedule;
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
}

interface ReportBuilderProps {
  className?: string;
}

const dataSourceOptions = [
  { value: 'projects', label: 'Projects', icon: Database },
  { value: 'users', label: 'Users', icon: Database },
  { value: 'deployments', label: 'Deployments', icon: Database },
  { value: 'usage', label: 'Usage Statistics', icon: Database },
  { value: 'performance', label: 'Performance Metrics', icon: Database },
  { value: 'errors', label: 'Error Logs', icon: Database },
];

const visualizationOptions = [
  { value: 'table', label: 'Table', icon: Table, description: 'Detailed data table' },
  { value: 'bar', label: 'Bar Chart', icon: BarChart3, description: 'Compare categories' },
  { value: 'line', label: 'Line Chart', icon: LineChart, description: 'Show trends over time' },
  { value: 'pie', label: 'Pie Chart', icon: PieChart, description: 'Show proportions' },
  { value: 'area', label: 'Area Chart', icon: LineChart, description: 'Stacked data over time' },
];

const fieldOptions: Record<string, any[]> = {
  projects: [
    { field: 'name', label: 'Project Name', type: 'text' },
    { field: 'status', label: 'Status', type: 'text' },
    { field: 'framework', label: 'Framework', type: 'text' },
    { field: 'language', label: 'Language', type: 'text' },
    { field: 'visibility', label: 'Visibility', type: 'text' },
    { field: 'createdAt', label: 'Created Date', type: 'date' },
    { field: 'updatedAt', label: 'Updated Date', type: 'date' },
    { field: 'deploymentCount', label: 'Deployment Count', type: 'number', aggregations: ['count', 'sum', 'avg'] },
    { field: 'mediaFileCount', label: 'Media Files', type: 'number', aggregations: ['count', 'sum', 'avg'] },
  ],
  users: [
    { field: 'name', label: 'User Name', type: 'text' },
    { field: 'email', label: 'Email', type: 'text' },
    { field: 'createdAt', label: 'Registration Date', type: 'date' },
    { field: 'lastLoginAt', label: 'Last Login', type: 'date' },
    { field: 'projectCount', label: 'Project Count', type: 'number', aggregations: ['count', 'sum', 'avg'] },
    { field: 'mfaEnabled', label: 'MFA Enabled', type: 'boolean' },
  ],
  usage: [
    { field: 'date', label: 'Date', type: 'date' },
    { field: 'generationsUsed', label: 'Generations Used', type: 'number', aggregations: ['sum', 'avg', 'max'] },
    { field: 'tokensUsed', label: 'Tokens Used', type: 'number', aggregations: ['sum', 'avg', 'max'] },
    { field: 'costAccrued', label: 'Cost Accrued', type: 'number', aggregations: ['sum', 'avg', 'max'] },
  ],
};

export default function ReportBuilder({ className }: ReportBuilderProps) {
  const [report, setReport] = useState<ReportConfig>({
    name: '',
    description: '',
    dataSource: '',
    fields: [],
    filters: [],
    grouping: [],
    sorting: [],
    visualization: { type: 'table' },
    dateRange: { from: null, to: null },
  });

  const [savedReports, setSavedReports] = useState<ReportConfig[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Load saved reports
  useEffect(() => {
    loadSavedReports();
  }, []);

  const loadSavedReports = async () => {
    try {
      const response = await fetch('/api/analytics/report-builder');
      if (response.ok) {
        const data = await response.json();
        setSavedReports(data.reports || []);
      }
    } catch (error) {
      console.error('Failed to load saved reports:', error);
    }
  };

  const updateReport = useCallback((updates: Partial<ReportConfig>) => {
    setReport(prev => ({ ...prev, ...updates }));
  }, []);

  const addField = useCallback((field: any) => {
    const newField: ReportField = {
      id: `field_${Date.now()}`,
      field: field.field,
      label: field.label,
      aggregation: field.aggregations?.[0] || undefined,
      format: field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text',
      visible: true,
    };
    setReport(prev => ({
      ...prev,
      fields: [...prev.fields, newField]
    }));
  }, []);

  const removeField = useCallback((fieldId: string) => {
    setReport(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== fieldId)
    }));
  }, []);

  const updateField = useCallback((fieldId: string, updates: Partial<ReportField>) => {
    setReport(prev => ({
      ...prev,
      fields: prev.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
    }));
  }, []);

  const addFilter = useCallback(() => {
    const newFilter: ReportFilter = {
      id: `filter_${Date.now()}`,
      field: '',
      operator: 'equals',
      value: '',
    };
    setReport(prev => ({
      ...prev,
      filters: [...prev.filters, newFilter]
    }));
  }, []);

  const removeFilter = useCallback((filterId: string) => {
    setReport(prev => ({
      ...prev,
      filters: prev.filters.filter(f => f.id !== filterId)
    }));
  }, []);

  const addGrouping = useCallback(() => {
    const newGrouping: ReportGrouping = {
      id: `grouping_${Date.now()}`,
      field: '',
    };
    setReport(prev => ({
      ...prev,
      grouping: [...prev.grouping, newGrouping]
    }));
  }, []);

  const addSorting = useCallback(() => {
    const newSorting: ReportSorting = {
      id: `sorting_${Date.now()}`,
      field: '',
      direction: 'asc',
    };
    setReport(prev => ({
      ...prev,
      sorting: [...prev.sorting, newSorting]
    }));
  }, []);

  const generatePreview = async () => {
    if (!report.dataSource || report.fields.length === 0) return;

    setPreviewLoading(true);
    try {
      const response = await fetch('/api/analytics/report-builder/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      if (response.ok) {
        const data = await response.json();
        setPreviewData(data.data || []);
      }
    } catch (error) {
      console.error('Failed to generate preview:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const saveReport = async () => {
    if (!report.name.trim()) return;

    try {
      const response = await fetch('/api/analytics/report-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      if (response.ok) {
        await loadSavedReports();
        setSaveDialogOpen(false);
      }
    } catch (error) {
      console.error('Failed to save report:', error);
    }
  };

  const exportReport = async (format: 'pdf' | 'csv' | 'excel') => {
    try {
      const response = await fetch('/api/analytics/report-builder/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...report, format }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.name || 'report'}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export report:', error);
    }
  };

  const availableFields = fieldOptions[report.dataSource] || [];

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Report Builder
              </CardTitle>
              <CardDescription>
                Create custom analytics reports with visualizations
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={report.id || ''} onValueChange={(id) => {
                const savedReport = savedReports.find(r => r.id === id);
                if (savedReport) setReport(savedReport);
              }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Load saved report" />
                </SelectTrigger>
                <SelectContent>
                  {savedReports.map((savedReport) => (
                    <SelectItem key={savedReport.id} value={savedReport.id!}>
                      {savedReport.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
              <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Report Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="report-name">Report Name</Label>
                  <Input
                    id="report-name"
                    value={report.name}
                    onChange={(e) => updateReport({ name: e.target.value })}
                    placeholder="Enter report name"
                  />
                </div>
                <div>
                  <Label htmlFor="data-source">Data Source</Label>
                  <Select value={report.dataSource} onValueChange={(dataSource) => {
                    updateReport({ dataSource, fields: [], filters: [], grouping: [], sorting: [] });
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select data source" />
                    </SelectTrigger>
                    <SelectContent>
                      {dataSourceOptions.map((source) => (
                        <SelectItem key={source.value} value={source.value}>
                          {source.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={report.description}
                  onChange={(e) => updateReport({ description: e.target.value })}
                  placeholder="Describe what this report shows"
                />
              </div>
            </CardContent>
          </Card>

          {/* Fields Selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Fields & Metrics</CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!report.dataSource}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Field
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="font-medium">Available Fields</h4>
                      <ScrollArea className="h-48">
                        {availableFields.map((field) => (
                          <Button
                            key={field.field}
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={() => addField(field)}
                          >
                            {field.label}
                          </Button>
                        ))}
                      </ScrollArea>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              {report.fields.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No fields selected. Add fields to display in your report.
                </div>
              ) : (
                <div className="space-y-3">
                  {report.fields.map((field) => (
                    <div key={field.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Switch
                        checked={field.visible}
                        onCheckedChange={(visible) => updateField(field.id, { visible })}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{field.label}</div>
                        <div className="text-sm text-muted-foreground">{field.field}</div>
                      </div>
                      {field.aggregation && (
                        <Select
                          value={field.aggregation}
                          onValueChange={(aggregation) => updateField(field.id, { aggregation: aggregation as any })}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="count">Count</SelectItem>
                            <SelectItem value="sum">Sum</SelectItem>
                            <SelectItem value="avg">Average</SelectItem>
                            <SelectItem value="min">Min</SelectItem>
                            <SelectItem value="max">Max</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Select
                        value={field.format || 'text'}
                        onValueChange={(format) => updateField(field.id, { format: format as any })}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="currency">Currency</SelectItem>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeField(field.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Visualization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Visualization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {visualizationOptions.map((viz) => (
                  <Button
                    key={viz.value}
                    variant={report.visualization.type === viz.value ? 'default' : 'outline'}
                    className="h-20 flex-col gap-2"
                    onClick={() => updateReport({
                      visualization: { ...report.visualization, type: viz.value as any }
                    })}
                  >
                    <viz.icon className="h-6 w-6" />
                    <div className="text-xs text-center">
                      <div className="font-medium">{viz.label}</div>
                      <div className="text-muted-foreground">{viz.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Preview</CardTitle>
                <Button
                  onClick={generatePreview}
                  disabled={!report.dataSource || report.fields.length === 0 || previewLoading}
                >
                  {previewLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {previewData.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Configure your report and click "Generate" to see a preview.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {previewData.length} rows
                  </div>
                  {report.visualization.type === 'table' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            {report.fields.filter(f => f.visible).map((field) => (
                              <th key={field.id} className="text-left p-2">
                                {field.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 5).map((row, index) => (
                            <tr key={index} className="border-b">
                              {report.fields.filter(f => f.visible).map((field) => (
                                <td key={field.id} className="p-2">
                                  {row[field.field] || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="h-48 bg-muted rounded-lg flex items-center justify-center">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <div className="text-sm text-muted-foreground">
                          {report.visualization.type.charAt(0).toUpperCase() + report.visualization.type.slice(1)} Chart Preview
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full" onClick={addFilter}>
                <Filter className="h-4 w-4 mr-2" />
                Add Filter
              </Button>
              <Button variant="outline" className="w-full" onClick={addGrouping}>
                <GroupIcon className="h-4 w-4 mr-2" />
                Add Grouping
              </Button>
              <Button variant="outline" className="w-full" onClick={addSorting}>
                <SortAsc className="h-4 w-4 mr-2" />
                Add Sorting
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setScheduleDialogOpen(true)}>
                <Clock className="h-4 w-4 mr-2" />
                Schedule Report
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Report</DialogTitle>
            <DialogDescription>
              Save this report configuration for future use
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="save-name">Report Name</Label>
              <Input
                id="save-name"
                value={report.name}
                onChange={(e) => updateReport({ name: e.target.value })}
                placeholder="Enter report name"
              />
            </div>
            <div>
              <Label htmlFor="save-description">Description</Label>
              <Textarea
                id="save-description"
                value={report.description}
                onChange={(e) => updateReport({ description: e.target.value })}
                placeholder="Describe this report"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveReport}>
                Save Report
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Report</DialogTitle>
            <DialogDescription>
              Choose a format to export your report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => exportReport('pdf')}
              >
                <FileText className="h-6 w-6" />
                PDF
              </Button>
              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => exportReport('csv')}
              >
                <FileText className="h-6 w-6" />
                CSV
              </Button>
              <Button
                variant="outline"
                className="h-20 flex-col gap-2"
                onClick={() => exportReport('excel')}
              >
                <FileText className="h-6 w-6" />
                Excel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
