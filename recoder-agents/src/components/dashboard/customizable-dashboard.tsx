'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useDashboardLayouts,
  useLayoutDetail,
  useCreateLayout,
  useUpdateLayout,
  useDeleteLayout,
  useSetLayoutWidgets,
  useLayoutTemplates,
} from '@/hooks/dashboard/use-dashboard-layouts';
import type { DashboardLayout, LayoutWidget, WidgetInput } from '@/lib/api/dashboard-layouts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LayoutDashboard,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Activity,
  MessageSquare,
  Rss,
  HeartPulse,
  Zap,
  Star,
  BarChart3,
  PieChart,
  CheckSquare,
  Bookmark,
  Layers,
  Copy,
} from 'lucide-react';
import { toast } from '@/lib/toast';

// ─── Widget Type Definitions ────────────────────────────────────────────────────

const WIDGET_TYPES = [
  { type: 'agent_status', label: 'Agent Status', icon: Activity, description: 'Active agent run statuses', defaultW: 4, defaultH: 2 },
  { type: 'recent_threads', label: 'Recent Threads', icon: MessageSquare, description: 'Latest conversation threads', defaultW: 4, defaultH: 2 },
  { type: 'activity_feed', label: 'Activity Feed', icon: Rss, description: 'Recent platform activity', defaultW: 4, defaultH: 3 },
  { type: 'health_status', label: 'Health Status', icon: HeartPulse, description: 'System health overview', defaultW: 3, defaultH: 1 },
  { type: 'quick_actions', label: 'Quick Actions', icon: Zap, description: 'Common shortcuts', defaultW: 3, defaultH: 1 },
  { type: 'favorites', label: 'Favorites', icon: Star, description: 'Pinned agents and threads', defaultW: 4, defaultH: 2 },
  { type: 'stats_card', label: 'Stats Card', icon: BarChart3, description: 'Key metric statistics', defaultW: 3, defaultH: 1 },
  { type: 'chart', label: 'Chart', icon: PieChart, description: 'Data visualization chart', defaultW: 6, defaultH: 2 },
  { type: 'checklist', label: 'Checklist', icon: CheckSquare, description: 'Task checklist', defaultW: 3, defaultH: 2 },
  { type: 'bookmarks', label: 'Bookmarks', icon: Bookmark, description: 'Saved bookmarks', defaultW: 3, defaultH: 2 },
] as const;

type WidgetType = (typeof WIDGET_TYPES)[number]['type'];

function getWidgetMeta(type: string) {
  return WIDGET_TYPES.find((w) => w.type === type) ?? WIDGET_TYPES[0];
}

// ─── Default Templates ──────────────────────────────────────────────────────────

const BUILTIN_TEMPLATES: { name: string; description: string; widgets: WidgetInput[] }[] = [
  {
    name: 'Default',
    description: 'Balanced layout with all key widgets',
    widgets: [
      { widget_type: 'stats_card', position_x: 0, position_y: 0, width: 3, height: 1 },
      { widget_type: 'health_status', position_x: 3, position_y: 0, width: 3, height: 1 },
      { widget_type: 'quick_actions', position_x: 6, position_y: 0, width: 3, height: 1 },
      { widget_type: 'agent_status', position_x: 0, position_y: 1, width: 4, height: 2 },
      { widget_type: 'recent_threads', position_x: 4, position_y: 1, width: 4, height: 2 },
      { widget_type: 'activity_feed', position_x: 8, position_y: 1, width: 4, height: 2 },
    ],
  },
  {
    name: 'Minimal',
    description: 'Clean layout with essential info only',
    widgets: [
      { widget_type: 'stats_card', position_x: 0, position_y: 0, width: 6, height: 1 },
      { widget_type: 'quick_actions', position_x: 6, position_y: 0, width: 6, height: 1 },
      { widget_type: 'recent_threads', position_x: 0, position_y: 1, width: 12, height: 2 },
    ],
  },
  {
    name: 'Developer',
    description: 'Focus on agent status and activity',
    widgets: [
      { widget_type: 'agent_status', position_x: 0, position_y: 0, width: 6, height: 2 },
      { widget_type: 'health_status', position_x: 6, position_y: 0, width: 6, height: 1 },
      { widget_type: 'stats_card', position_x: 6, position_y: 1, width: 6, height: 1 },
      { widget_type: 'activity_feed', position_x: 0, position_y: 2, width: 6, height: 3 },
      { widget_type: 'chart', position_x: 6, position_y: 2, width: 6, height: 3 },
    ],
  },
  {
    name: 'Manager',
    description: 'Overview-focused with charts and stats',
    widgets: [
      { widget_type: 'stats_card', position_x: 0, position_y: 0, width: 4, height: 1 },
      { widget_type: 'stats_card', position_x: 4, position_y: 0, width: 4, height: 1 },
      { widget_type: 'health_status', position_x: 8, position_y: 0, width: 4, height: 1 },
      { widget_type: 'chart', position_x: 0, position_y: 1, width: 6, height: 2 },
      { widget_type: 'chart', position_x: 6, position_y: 1, width: 6, height: 2 },
      { widget_type: 'favorites', position_x: 0, position_y: 3, width: 4, height: 2 },
      { widget_type: 'checklist', position_x: 4, position_y: 3, width: 4, height: 2 },
      { widget_type: 'bookmarks', position_x: 8, position_y: 3, width: 4, height: 2 },
    ],
  },
];

// ─── Widget Renderer (Placeholder) ──────────────────────────────────────────────

function WidgetPlaceholder({
  widget,
  editMode,
  onRemove,
}: {
  widget: LayoutWidget | WidgetInput & { id?: string };
  editMode: boolean;
  onRemove?: () => void;
}) {
  const meta = getWidgetMeta(widget.widget_type);
  const Icon = meta.icon;

  return (
    <Card className="h-full relative group overflow-hidden">
      {editMode && onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 z-10 p-1 rounded-md bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
          aria-label={`Remove ${meta.label}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {meta.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      </CardContent>
    </Card>
  );
}

// ─── Add Widget Dialog ──────────────────────────────────────────────────────────

function AddWidgetDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: WidgetType) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {WIDGET_TYPES.map((wt) => {
            const Icon = wt.icon;
            return (
              <button
                key={wt.type}
                onClick={() => {
                  onAdd(wt.type);
                  onOpenChange(false);
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent hover:border-primary/40 transition-colors text-center"
              >
                <Icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{wt.label}</span>
                <span className="text-xs text-muted-foreground">{wt.description}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Layout Dialog ──────────────────────────────────────────────────────────

function NewLayoutDialog({
  open,
  onOpenChange,
  onCreate,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Layout</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Layout name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              onCreate(name.trim());
              setName('');
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || isPending}
            onClick={() => {
              onCreate(name.trim());
              setName('');
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Template Gallery ───────────────────────────────────────────────────────────

function TemplateGallery({
  onUseTemplate,
}: {
  onUseTemplate: (template: (typeof BUILTIN_TEMPLATES)[number]) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Templates
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BUILTIN_TEMPLATES.map((tmpl) => (
          <Card key={tmpl.name} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{tmpl.name}</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {tmpl.widgets.length} widgets
                </Badge>
              </div>
              <CardDescription className="text-xs">{tmpl.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onUseTemplate(tmpl)}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Use Template
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main Customizable Dashboard ────────────────────────────────────────────────

export function CustomizableDashboard() {
  const { data: layouts, isLoading: layoutsLoading } = useDashboardLayouts();
  const createLayout = useCreateLayout();
  const updateLayout = useUpdateLayout();
  const deleteLayout = useDeleteLayout();
  const setWidgets = useSetLayoutWidgets();

  const [editMode, setEditMode] = useState(false);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [localWidgets, setLocalWidgets] = useState<(WidgetInput & { _key: string })[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLayoutDialogOpen, setNewLayoutDialogOpen] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const { data: layoutDetail } = useLayoutDetail(selectedLayoutId);

  // Pick the active layout or fallback
  const activeLayout = useMemo(() => {
    if (!layouts || layouts.length === 0) return null;
    return layouts.find((l) => l.is_active) ?? layouts[0];
  }, [layouts]);

  // Set selected layout on mount
  useEffect(() => {
    if (activeLayout && !selectedLayoutId) {
      setSelectedLayoutId(activeLayout.id);
    }
  }, [activeLayout, selectedLayoutId]);

  // Sync local widgets when layout detail loads
  useEffect(() => {
    if (layoutDetail?.widgets) {
      setLocalWidgets(
        layoutDetail.widgets.map((w) => ({
          widget_type: w.widget_type,
          position_x: w.position_x,
          position_y: w.position_y,
          width: w.width,
          height: w.height,
          config: w.config,
          _key: w.id,
        }))
      );
    }
  }, [layoutDetail]);

  // Fallback: if no layouts exist, use default template widgets
  const displayWidgets = useMemo(() => {
    if (localWidgets.length > 0) return localWidgets;
    // Fallback to default template
    return BUILTIN_TEMPLATES[0].widgets.map((w, i) => ({
      ...w,
      _key: `default-${i}`,
    }));
  }, [localWidgets]);

  // Compute grid rows from widget positions
  const maxRow = useMemo(() => {
    if (displayWidgets.length === 0) return 3;
    return Math.max(...displayWidgets.map((w) => w.position_y + w.height), 3);
  }, [displayWidgets]);

  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      const meta = getWidgetMeta(type);
      // Place at next available y position
      const nextY = displayWidgets.length > 0
        ? Math.max(...displayWidgets.map((w) => w.position_y + w.height))
        : 0;
      setLocalWidgets((prev) => [
        ...prev,
        {
          widget_type: type,
          position_x: 0,
          position_y: nextY,
          width: meta.defaultW,
          height: meta.defaultH,
          config: {},
          _key: `new-${Date.now()}-${Math.random()}`,
        },
      ]);
    },
    [displayWidgets]
  );

  const handleRemoveWidget = useCallback((key: string) => {
    setLocalWidgets((prev) => prev.filter((w) => w._key !== key));
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedLayoutId) return;
    try {
      await setWidgets.mutateAsync({
        layoutId: selectedLayoutId,
        widgets: localWidgets.map(({ _key, ...rest }) => rest),
      });
      toast.success('Layout saved');
      setEditMode(false);
    } catch {
      toast.error('Failed to save layout');
    }
  }, [selectedLayoutId, localWidgets, setWidgets]);

  const handleCreateLayout = useCallback(
    async (name: string) => {
      try {
        const layout = await createLayout.mutateAsync({ name });
        setSelectedLayoutId(layout.id);
        setNewLayoutDialogOpen(false);
        toast.success('Layout created');
      } catch {
        toast.error('Failed to create layout');
      }
    },
    [createLayout]
  );

  const handleDeleteLayout = useCallback(
    async (layoutId: string) => {
      try {
        await deleteLayout.mutateAsync(layoutId);
        if (selectedLayoutId === layoutId) {
          setSelectedLayoutId(null);
          setLocalWidgets([]);
        }
        toast.success('Layout deleted');
      } catch {
        toast.error('Failed to delete layout');
      }
    },
    [deleteLayout, selectedLayoutId]
  );

  const handleSetActive = useCallback(
    async (layoutId: string) => {
      try {
        await updateLayout.mutateAsync({
          layoutId,
          data: { is_active: true },
        });
        setSelectedLayoutId(layoutId);
        toast.success('Layout activated');
      } catch {
        toast.error('Failed to activate layout');
      }
    },
    [updateLayout]
  );

  const handleUseTemplate = useCallback(
    async (template: (typeof BUILTIN_TEMPLATES)[number]) => {
      try {
        const layout = await createLayout.mutateAsync({
          name: template.name,
          widgets: template.widgets,
        });
        setSelectedLayoutId(layout.id);
        await updateLayout.mutateAsync({
          layoutId: layout.id,
          data: { is_active: true },
        });
        toast.success(`Applied "${template.name}" template`);
      } catch {
        toast.error('Failed to apply template');
      }
    },
    [createLayout, updateLayout]
  );

  if (layoutsLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-12 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="col-span-4 h-32 bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Dashboard</h2>
          {/* Layout Selector */}
          {layouts && layouts.length > 0 && (
            <Select
              value={selectedLayoutId ?? ''}
              onValueChange={(val) => setSelectedLayoutId(val)}
            >
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="Select layout" />
              </SelectTrigger>
              <SelectContent>
                {layouts.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="flex items-center gap-1.5">
                      {l.name}
                      {l.is_active && (
                        <Badge variant="default" className="text-[10px] px-1 py-0">
                          Active
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Widget
              </Button>
              <Button size="sm" onClick={handleSave} disabled={setWidgets.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" />
                Save Layout
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditMode(false);
                  // Reset to saved state
                  if (layoutDetail?.widgets) {
                    setLocalWidgets(
                      layoutDetail.widgets.map((w) => ({
                        widget_type: w.widget_type,
                        position_x: w.position_x,
                        position_y: w.position_y,
                        width: w.width,
                        height: w.height,
                        config: w.config,
                        _key: w.id,
                      }))
                    );
                  }
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditMode(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Customize
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowPanel(!showPanel)}
              >
                <Layers className="h-3.5 w-3.5 mr-1" />
                Layouts
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNewLayoutDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Layout
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Layout Management Panel ──────────────────────── */}
      {showPanel && !editMode && (
        <div className="border rounded-lg p-4 space-y-4 bg-card">
          {/* Saved Layouts */}
          {layouts && layouts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Your Layouts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {layouts.map((l) => (
                  <div
                    key={l.id}
                    className={`flex items-center justify-between p-3 rounded-md border ${
                      l.id === selectedLayoutId ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{l.name}</span>
                      {l.is_active && (
                        <Badge variant="default" className="text-[10px] shrink-0">
                          Active
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {l.widget_count ?? 0} widgets
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!l.is_active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => handleSetActive(l.id)}
                        >
                          Activate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleDeleteLayout(l.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Template Gallery */}
          <TemplateGallery onUseTemplate={handleUseTemplate} />
        </div>
      )}

      {/* ── Widget Grid ─────────────────────────────────────── */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gridAutoRows: '80px',
        }}
      >
        {displayWidgets.map((widget) => (
          <div
            key={widget._key}
            style={{
              gridColumn: `${widget.position_x + 1} / span ${Math.min(widget.width, 12 - widget.position_x)}`,
              gridRow: `${widget.position_y + 1} / span ${widget.height}`,
            }}
          >
            <WidgetPlaceholder
              widget={widget}
              editMode={editMode}
              onRemove={editMode ? () => handleRemoveWidget(widget._key) : undefined}
            />
          </div>
        ))}
      </div>

      {/* Empty State */}
      {displayWidgets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LayoutDashboard className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium mb-1">No widgets yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add widgets to customize your dashboard, or start from a template.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditMode(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Customize
            </Button>
            <Button variant="outline" onClick={() => setShowPanel(true)}>
              <Layers className="h-3.5 w-3.5 mr-1" />
              Browse Templates
            </Button>
          </div>
        </div>
      )}

      {/* ── Dialogs ──────────────────────────────────────── */}
      <AddWidgetDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddWidget}
      />
      <NewLayoutDialog
        open={newLayoutDialogOpen}
        onOpenChange={setNewLayoutDialogOpen}
        onCreate={handleCreateLayout}
        isPending={createLayout.isPending}
      />
    </div>
  );
}
