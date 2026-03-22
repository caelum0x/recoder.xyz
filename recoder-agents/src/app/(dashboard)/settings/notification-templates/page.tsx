'use client';

import React, { useState, useMemo } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Edit,
  Eye,
  Mail,
  Smartphone,
  Globe,
  Webhook,
  BarChart2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
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
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useTemplates,
  useTemplateStats,
  useNotificationSends,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useRenderTemplate,
} from '@/hooks/monitoring/use-notification-templates';
import type {
  NotificationTemplate,
  NotificationSend,
  CreateTemplateData,
} from '@/lib/api/notification-templates';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Constants
// ============================================================================

const CHANNELS = [
  { value: 'in_app', label: 'In-App', icon: Smartphone, color: 'bg-blue-500' },
  { value: 'email', label: 'Email', icon: Mail, color: 'bg-green-500' },
  { value: 'push', label: 'Push', icon: Bell, color: 'bg-purple-500' },
  { value: 'webhook', label: 'Webhook', icon: Webhook, color: 'bg-orange-500' },
] as const;

function getChannelConfig(channel: string) {
  return CHANNELS.find((c) => c.value === channel) ?? CHANNELS[0];
}

function ChannelBadge({ channel }: { channel: string }) {
  const cfg = getChannelConfig(channel);
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn('w-2 h-2 rounded-full', cfg.color)} />
      {cfg.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'sent') {
    return (
      <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-600">
        <CheckCircle2 className="h-3 w-3" />
        Sent
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  );
}

function formatDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'MMM d, HH:mm');
  } catch {
    return dateStr;
  }
}

// Extract {{variable}} names from a template string
function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  const vars = new Set<string>();
  for (const m of matches) vars.add(m[1]);
  return Array.from(vars);
}

// ============================================================================
// Stats Row
// ============================================================================

function StatsRow() {
  const { data: stats, isLoading } = useTemplateStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  const channelEntries = Object.entries(stats?.by_channel ?? {});

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-5 pb-4">
          <p className="text-2xl font-bold">{stats?.total_templates ?? 0}</p>
          <p className="text-xs text-muted-foreground">Total Templates</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-1 mb-1">
            {CHANNELS.map((ch) => {
              const count = stats?.by_channel?.[ch.value] ?? 0;
              return (
                <Badge key={ch.value} variant="outline" className="text-[10px] gap-1">
                  <span className={cn('w-1.5 h-1.5 rounded-full', ch.color)} />
                  {ch.label}: {count}
                </Badge>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">By Channel</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-4">
          <p className="text-2xl font-bold">{Object.keys(stats?.by_event_type ?? {}).length}</p>
          <p className="text-xs text-muted-foreground">Event Types</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-4">
          <p className="text-2xl font-bold">{stats?.total_sends ?? 0}</p>
          <p className="text-xs text-muted-foreground">Total Sends</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Create Template Dialog
// ============================================================================

function CreateTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateTemplate();
  const [form, setForm] = useState<{
    template_name: string;
    event_type: string;
    channel: CreateTemplateData['channel'];
    subject_template: string;
    body_template: string;
    is_default: boolean;
  }>({
    template_name: '',
    event_type: '',
    channel: 'in_app',
    subject_template: '',
    body_template: '',
    is_default: false,
  });

  const handleSubmit = () => {
    if (!form.template_name.trim() || !form.event_type.trim() || !form.body_template.trim()) return;
    const data: CreateTemplateData = {
      template_name: form.template_name.trim(),
      event_type: form.event_type.trim(),
      channel: form.channel,
      body_template: form.body_template.trim(),
      is_default: form.is_default,
    };
    if (form.subject_template.trim()) {
      data.subject_template = form.subject_template.trim();
    }
    create.mutate(data, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({
          template_name: '',
          event_type: '',
          channel: 'in_app',
          subject_template: '',
          body_template: '',
          is_default: false,
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Template</DialogTitle>
          <DialogDescription>
            Design a reusable notification template with variable placeholders.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Template Name</label>
            <Input
              value={form.template_name}
              onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))}
              placeholder="e.g., Agent Run Failed Alert"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Event Type</label>
            <Input
              value={form.event_type}
              onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
              placeholder="e.g., agent.run_failed"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Channel</label>
            <Select
              value={form.channel}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, channel: v as CreateTemplateData['channel'] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((ch) => (
                  <SelectItem key={ch.value} value={ch.value}>
                    {ch.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Subject Template</label>
            <Input
              value={form.subject_template}
              onChange={(e) => setForm((f) => ({ ...f, subject_template: e.target.value }))}
              placeholder="e.g., Agent {{agent_name}} failed"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Body Template</label>
            <Textarea
              value={form.body_template}
              onChange={(e) => setForm((f) => ({ ...f, body_template: e.target.value }))}
              placeholder="e.g., The agent {{agent_name}} failed at {{timestamp}} with error: {{error_message}}"
              rows={5}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use <code className="bg-muted px-1 rounded">{'{{variable_name}}'}</code> for dynamic values.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_default}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
              id="is_default"
            />
            <label htmlFor="is_default" className="text-sm font-medium cursor-pointer">
              Set as default for this event type
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !form.template_name.trim() ||
              !form.event_type.trim() ||
              !form.body_template.trim() ||
              create.isPending
            }
          >
            {create.isPending ? 'Creating...' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Edit Template Dialog
// ============================================================================

function EditTemplateDialog({
  template,
  open,
  onOpenChange,
}: {
  template: NotificationTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateTemplate();
  const [form, setForm] = useState({
    template_name: template.template_name,
    event_type: template.event_type,
    channel: template.channel,
    subject_template: template.subject_template ?? '',
    body_template: template.body_template,
    is_active: template.is_active,
    is_default: template.is_default,
  });

  const handleSubmit = () => {
    update.mutate(
      { id: template.id, data: { ...form, subject_template: form.subject_template || undefined } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
          <DialogDescription>Update the notification template fields.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Template Name</label>
            <Input
              value={form.template_name}
              onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Event Type</label>
            <Input
              value={form.event_type}
              onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Channel</label>
            <Select
              value={form.channel}
              onValueChange={(v) => setForm((f) => ({ ...f, channel: v as typeof form.channel }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((ch) => (
                  <SelectItem key={ch.value} value={ch.value}>
                    {ch.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Subject Template</label>
            <Input
              value={form.subject_template}
              onChange={(e) => setForm((f) => ({ ...f, subject_template: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Body Template</label>
            <Textarea
              value={form.body_template}
              onChange={(e) => setForm((f) => ({ ...f, body_template: e.target.value }))}
              rows={5}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <span className="text-sm font-medium">Active</span>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_default}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
            />
            <span className="text-sm font-medium">Default for event type</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Render Preview Sheet
// ============================================================================

function RenderPreviewSheet({
  template,
  open,
  onOpenChange,
}: {
  template: NotificationTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const render = useRenderTemplate();
  const allText = [template.subject_template ?? '', template.body_template].join('\n');
  const detectedVars = extractVariables(allText);

  const [variableValues, setVariableValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(detectedVars.map((v) => [v, ''])),
  );
  const [result, setResult] = useState<{ rendered_subject: string | null; rendered_body: string } | null>(null);

  const handleRender = () => {
    render.mutate(
      { id: template.id, variables: variableValues },
      {
        onSuccess: (data) => {
          setResult({ rendered_subject: data.rendered_subject, rendered_body: data.rendered_body });
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Preview: {template.template_name}</SheetTitle>
          <SheetDescription>
            Fill in variable values and render the template.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Raw template */}
          <div>
            <h3 className="text-sm font-medium mb-2">Body Template</h3>
            <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap font-mono leading-relaxed">
              {template.body_template}
            </pre>
          </div>

          {/* Variable inputs */}
          {detectedVars.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Variables</h3>
              <div className="space-y-2">
                {detectedVars.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-32 shrink-0">
                      {`{{${v}}}`}
                    </span>
                    <Input
                      value={variableValues[v] ?? ''}
                      onChange={(e) =>
                        setVariableValues((prev) => ({ ...prev, [v]: e.target.value }))
                      }
                      placeholder={`Value for ${v}`}
                      className="flex-1 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleRender} disabled={render.isPending} className="w-full">
            {render.isPending ? 'Rendering...' : 'Render Template'}
          </Button>

          {/* Rendered output */}
          {result && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Rendered Output</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.rendered_subject && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
                    <p className="text-sm bg-muted/50 p-2 rounded">{result.rendered_subject}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Body</p>
                  <p className="text-sm bg-muted/50 p-3 rounded whitespace-pre-wrap">
                    {result.rendered_body}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Template Card
// ============================================================================

function TemplateCard({ template }: { template: NotificationTemplate }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const deleteTemplate = useDeleteTemplate();
  const updateTemplate = useUpdateTemplate();

  const handleDelete = () => {
    if (confirm(`Delete template "${template.template_name}"?`)) {
      deleteTemplate.mutate(template.id);
    }
  };

  const handleToggleActive = () => {
    updateTemplate.mutate({ id: template.id, data: { is_active: !template.is_active } });
  };

  return (
    <>
      <Card className={cn('transition-opacity', !template.is_active && 'opacity-60')}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm font-medium truncate">{template.template_name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{template.event_type}</CardDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <ChannelBadge channel={template.channel} />
              {template.is_default && (
                <Badge variant="secondary" className="text-[10px]">Default</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-xs text-muted-foreground line-clamp-2 font-mono bg-muted/50 p-2 rounded">
            {template.body_template}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{template.use_count} uses</span>
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={template.is_active}
                  onCheckedChange={handleToggleActive}
                  className="scale-75"
                />
                <span>{template.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPreview(true)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowEdit(true)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleDelete}
                disabled={deleteTemplate.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showEdit && (
        <EditTemplateDialog
          template={template}
          open={showEdit}
          onOpenChange={setShowEdit}
        />
      )}
      {showPreview && (
        <RenderPreviewSheet
          template={template}
          open={showPreview}
          onOpenChange={setShowPreview}
        />
      )}
    </>
  );
}

// ============================================================================
// Templates Tab
// ============================================================================

function TemplatesTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const { data: templates, isLoading } = useTemplates();

  const filtered = useMemo(() => {
    if (!templates) return [];
    if (filterChannel === 'all') return templates;
    return templates.filter((t) => t.channel === filterChannel);
  }, [templates, filterChannel]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={filterChannel} onValueChange={setFilterChannel}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            {CHANNELS.map((ch) => (
              <SelectItem key={ch.value} value={ch.value}>
                {ch.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Create Template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">No templates yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create reusable notification templates with variable placeholders.
            </p>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}

      <CreateTemplateDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}

// ============================================================================
// Send History Row (expandable body)
// ============================================================================

function SendHistoryRow({ send }: { send: NotificationSend }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpanded((v) => !v)}>
        <TableCell className="font-mono text-xs">{send.event_type}</TableCell>
        <TableCell>
          <ChannelBadge channel={send.channel} />
        </TableCell>
        <TableCell className="text-sm max-w-xs truncate">
          {send.rendered_subject ?? <span className="text-muted-foreground italic">—</span>}
        </TableCell>
        <TableCell>
          <StatusBadge status={send.status} />
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(send.sent_at)}
        </TableCell>
        <TableCell>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Rendered Body</p>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-background border rounded p-3">
              {send.rendered_body}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ============================================================================
// Send History Tab
// ============================================================================

function SendHistoryTab() {
  const [filterEvent, setFilterEvent] = useState('');
  const { data: sends, isLoading } = useNotificationSends(
    filterEvent ? { event_type: filterEvent } : undefined,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value)}
          placeholder="Filter by event type..."
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : !sends || sends.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <BarChart2 className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No send history yet</p>
            <p className="text-sm text-muted-foreground">
              Renders will appear here after you preview a template.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event Type</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent At</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sends.map((s) => (
                <SendHistoryRow key={s.id} send={s} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function NotificationTemplatesPage() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" />
          Notification Templates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create and manage reusable notification templates with variable substitution.
        </p>
      </div>

      <Separator />

      {/* Stats */}
      <StatsRow />

      {/* Tabs */}
      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">Send History</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <SendHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
