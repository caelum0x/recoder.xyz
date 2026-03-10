'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Settings, X, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDashboardWidgets,
  useDeleteWidget,
  useResetWidgets,
} from '@/hooks/dashboard/use-dashboard-widgets';
import type { WidgetConfig } from '@/lib/api/dashboard-widgets';
import { StatsCardWidget } from './widgets/stats-card-widget';
import { ChartWidget } from './widgets/chart-widget';
import { RecentThreadsWidget } from './widgets/recent-threads-widget';
import { ActiveRunsWidget } from './widgets/active-runs-widget';
import { QuickActionsWidget } from './widgets/quick-actions-widget';
import { NotesWidget } from './widgets/notes-widget';
import { WidgetPickerDialog } from './widgets/widget-picker-dialog';

// ---------------------------------------------------------------------------
// Widget renderer
// ---------------------------------------------------------------------------

function WidgetBody({
  widget,
}: {
  widget: WidgetConfig;
}) {
  switch (widget.widget_type) {
    case 'stats_card':
      return <StatsCardWidget config={widget.config} />;
    case 'chart':
      return <ChartWidget config={widget.config} />;
    case 'recent_threads':
      return <RecentThreadsWidget config={widget.config} />;
    case 'active_runs':
      return <ActiveRunsWidget config={widget.config} />;
    case 'quick_actions':
      return <QuickActionsWidget config={widget.config} />;
    case 'notes':
      return <NotesWidget widgetId={widget.id} config={widget.config} />;
    case 'cost_summary':
      return (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          Cost summary data loading...
        </div>
      );
    case 'agent_health':
      return (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          Agent health data loading...
        </div>
      );
    case 'bookmarks':
      return (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          No bookmarks yet
        </div>
      );
    case 'calendar':
      return (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          No scheduled runs
        </div>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Single widget card
// ---------------------------------------------------------------------------

function WidgetCard({
  widget,
  editMode,
  onRemove,
}: {
  widget: WidgetConfig;
  editMode: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <Card
      className={cn(
        'relative transition-shadow',
        editMode && 'ring-1 ring-dashed ring-muted-foreground/30',
        widget.width >= 2 && 'col-span-1 sm:col-span-2'
      )}
      style={{
        gridColumn: widget.width >= 2 ? 'span 2' : 'span 1',
      }}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
        <div className="flex items-center gap-1">
          {editMode && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Widget settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => onRemove(widget.id)}
                aria-label="Remove widget"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <WidgetBody widget={widget} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export function WidgetGrid() {
  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: widgets, isLoading } = useDashboardWidgets();
  const deleteWidget = useDeleteWidget();
  const resetWidgets = useResetWidgets();

  const visibleWidgets = (widgets ?? []).filter((w) => w.is_visible);

  const handleRemove = (id: string) => {
    deleteWidget.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="h-4 w-24 rounded bg-muted" />
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="h-20 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Dashboard Widgets
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Edit</span>
            <Switch
              checked={editMode}
              onCheckedChange={setEditMode}
              aria-label="Toggle edit mode"
            />
          </div>
          {editMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetWidgets.mutate()}
              disabled={resetWidgets.isPending}
            >
              Reset Layout
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleWidgets.map((widget) => (
          <WidgetCard
            key={widget.id}
            widget={widget}
            editMode={editMode}
            onRemove={handleRemove}
          />
        ))}
      </div>

      {/* Empty state */}
      {visibleWidgets.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12">
          <LayoutGrid className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No widgets configured. Add some to customize your dashboard.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetWidgets.mutate()}
            disabled={resetWidgets.isPending}
          >
            Load Default Widgets
          </Button>
        </div>
      )}

      {/* Floating add button */}
      <Button
        onClick={() => setPickerOpen(true)}
        size="sm"
        className="fixed bottom-6 right-6 z-50 gap-1.5 rounded-full shadow-lg"
      >
        <Plus className="h-4 w-4" />
        Add Widget
      </Button>

      <WidgetPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </div>
  );
}
