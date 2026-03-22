'use client';

import React, { useState } from 'react';
import {
  FileDown,
  Plus,
  Trash2,
  Pencil,
  AlertCircle,
  FileText,
  Code2,
  FileSpreadsheet,
  Globe,
  FileCode,
  Star,
  Play,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useExportTemplates,
  useExportStats,
  useCreateExportTemplate,
  useUpdateExportTemplate,
  useDeleteExportTemplate,
  useExportThread,
} from '@/hooks/threads/use-thread-export-templates';
import type { ExportTemplate, ExportFormat, CreateExportTemplateData, UpdateExportTemplateData } from '@/lib/api/thread-export-templates';

// ---- Constants ----

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'markdown', label: 'Markdown', icon: FileText },
  { value: 'html', label: 'HTML', icon: Globe },
  { value: 'json', label: 'JSON', icon: Code2 },
  { value: 'csv', label: 'CSV', icon: FileSpreadsheet },
  { value: 'txt', label: 'Plain Text', icon: FileCode },
];

const FORMAT_COLORS: Record<ExportFormat, string> = {
  markdown: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  html: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  json: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  csv: 'bg-green-500/10 text-green-500 border-green-500/20',
  txt: 'bg-muted text-muted-foreground',
};

const SAMPLE_MESSAGES = `[{"role":"user","content":"How do I optimize my database queries?"},{"role":"assistant","content":"Here are the top strategies:\\n\\n1. Use indexes on frequently queried columns\\n2. Avoid SELECT *\\n3. Use EXPLAIN ANALYZE\\n4. Consider query caching"}]`;

// ---- Template Form State ----

interface TemplateFormState {
  template_name: string;
  format: ExportFormat;
  include_metadata: boolean;
  include_tool_calls: boolean;
  include_timestamps: boolean;
  header_template: string;
  footer_template: string;
  is_default: boolean;
}

const defaultFormState: TemplateFormState = {
  template_name: '',
  format: 'markdown',
  include_metadata: true,
  include_tool_calls: false,
  include_timestamps: true,
  header_template: '',
  footer_template: '',
  is_default: false,
};

function templateToFormState(t: ExportTemplate): TemplateFormState {
  return {
    template_name: t.template_name,
    format: t.format,
    include_metadata: t.include_metadata,
    include_tool_calls: t.include_tool_calls,
    include_timestamps: t.include_timestamps,
    header_template: t.header_template ?? '',
    footer_template: t.footer_template ?? '',
    is_default: t.is_default,
  };
}

// ---- Page ----

export default function ExportTemplatesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExportTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExportTemplate | null>(null);
  const [form, setForm] = useState<TemplateFormState>(defaultFormState);

  // Test export state
  const [sampleMessages, setSampleMessages] = useState(SAMPLE_MESSAGES);
  const [testTemplateId, setTestTemplateId] = useState<string>('__none__');
  const [testFormat, setTestFormat] = useState<ExportFormat>('markdown');
  const [exportResult, setExportResult] = useState<string | null>(null);

  const { data: templates, isLoading: templatesLoading, error } = useExportTemplates();
  const { data: stats, isLoading: statsLoading } = useExportStats();

  const createMutation = useCreateExportTemplate();
  const updateMutation = useUpdateExportTemplate();
  const deleteMutation = useDeleteExportTemplate();
  const exportMutation = useExportThread();

  const isLoading = templatesLoading || statsLoading;

  const openCreate = () => {
    setForm(defaultFormState);
    setIsCreateOpen(true);
  };

  const openEdit = (template: ExportTemplate) => {
    setForm(templateToFormState(template));
    setEditTarget(template);
  };

  const handleSubmitCreate = async () => {
    if (!form.template_name.trim()) {
      toast.error('Template name is required');
      return;
    }
    try {
      const data: CreateExportTemplateData = {
        template_name: form.template_name.trim(),
        format: form.format,
        include_metadata: form.include_metadata,
        include_tool_calls: form.include_tool_calls,
        include_timestamps: form.include_timestamps,
        header_template: form.header_template.trim() || undefined,
        footer_template: form.footer_template.trim() || undefined,
        is_default: form.is_default,
      };
      await createMutation.mutateAsync(data);
      toast.success('Template created');
      setIsCreateOpen(false);
    } catch {
      toast.error('Failed to create template');
    }
  };

  const handleSubmitEdit = async () => {
    if (!editTarget) return;
    if (!form.template_name.trim()) {
      toast.error('Template name is required');
      return;
    }
    try {
      const data: UpdateExportTemplateData = {
        template_name: form.template_name.trim(),
        format: form.format,
        include_metadata: form.include_metadata,
        include_tool_calls: form.include_tool_calls,
        include_timestamps: form.include_timestamps,
        header_template: form.header_template.trim() || undefined,
        footer_template: form.footer_template.trim() || undefined,
        is_default: form.is_default,
      };
      await updateMutation.mutateAsync({ id: editTarget.id, data });
      toast.success('Template updated');
      setEditTarget(null);
    } catch {
      toast.error('Failed to update template');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Template deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const handleTestExport = async () => {
    let messages: Array<{ role: string; content: string }> = [];
    try {
      messages = JSON.parse(sampleMessages);
    } catch {
      toast.error('Invalid JSON in sample messages');
      return;
    }

    try {
      const result = await exportMutation.mutateAsync({
        threadId: 'demo',
        template_id: testTemplateId !== '__none__' ? testTemplateId : undefined,
        format: testTemplateId === '__none__' ? testFormat : undefined,
        messages,
      });
      setExportResult(result.rendered);
      toast.success(`Exported as ${result.format} (${result.message_count} messages)`);
    } catch {
      toast.error('Export failed');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 border border-destructive/20">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load templates</h4>
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Thread Export Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create reusable templates for exporting thread conversations.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Template
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Total Exports</span>
                <FileDown className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-2xl font-semibold text-foreground">{stats.total_exports}</span>
            </div>
          </SpotlightCard>
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Formats Used</span>
                <Code2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(stats.by_format).length === 0 ? (
                  <span className="text-xs text-muted-foreground">None yet</span>
                ) : (
                  Object.entries(stats.by_format).map(([fmt, count]) => (
                    <Badge
                      key={fmt}
                      variant="secondary"
                      className={cn('text-[10px] px-1.5 py-0', FORMAT_COLORS[fmt as ExportFormat])}
                    >
                      {fmt}: {count}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Template List */}
      {!templates || templates.length === 0 ? (
        <div className="text-center py-12 px-6 border border-dashed border-border rounded-xl">
          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
            <FileDown className="h-6 w-6 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">No templates yet</h4>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
            Create a template to define consistent formatting for exported thread conversations.
          </p>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Template
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const fmtOption = FORMAT_OPTIONS.find((f) => f.value === template.format);
            const FmtIcon = fmtOption?.icon ?? FileText;
            return (
              <SpotlightCard key={template.id} className="bg-card border border-border">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-medium text-foreground truncate">
                          {template.template_name}
                        </h4>
                        {template.is_default && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20 flex-shrink-0">
                            <Star className="h-2.5 w-2.5 mr-0.5" />
                            Default
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className={cn('text-[10px] px-1.5 py-0 flex-shrink-0 flex items-center gap-0.5', FORMAT_COLORS[template.format])}
                        >
                          <FmtIcon className="h-2.5 w-2.5" />
                          {template.format}
                        </Badge>
                      </div>

                      {/* Include options (display only) */}
                      <div className="flex flex-wrap gap-3 mb-2">
                        <IncludeFlag label="Metadata" checked={template.include_metadata} />
                        <IncludeFlag label="Tool calls" checked={template.include_tool_calls} />
                        <IncludeFlag label="Timestamps" checked={template.include_timestamps} />
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatDistanceToNow(new Date(template.created_at), { addSuffix: true })}</span>
                        {template.use_count > 0 && (
                          <span>Used {template.use_count}×</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(template)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(template)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}

      {/* Test Export Section */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4" />
            Test Export
          </CardTitle>
          <CardDescription>
            Preview how your template renders sample messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sample messages (JSON array)</Label>
            <Textarea
              value={sampleMessages}
              onChange={(e) => setSampleMessages(e.target.value)}
              rows={4}
              className="font-mono text-xs"
              placeholder='[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi there!"}]'
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={testTemplateId} onValueChange={setTestTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="No template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No template</SelectItem>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.template_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {testTemplateId === '__none__' && (
              <div className="space-y-1.5">
                <Label>Format</Label>
                <Select value={testFormat} onValueChange={(v) => setTestFormat(v as ExportFormat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Button
            size="sm"
            onClick={handleTestExport}
            disabled={exportMutation.isPending}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            {exportMutation.isPending ? 'Exporting...' : 'Export'}
          </Button>

          {exportResult !== null && (
            <div className="space-y-1.5">
              <Label>Result</Label>
              <pre className="bg-muted/40 border border-border rounded-lg p-3 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-64">
                {exportResult}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <TemplateFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create Export Template"
        form={form}
        setForm={setForm}
        onSubmit={handleSubmitCreate}
        isPending={createMutation.isPending}
        submitLabel="Create Template"
      />

      {/* Edit Dialog */}
      <TemplateFormDialog
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        title="Edit Export Template"
        form={form}
        setForm={setForm}
        onSubmit={handleSubmitEdit}
        isPending={updateMutation.isPending}
        submitLabel="Save Changes"
      />

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium text-foreground">{deleteTarget?.template_name}</span>. Past exports using this template will remain in history but will be unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Sub Components ----

function IncludeFlag({ label, checked }: { label: string; checked: boolean }) {
  const Icon = checked ? CheckSquare : Square;
  return (
    <span className={cn('flex items-center gap-1 text-xs', checked ? 'text-foreground' : 'text-muted-foreground')}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function TemplateFormDialog({
  open,
  onOpenChange,
  title,
  form,
  setForm,
  onSubmit,
  isPending,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: TemplateFormState;
  setForm: React.Dispatch<React.SetStateAction<TemplateFormState>>;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="tmpl-name">Template name *</Label>
            <Input
              id="tmpl-name"
              placeholder="e.g. Clean Markdown Export"
              value={form.template_name}
              onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Format</Label>
            <Select
              value={form.format}
              onValueChange={(v) => setForm((f) => ({ ...f, format: v as ExportFormat }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Include options</Label>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="inc-meta" className="text-sm font-normal text-muted-foreground cursor-pointer">
                  Include metadata
                </Label>
                <Switch
                  id="inc-meta"
                  checked={form.include_metadata}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, include_metadata: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="inc-tools" className="text-sm font-normal text-muted-foreground cursor-pointer">
                  Include tool calls
                </Label>
                <Switch
                  id="inc-tools"
                  checked={form.include_tool_calls}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, include_tool_calls: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="inc-ts" className="text-sm font-normal text-muted-foreground cursor-pointer">
                  Include timestamps
                </Label>
                <Switch
                  id="inc-ts"
                  checked={form.include_timestamps}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, include_timestamps: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is-default" className="text-sm font-normal text-muted-foreground cursor-pointer">
                  Set as default template
                </Label>
                <Switch
                  id="is-default"
                  checked={form.is_default}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hdr-tmpl">Header template</Label>
            <Textarea
              id="hdr-tmpl"
              placeholder="Optional header text added at the start of the export..."
              value={form.header_template}
              onChange={(e) => setForm((f) => ({ ...f, header_template: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ftr-tmpl">Footer template</Label>
            <Textarea
              id="ftr-tmpl"
              placeholder="Optional footer text added at the end of the export..."
              value={form.footer_template}
              onChange={(e) => setForm((f) => ({ ...f, footer_template: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || !form.template_name.trim()}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            {isPending ? 'Saving...' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
