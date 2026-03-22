'use client';

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Play,
  History,
  Trash2,
  Edit,
  ChevronRight,
  AlertCircle,
  X,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  useResponseTemplates,
  useResponseTemplateStats,
  useCreateResponseTemplate,
  useUpdateResponseTemplate,
  useDeleteResponseTemplate,
  useRenderResponseTemplate,
  useTemplateRenders,
} from '@/hooks/agents/use-response-templates';
import type { ResponseTemplate } from '@/lib/api/response-templates';

const OUTPUT_FORMATS = ['text', 'markdown', 'json', 'html', 'structured'] as const;
type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const FORMAT_COLORS: Record<string, string> = {
  text: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  markdown: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  json: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  html: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  structured: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

// ─── Stats Row ───────────────────────────────────────────────────────────────

function StatsRow() {
  const { data: stats, isLoading } = useResponseTemplateStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const topTemplate = stats.top_templates[0];
  const formatEntries = Object.entries(stats.by_format);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <SpotlightCard className="p-4">
        <p className="text-xs text-muted-foreground">Total Templates</p>
        <p className="text-2xl font-bold mt-1">{stats.total}</p>
      </SpotlightCard>

      <SpotlightCard className="p-4">
        <p className="text-xs text-muted-foreground">Categories</p>
        <p className="text-2xl font-bold mt-1">{Object.keys(stats.by_category).length}</p>
      </SpotlightCard>

      <SpotlightCard className="p-4">
        <p className="text-xs text-muted-foreground">Formats Used</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {formatEntries.slice(0, 3).map(([fmt, cnt]) => (
            <span key={fmt} className={cn('text-[10px] px-1.5 py-0.5 rounded', FORMAT_COLORS[fmt])}>
              {fmt} ({cnt})
            </span>
          ))}
        </div>
      </SpotlightCard>

      <SpotlightCard className="p-4">
        <p className="text-xs text-muted-foreground">Most Used</p>
        {topTemplate ? (
          <p className="text-sm font-medium mt-1 truncate">{topTemplate.template_name}</p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">—</p>
        )}
        {topTemplate && (
          <p className="text-xs text-muted-foreground">{topTemplate.use_count} renders</p>
        )}
      </SpotlightCard>
    </div>
  );
}

// ─── Create/Edit Dialog ───────────────────────────────────────────────────────

interface TemplateDialogProps {
  open: boolean;
  onClose: () => void;
  existing?: ResponseTemplate | null;
}

function TemplateDialog({ open, onClose, existing }: TemplateDialogProps) {
  const [name, setName] = useState(existing?.template_name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'general');
  const [body, setBody] = useState(existing?.template_body ?? '');
  const [format, setFormat] = useState<string>(existing?.output_format ?? 'text');

  const createMutation = useCreateResponseTemplate();
  const updateMutation = useUpdateResponseTemplate();

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      toast.error('Name and template body are required');
      return;
    }
    try {
      if (existing) {
        await updateMutation.mutateAsync({
          id: existing.id,
          data: { template_name: name, description, category, template_body: body, output_format: format },
        });
        toast.success('Template updated');
      } else {
        await createMutation.mutateAsync({
          template_name: name,
          description,
          category,
          template_body: body,
          output_format: format,
        });
        toast.success('Template created');
      }
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      setName(existing?.template_name ?? '');
      setDescription(existing?.description ?? '');
      setCategory(existing?.category ?? 'general');
      setBody(existing?.template_body ?? '');
      setFormat(existing?.output_format ?? 'text');
    }
  }, [open, existing]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Support Reply Template"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="general"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Output Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Template Body *</Label>
            <p className="text-xs text-muted-foreground mb-1">
              Use <code className="bg-muted px-1 rounded">{'{{variable}}'}</code> for dynamic
              values
            </p>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hello {{name}}, thank you for reaching out..."
              className="mt-1 font-mono text-sm min-h-[160px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isBusy}>
            {isBusy ? 'Saving…' : existing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  template: ResponseTemplate;
  onEdit: () => void;
  onDelete: () => void;
}

function DetailPanel({ template, onEdit, onDelete }: DetailPanelProps) {
  const vars = useMemo(() => extractVariables(template.template_body), [template.template_body]);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [renderedOutput, setRenderedOutput] = useState<string>('');
  const [renderHistoryOpen, setRenderHistoryOpen] = useState(false);

  const renderMutation = useRenderResponseTemplate();
  const { data: renders, isLoading: rendersLoading } = useTemplateRenders(
    renderHistoryOpen ? template.id : '',
  );
  const deleteMutation = useDeleteResponseTemplate();

  const handleRender = async () => {
    try {
      const result = await renderMutation.mutateAsync({
        id: template.id,
        data: { variables: varValues },
      });
      setRenderedOutput(result.rendered_output);
      toast.success('Template rendered');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Render failed');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete template "${template.template_name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(template.id);
      toast.success('Template deleted');
      onDelete();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate">{template.template_name}</h2>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{template.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {template.category}
            </Badge>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', FORMAT_COLORS[template.output_format])}>
              {template.output_format}
            </span>
            <span className="text-xs text-muted-foreground">{template.use_count} renders</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleteMutation.isPending}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Template body */}
      <SpotlightCard className="p-3">
        <p className="text-xs text-muted-foreground mb-1 font-medium">Template Body</p>
        <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80">
          {template.template_body}
        </pre>
      </SpotlightCard>

      {/* Variable inputs */}
      {vars.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Variables ({vars.length})
          </p>
          <div className="space-y-2">
            {vars.map((v) => (
              <div key={v} className="flex items-center gap-2">
                <Label className="text-xs w-28 truncate flex-shrink-0">
                  <code className="bg-muted px-1 rounded">{`{{${v}}}`}</code>
                </Label>
                <Input
                  size={1}
                  value={varValues[v] ?? ''}
                  onChange={(e) =>
                    setVarValues((prev) => ({ ...prev, [v]: e.target.value }))
                  }
                  placeholder={`Value for ${v}`}
                  className="h-7 text-xs flex-1"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Render button */}
      <Button
        size="sm"
        onClick={handleRender}
        disabled={renderMutation.isPending}
        className="gap-2 self-start"
      >
        <Play className="h-3.5 w-3.5" />
        {renderMutation.isPending ? 'Rendering…' : 'Render'}
      </Button>

      {/* Rendered output */}
      {renderedOutput && (
        <SpotlightCard className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Check className="h-3.5 w-3.5 text-green-500" />
            <p className="text-xs font-medium">Rendered Output</p>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80">
            {renderedOutput}
          </pre>
        </SpotlightCard>
      )}

      {/* Render history */}
      <div>
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setRenderHistoryOpen(!renderHistoryOpen)}
        >
          <History className="h-3.5 w-3.5" />
          Render History
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', renderHistoryOpen && 'rotate-90')}
          />
        </button>

        {renderHistoryOpen && (
          <div className="mt-2">
            {rendersLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : renders && renders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-1.5 text-muted-foreground font-medium">Date</th>
                      <th className="pb-1.5 text-muted-foreground font-medium">Agent</th>
                      <th className="pb-1.5 text-muted-foreground font-medium">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renders.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="py-1.5 text-muted-foreground whitespace-nowrap">
                          {format(parseISO(r.rendered_at), 'MMM d, HH:mm')}
                        </td>
                        <td className="py-1.5 text-muted-foreground">
                          {r.agent_id ? r.agent_id.slice(0, 8) : '—'}
                        </td>
                        <td className="py-1.5 truncate max-w-[200px]">
                          {r.rendered_output.slice(0, 60)}
                          {r.rendered_output.length > 60 ? '…' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">No render history yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResponseTemplatesPage() {
  const [activeFormat, setActiveFormat] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<ResponseTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ResponseTemplate | null>(null);

  const params = activeFormat !== 'all' ? { output_format: activeFormat } : {};
  const { data: templates, isLoading } = useResponseTemplates(params);

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const handleEditTemplate = (t: ResponseTemplate) => {
    setEditingTemplate(t);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Response Templates</h1>
            <p className="text-sm text-muted-foreground">
              Reusable templates with dynamic variable substitution
            </p>
          </div>
        </div>
        <Button onClick={handleNewTemplate} className="gap-2">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Stats */}
          <StatsRow />

          {/* Format filter tabs */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {['all', ...OUTPUT_FORMATS].map((fmt) => (
              <button
                key={fmt}
                onClick={() => setActiveFormat(fmt)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full border transition-colors',
                  activeFormat === fmt
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50',
                )}
              >
                {fmt === 'all' ? 'All' : fmt}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Template list */}
            <div className="space-y-2">
              {isLoading ? (
                [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)
              ) : templates && templates.length > 0 ? (
                templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={cn(
                      'w-full text-left p-4 rounded-xl border transition-all',
                      selectedTemplate?.id === t.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/20',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.template_name}</p>
                        {t.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {t.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {t.category}
                          </Badge>
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded',
                              FORMAT_COLORS[t.output_format],
                            )}
                          >
                            {t.output_format}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {t.use_count} renders
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                  </button>
                ))
              ) : (
                <SpotlightCard className="p-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">No templates yet</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-1"
                    onClick={handleNewTemplate}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create one
                  </Button>
                </SpotlightCard>
              )}
            </div>

            {/* Detail panel */}
            {selectedTemplate ? (
              <SpotlightCard className="p-4 relative">
                <button
                  className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedTemplate(null)}
                >
                  <X className="h-4 w-4" />
                </button>
                <DetailPanel
                  template={selectedTemplate}
                  onEdit={() => handleEditTemplate(selectedTemplate)}
                  onDelete={() => setSelectedTemplate(null)}
                />
              </SpotlightCard>
            ) : (
              <SpotlightCard className="p-8 text-center flex flex-col items-center justify-center">
                <FileText className="h-10 w-10 text-muted-foreground opacity-30 mb-2" />
                <p className="text-sm text-muted-foreground">Select a template to preview</p>
              </SpotlightCard>
            )}
          </div>
        </div>
      </div>

      <TemplateDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        existing={editingTemplate}
      />
    </div>
  );
}
