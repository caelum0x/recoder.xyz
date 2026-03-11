'use client';

import React, { useState, useCallback } from 'react';
import {
  FileCode,
  Plus,
  Trash2,
  Pencil,
  Play,
  Clock,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
} from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import { handleApiError } from '@/lib/error-handler';
import { format } from 'date-fns';
import {
  useWebhookTemplates,
  useCreateWebhookTemplate,
  useUpdateWebhookTemplate,
  useDeleteWebhookTemplate,
  useRenderWebhookTemplate,
  useTemplateRenders,
} from '@/hooks/integrations/use-webhook-templates';
import type {
  WebhookPayloadTemplate,
  VariableDefinition,
} from '@/lib/api/webhook-templates';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGER_EVENTS = [
  { value: 'agent_started', label: 'Agent Started' },
  { value: 'agent_completed', label: 'Agent Completed' },
  { value: 'agent_error', label: 'Agent Error' },
  { value: 'thread_created', label: 'Thread Created' },
  { value: 'threshold_exceeded', label: 'Threshold Exceeded' },
  { value: 'scheduled_run', label: 'Scheduled Run' },
];

const TRIGGER_EVENT_COLORS: Record<string, string> = {
  agent_started: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  agent_completed: 'bg-green-500/10 text-green-400 border-green-500/20',
  agent_error: 'bg-red-500/10 text-red-400 border-red-500/20',
  thread_created: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  threshold_exceeded: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  scheduled_run: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

const DEFAULT_PAYLOAD = JSON.stringify(
  {
    event: '{{trigger_event}}',
    agent_id: '{{agent_id}}',
    timestamp: '{{timestamp}}',
    data: {},
  },
  null,
  2
);

// ─────────────────────────────────────────────────────────────────────────────
// Template Editor Dialog
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateEditorDialogProps {
  open: boolean;
  onClose: () => void;
  template?: WebhookPayloadTemplate | null;
}

function TemplateEditorDialog({
  open,
  onClose,
  template,
}: TemplateEditorDialogProps) {
  const [name, setName] = useState(template?.template_name ?? '');
  const [triggerEvent, setTriggerEvent] = useState(
    template?.trigger_event ?? 'agent_completed'
  );
  const [description, setDescription] = useState(template?.description ?? '');
  const [payloadJson, setPayloadJson] = useState(
    template
      ? JSON.stringify(template.payload_template, null, 2)
      : DEFAULT_PAYLOAD
  );
  const [headersJson, setHeadersJson] = useState(
    template?.headers_template
      ? JSON.stringify(template.headers_template, null, 2)
      : JSON.stringify({ 'Content-Type': 'application/json' }, null, 2)
  );
  const [varDefs, setVarDefs] = useState<VariableDefinition[]>(
    template?.variable_definitions ?? []
  );
  const [newVarName, setNewVarName] = useState('');
  const [newVarDesc, setNewVarDesc] = useState('');
  const [payloadError, setPayloadError] = useState('');
  const [headersError, setHeadersError] = useState('');

  const createMutation = useCreateWebhookTemplate();
  const updateMutation = useUpdateWebhookTemplate();

  const isEditing = !!template;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const validateJson = useCallback(
    (value: string, setter: (v: string) => void) => {
      try {
        JSON.parse(value);
        setter('');
      } catch {
        setter('Invalid JSON');
      }
    },
    []
  );

  const addVariable = () => {
    if (!newVarName.trim()) return;
    setVarDefs((prev) => [
      ...prev,
      { name: newVarName.trim(), description: newVarDesc.trim() || undefined },
    ]);
    setNewVarName('');
    setNewVarDesc('');
  };

  const removeVariable = (index: number) => {
    setVarDefs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }
    let payload: Record<string, unknown>;
    let headers: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      toast.error('Payload template contains invalid JSON');
      return;
    }
    try {
      headers = JSON.parse(headersJson);
    } catch {
      toast.error('Headers template contains invalid JSON');
      return;
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          templateId: template.id,
          data: {
            template_name: name,
            description: description || undefined,
            trigger_event: triggerEvent,
            payload_template: payload,
            headers_template: headers,
            variable_definitions: varDefs,
          },
        });
        toast.success('Template updated');
      } else {
        await createMutation.mutateAsync({
          template_name: name,
          description: description || undefined,
          trigger_event: triggerEvent,
          payload_template: payload,
          headers_template: headers,
          variable_definitions: varDefs,
        });
        toast.success('Template created');
      }
      onClose();
    } catch (err) {
      handleApiError(err, isEditing ? 'updating template' : 'creating template');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEditing ? 'Edit Template' : 'New Webhook Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Template Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Webhook Template"
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>

          {/* Trigger Event */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Trigger Event *</Label>
            <Select value={triggerEvent} onValueChange={setTriggerEvent}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {TRIGGER_EVENTS.map((ev) => (
                  <SelectItem key={ev.value} value={ev.value} className="text-white">
                    {ev.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template is used for..."
              className="bg-zinc-900 border-zinc-700 text-white resize-none"
              rows={2}
            />
          </div>

          {/* Payload Template */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">
              Payload Template{' '}
              <span className="text-zinc-500 text-xs">
                (use {'{{variable_name}}'} for substitution)
              </span>
            </Label>
            <Textarea
              value={payloadJson}
              onChange={(e) => {
                setPayloadJson(e.target.value);
                validateJson(e.target.value, setPayloadError);
              }}
              className="bg-zinc-900 border-zinc-700 text-white font-mono text-xs resize-none"
              rows={8}
              spellCheck={false}
            />
            {payloadError && (
              <p className="text-red-400 text-xs">{payloadError}</p>
            )}
          </div>

          {/* Headers Template */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Headers Template</Label>
            <Textarea
              value={headersJson}
              onChange={(e) => {
                setHeadersJson(e.target.value);
                validateJson(e.target.value, setHeadersError);
              }}
              className="bg-zinc-900 border-zinc-700 text-white font-mono text-xs resize-none"
              rows={4}
              spellCheck={false}
            />
            {headersError && (
              <p className="text-red-400 text-xs">{headersError}</p>
            )}
          </div>

          {/* Variable Definitions */}
          <div className="space-y-2">
            <Label className="text-zinc-300">Variable Definitions</Label>
            {varDefs.length > 0 && (
              <div className="space-y-1.5">
                {varDefs.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2"
                  >
                    <span className="text-orange-400 font-mono text-xs flex-1">
                      {'{{'}{v.name}{'}}'}
                    </span>
                    {v.description && (
                      <span className="text-zinc-400 text-xs flex-1">
                        {v.description}
                      </span>
                    )}
                    <button
                      onClick={() => removeVariable(i)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newVarName}
                onChange={(e) => setNewVarName(e.target.value)}
                placeholder="variable_name"
                className="bg-zinc-900 border-zinc-700 text-white font-mono text-xs"
                onKeyDown={(e) => e.key === 'Enter' && addVariable()}
              />
              <Input
                value={newVarDesc}
                onChange={(e) => setNewVarDesc(e.target.value)}
                placeholder="Description (optional)"
                className="bg-zinc-900 border-zinc-700 text-white text-xs"
                onKeyDown={(e) => e.key === 'Enter' && addVariable()}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addVariable}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-zinc-700 text-zinc-300"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? 'Save Changes' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Render Panel
// ─────────────────────────────────────────────────────────────────────────────

interface RenderPanelProps {
  template: WebhookPayloadTemplate;
}

function RenderPanel({ template }: RenderPanelProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (template.variable_definitions ?? []).map((v) => [v.name, ''])
      )
  );
  const [renderedResult, setRenderedResult] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const renderMutation = useRenderWebhookTemplate();
  const rendersQuery = useTemplateRenders(showHistory ? template.id : null);

  const handleRender = async () => {
    const vars: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(variableValues)) {
      vars[k] = v;
    }
    try {
      const result = await renderMutation.mutateAsync({
        templateId: template.id,
        data: { variables: vars },
      });
      setRenderedResult(JSON.stringify(result.rendered_payload, null, 2));
      toast.success('Template rendered');
      if (showHistory) {
        // history will refresh via query invalidation
      }
    } catch (err) {
      handleApiError(err, 'rendering template');
    }
  };

  const varDefs = template.variable_definitions ?? [];

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-4 space-y-4">
      <h3 className="text-sm font-medium text-white flex items-center gap-2">
        <Play className="w-4 h-4 text-orange-400" />
        Render Preview
      </h3>

      {varDefs.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Provide values for template variables:
          </p>
          {varDefs.map((v) => (
            <div key={v.name} className="space-y-1">
              <Label className="text-zinc-400 text-xs font-mono">
                {'{{'}{v.name}{'}}'}
                {v.description && (
                  <span className="ml-2 text-zinc-600 font-sans">
                    — {v.description}
                  </span>
                )}
              </Label>
              <Input
                value={variableValues[v.name] ?? ''}
                onChange={(e) =>
                  setVariableValues((prev) => ({
                    ...prev,
                    [v.name]: e.target.value,
                  }))
                }
                placeholder={`Value for ${v.name}`}
                className="bg-zinc-900 border-zinc-700 text-white text-sm"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          This template has no declared variables. Click Render Preview to test
          it as-is.
        </p>
      )}

      <Button
        size="sm"
        onClick={handleRender}
        disabled={renderMutation.isPending}
        className="bg-orange-500 hover:bg-orange-600 text-white w-full"
      >
        {renderMutation.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
        ) : (
          <Play className="w-3.5 h-3.5 mr-2" />
        )}
        Render Preview
      </Button>

      {renderedResult && (
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-400 font-medium">Rendered Output:</p>
          <pre className="bg-zinc-900 border border-zinc-800 rounded-md p-3 text-xs text-green-300 font-mono overflow-x-auto whitespace-pre-wrap">
            {renderedResult}
          </pre>
        </div>
      )}

      {/* Render History */}
      <div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
        >
          <Clock className="w-3.5 h-3.5" />
          Render History
          {showHistory ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {showHistory && (
          <div className="mt-2 space-y-2">
            {rendersQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading renders...
              </div>
            ) : rendersQuery.data && rendersQuery.data.length > 0 ? (
              rendersQuery.data.map((render) => (
                <div
                  key={render.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-md p-2.5 space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-zinc-400">
                      {format(new Date(render.rendered_at), 'MMM d, HH:mm:ss')}
                    </span>
                  </div>
                  <pre className="text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap line-clamp-4">
                    {JSON.stringify(render.rendered_payload, null, 2)}
                  </pre>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-600">No renders yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Row
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateRowProps {
  template: WebhookPayloadTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

function TemplateRow({
  template,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
}: TemplateRowProps) {
  const eventLabel =
    TRIGGER_EVENTS.find((e) => e.value === template.trigger_event)?.label ??
    template.trigger_event;
  const eventColor =
    TRIGGER_EVENT_COLORS[template.trigger_event] ??
    'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';

  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
        isSelected
          ? 'border-orange-500/50 bg-orange-500/5'
          : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium text-sm truncate">
              {template.template_name}
            </span>
            <Badge
              variant="outline"
              className={`text-xs border ${eventColor} shrink-0`}
            >
              {eventLabel}
            </Badge>
            {!template.is_active && (
              <Badge
                variant="outline"
                className="text-xs border-zinc-700 text-zinc-500"
              >
                Inactive
              </Badge>
            )}
          </div>
          {template.description && (
            <p className="text-zinc-400 text-xs mt-1 truncate">
              {template.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-zinc-600 text-xs">
              Used {template.use_count} time{template.use_count !== 1 ? 's' : ''}
            </span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-zinc-600 text-xs">
              {format(new Date(template.created_at), 'MMM d, yyyy')}
            </span>
          </div>
        </div>
        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onToggle}
            className="p-1.5 rounded text-zinc-400 hover:text-white transition-colors"
            title={template.is_active ? 'Deactivate' : 'Activate'}
          >
            {template.is_active ? (
              <ToggleRight className="w-4 h-4 text-green-400" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-zinc-500" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded text-zinc-400 hover:text-white transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-zinc-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function WebhookTemplatesPage() {
  const [filterEvent, setFilterEvent] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<WebhookPayloadTemplate | null>(null);

  const templatesQuery = useWebhookTemplates(filterEvent || undefined);
  const deleteMutation = useDeleteWebhookTemplate();
  const updateMutation = useUpdateWebhookTemplate();

  const templates = templatesQuery.data ?? [];
  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const openEditDialog = (template: WebhookPayloadTemplate) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const closeDialog = () => {
    setEditorOpen(false);
    setEditingTemplate(null);
  };

  const handleDelete = async (template: WebhookPayloadTemplate) => {
    try {
      await deleteMutation.mutateAsync(template.id);
      if (selectedId === template.id) setSelectedId(null);
      toast.success('Template deleted');
    } catch (err) {
      handleApiError(err, 'deleting template');
    }
  };

  const handleToggle = async (template: WebhookPayloadTemplate) => {
    try {
      await updateMutation.mutateAsync({
        templateId: template.id,
        data: { is_active: !template.is_active },
      });
      toast.success(
        template.is_active ? 'Template deactivated' : 'Template activated'
      );
    } catch (err) {
      handleApiError(err, 'updating template');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <FileCode className="w-5 h-5 text-orange-400" />
            Webhook Templates
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Create reusable payload templates with variable substitution for
            your webhooks.
          </p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-zinc-500" />
        <Select
          value={filterEvent || 'all'}
          onValueChange={(v) => setFilterEvent(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-52 bg-zinc-900 border-zinc-700 text-white text-sm">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
            <SelectItem value="all" className="text-white">
              All Events
            </SelectItem>
            {TRIGGER_EVENTS.map((ev) => (
              <SelectItem key={ev.value} value={ev.value} className="text-white">
                {ev.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {templates.length > 0 && (
          <span className="text-zinc-500 text-xs">
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template List */}
        <div className="space-y-3">
          {templatesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center">
              <FileCode className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm font-medium">
                No templates yet
              </p>
              <p className="text-zinc-600 text-xs mt-1">
                Create a reusable payload template with variable substitution.
              </p>
              <Button
                size="sm"
                onClick={openCreateDialog}
                className="mt-4 bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="w-3.5 h-3.5 mr-2" />
                Create Template
              </Button>
            </div>
          ) : (
            templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                isSelected={selectedId === template.id}
                onSelect={() =>
                  setSelectedId(
                    selectedId === template.id ? null : template.id
                  )
                }
                onEdit={() => openEditDialog(template)}
                onDelete={() => handleDelete(template)}
                onToggle={() => handleToggle(template)}
              />
            ))
          )}
        </div>

        {/* Render Panel */}
        <div>
          {selectedTemplate ? (
            <RenderPanel template={selectedTemplate} />
          ) : (
            <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center">
              <Play className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">
                Select a template to render a preview
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Editor Dialog */}
      {editorOpen && (
        <TemplateEditorDialog
          open={editorOpen}
          onClose={closeDialog}
          template={editingTemplate}
        />
      )}
    </div>
  );
}
