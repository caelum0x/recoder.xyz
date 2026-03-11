'use client';

import { useState, useMemo } from 'react';
import {
  Workflow,
  Plus,
  Play,
  Trash2,
  Pencil,
  Clock,
  Globe,
  Lock,
  ChevronRight,
  Search,
  Filter,
  X,
  Variable,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useWorkflowTemplates,
  useWorkflowTemplateDetail,
  useCreateWorkflowTemplate,
  useUpdateWorkflowTemplate,
  useDeleteWorkflowTemplate,
  useRunWorkflowTemplate,
  useWorkflowTemplateRuns,
} from '@/hooks/workflows/use-workflow-templates';
import type {
  WorkflowTemplate,
  WorkflowStep,
  WorkflowVariable,
  WorkflowTemplateRun,
} from '@/lib/api/workflow-templates';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'data_pipeline', label: 'Data Pipeline' },
  { value: 'content_generation', label: 'Content' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'integration', label: 'Integration' },
  { value: 'custom', label: 'Custom' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  data_pipeline: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  content_generation: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  monitoring: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  integration: 'bg-green-500/10 text-green-600 dark:text-green-400',
  custom: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
};

const RUN_STATUS_MAP: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  completed: { icon: CheckCircle2, className: 'text-green-500' },
  failed: { icon: XCircle, className: 'text-red-500' },
  running: { icon: Loader2, className: 'text-blue-500 animate-spin' },
  pending: { icon: Clock, className: 'text-muted-foreground' },
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function WorkflowTemplatesPage() {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null);

  const filters = useMemo(
    () => ({
      category: categoryFilter || undefined,
      search: searchQuery || undefined,
    }),
    [categoryFilter, searchQuery]
  );

  const { data: templates = [], isLoading } = useWorkflowTemplates(filters);

  return (
    <div className="min-h-[100dvh] flex items-start justify-center pt-8">
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Workflow className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold">
                  Workflow Templates
                </h1>
                <p className="text-sm text-muted-foreground">
                  Create and run reusable multi-step agent pipelines
                </p>
              </div>
            </div>
            <Button onClick={() => setShowNewDialog(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0 mr-1" />
              {CATEGORIES.map((cat) => (
                <Button
                  key={cat.value}
                  variant={categoryFilter === cat.value ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs whitespace-nowrap"
                  onClick={() => setCategoryFilter(cat.value)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Template list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <Workflow className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No workflow templates yet. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onSelect={() => setSelectedTemplateId(t.id)}
                  onRun={() => {
                    setSelectedTemplateId(t.id);
                    setShowRunDialog(true);
                  }}
                  onEdit={() => {
                    setEditingTemplate(t);
                    setShowNewDialog(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Create / Edit dialog */}
        <NewTemplateDialog
          open={showNewDialog}
          onOpenChange={(open) => {
            setShowNewDialog(open);
            if (!open) setEditingTemplate(null);
          }}
          editTemplate={editingTemplate}
        />

        {/* Detail + runs panel */}
        {selectedTemplateId && !showRunDialog && (
          <TemplateDetailPanel
            templateId={selectedTemplateId}
            onClose={() => setSelectedTemplateId(null)}
            onRun={() => setShowRunDialog(true)}
          />
        )}

        {/* Run dialog */}
        {selectedTemplateId && showRunDialog && (
          <RunTemplateDialog
            templateId={selectedTemplateId}
            open={showRunDialog}
            onOpenChange={(open) => {
              setShowRunDialog(open);
              if (!open) setSelectedTemplateId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onSelect,
  onRun,
  onEdit,
}: {
  template: WorkflowTemplate;
  onSelect: () => void;
  onRun: () => void;
  onEdit: () => void;
}) {
  const deleteMutation = useDeleteWorkflowTemplate();

  return (
    <div
      className="group p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium truncate">{template.name}</h3>
            {template.is_public ? (
              <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
          </div>
          {template.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {template.description}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] px-1.5 py-0',
                CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general
              )}
            >
              {template.category.replace('_', ' ')}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {template.steps.length} step{template.steps.length !== 1 ? 's' : ''}
            </span>
            {template.use_count > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {template.use_count} run{template.use_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this template?')) {
                deleteMutation.mutate(template.id);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function TemplateDetailPanel({
  templateId,
  onClose,
  onRun,
}: {
  templateId: string;
  onClose: () => void;
  onRun: () => void;
}) {
  const { data: template } = useWorkflowTemplateDetail(templateId);
  const { data: runs = [] } = useWorkflowTemplateRuns(templateId);

  if (!template) return null;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            {template.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {template.description && (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          )}

          {/* Steps pipeline */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
              Steps
            </h4>
            <div className="space-y-1">
              {template.steps
                .sort((a, b) => a.order - b.order)
                .map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-muted/30"
                  >
                    <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground truncate">
                        Agent: {step.agent_id}
                      </p>
                      <p className="text-sm">{step.instruction}</p>
                    </div>
                    {idx < template.steps.length - 1 && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* Variables */}
          {template.variables && template.variables.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Variables
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {template.variables.map((v, i) => (
                  <Badge key={i} variant="outline" className="text-xs gap-1">
                    <Variable className="h-3 w-3" />
                    {v.name || (v as any).label || `var_${i}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Run history */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
              Recent Runs
            </h4>
            {runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No runs yet</p>
            ) : (
              <div className="space-y-1">
                {runs.slice(0, 10).map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onRun}>
            <Play className="h-3.5 w-3.5" />
            Run Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Run row
// ---------------------------------------------------------------------------

function RunRow({ run }: { run: WorkflowTemplateRun }) {
  const info = RUN_STATUS_MAP[run.status] || RUN_STATUS_MAP.pending;
  const Icon = info.icon;

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20 text-xs">
      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', info.className)} />
      <span className="capitalize">{run.status}</span>
      <span className="text-muted-foreground ml-auto">
        {new Date(run.created_at).toLocaleString()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New / Edit template dialog
// ---------------------------------------------------------------------------

function NewTemplateDialog({
  open,
  onOpenChange,
  editTemplate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTemplate: WorkflowTemplate | null;
}) {
  const createMutation = useCreateWorkflowTemplate();
  const updateMutation = useUpdateWorkflowTemplate();

  const [name, setName] = useState(editTemplate?.name || '');
  const [description, setDescription] = useState(editTemplate?.description || '');
  const [category, setCategory] = useState(editTemplate?.category || 'general');
  const [isPublic, setIsPublic] = useState(editTemplate?.is_public || false);
  const [steps, setSteps] = useState<WorkflowStep[]>(
    editTemplate?.steps || [{ agent_id: '', instruction: '', order: 0 }]
  );

  // Reset form when dialog opens with different template
  const templateId = editTemplate?.id;
  const [prevTemplateId, setPrevTemplateId] = useState(templateId);
  if (templateId !== prevTemplateId) {
    setPrevTemplateId(templateId);
    setName(editTemplate?.name || '');
    setDescription(editTemplate?.description || '');
    setCategory(editTemplate?.category || 'general');
    setIsPublic(editTemplate?.is_public || false);
    setSteps(editTemplate?.steps || [{ agent_id: '', instruction: '', order: 0 }]);
  }

  const addStep = () =>
    setSteps((prev) => [...prev, { agent_id: '', instruction: '', order: prev.length }]);

  const removeStep = (idx: number) =>
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));

  const updateStep = (idx: number, field: keyof WorkflowStep, value: string | number) =>
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (steps.some((s) => !s.agent_id.trim() || !s.instruction.trim())) return;

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      steps: steps.map((s, i) => ({ ...s, order: i })),
      is_public: isPublic,
    };

    if (editTemplate) {
      updateMutation.mutate(
        { templateId: editTemplate.id, data: payload },
        {
          onSuccess: () => {
            onOpenChange(false);
            resetForm();
          },
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      });
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setCategory('general');
    setIsPublic(false);
    setSteps([{ agent_id: '', instruction: '', order: 0 }]);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editTemplate ? 'Edit Template' : 'New Workflow Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Name</label>
            <Input
              placeholder="My workflow template"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Description</label>
            <Textarea
              placeholder="What does this workflow do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CATEGORIES.filter((c) => c.value).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Visibility</label>
              <Button
                variant={isPublic ? 'default' : 'outline'}
                size="sm"
                className="h-9 gap-1.5 w-full"
                onClick={() => setIsPublic(!isPublic)}
              >
                {isPublic ? (
                  <>
                    <Globe className="h-3.5 w-3.5" /> Public
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" /> Private
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Step builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Steps</label>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={addStep}>
                <Plus className="h-3 w-3" /> Add Step
              </Button>
            </div>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="relative p-3 rounded-lg border border-border bg-muted/20 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Step {idx + 1}
                    </span>
                    {steps.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => removeStep(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="Agent ID"
                    value={step.agent_id}
                    onChange={(e) => updateStep(idx, 'agent_id', e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Textarea
                    placeholder="Instruction for this step..."
                    value={step.instruction}
                    onChange={(e) => updateStep(idx, 'instruction', e.target.value)}
                    className="min-h-[40px] text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending || !name.trim() || steps.some((s) => !s.agent_id.trim())}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editTemplate ? (
              'Save Changes'
            ) : (
              'Create Template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Run template dialog
// ---------------------------------------------------------------------------

function RunTemplateDialog({
  templateId,
  open,
  onOpenChange,
}: {
  templateId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: template } = useWorkflowTemplateDetail(templateId);
  const runMutation = useRunWorkflowTemplate();
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  if (!template) return null;

  const variables = template.variables || [];

  const handleRun = () => {
    runMutation.mutate(
      { templateId, variableValues },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Run: {template.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Steps summary */}
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">Pipeline</h4>
            <div className="flex items-center gap-1 flex-wrap">
              {template.steps
                .sort((a, b) => a.order - b.order)
                .map((step, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {idx + 1}
                    </Badge>
                    {idx < template.steps.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* Variable inputs */}
          {variables.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                Variables
              </h4>
              {variables.map((v, i) => {
                const key = v.name || `var_${i}`;
                return (
                  <div key={i} className="space-y-1">
                    <label className="text-xs">{v.label || v.name || `Variable ${i + 1}`}</label>
                    <Input
                      placeholder={v.default_value || ''}
                      value={variableValues[key] || ''}
                      onChange={(e) =>
                        setVariableValues((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleRun}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
