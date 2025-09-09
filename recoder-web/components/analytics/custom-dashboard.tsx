// Advanced custom dashboard builder with drag-and-drop functionality
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
import {
  Plus,
  Settings,
  Save,
  Share2,
  Download,
  Copy,
  Trash2,
  Grid3X3,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Users,
  Calendar,
  Clock,
  TrendingUp,
  DollarSign,
  Target,
  Zap,
  Globe,
  Smartphone,
  Server,
  Database,
  Eye,
  MousePointer,
  Timer,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';

// Widget types and configurations
const WIDGET_TYPES = {
  METRIC_CARD: 'metric_card',
  LINE_CHART: 'line_chart',
  BAR_CHART: 'bar_chart',
  PIE_CHART: 'pie_chart',
  ACTIVITY_FEED: 'activity_feed',
  USER_TABLE: 'user_table',
  HEATMAP: 'heatmap',
  GAUGE: 'gauge',
  PROGRESS: 'progress',
  COUNTER: 'counter',
} as const;

const WIDGET_TEMPLATES = [
  {
    id: 'users_active',
    type: WIDGET_TYPES.METRIC_CARD,
    title: 'Active Users',
    description: 'Currently active users on platform',
    icon: Users,
    color: 'blue',
    size: { width: 1, height: 1 },
    config: {
      metric: 'users.active',
      format: 'number',
      period: 'realtime',
      comparison: 'previous_hour',
    },
  },
  {
    id: 'revenue_monthly',
    type: WIDGET_TYPES.METRIC_CARD,
    title: 'Monthly Revenue',
    description: 'Total revenue for current month',
    icon: DollarSign,
    color: 'green',
    size: { width: 1, height: 1 },
    config: {
      metric: 'revenue.monthly',
      format: 'currency',
      period: 'month',
      comparison: 'previous_month',
    },
  },
  {
    id: 'projects_created',
    type: WIDGET_TYPES.LINE_CHART,
    title: 'Projects Created',
    description: 'Projects created over time',
    icon: TrendingUp,
    color: 'purple',
    size: { width: 2, height: 1 },
    config: {
      metric: 'projects.created',
      timeframe: '30d',
      granularity: 'day',
      showTrend: true,
    },
  },
  {
    id: 'user_engagement',
    type: WIDGET_TYPES.PIE_CHART,
    title: 'User Engagement',
    description: 'Breakdown of user activity levels',
    icon: Activity,
    color: 'orange',
    size: { width: 1, height: 1 },
    config: {
      metric: 'users.engagement',
      categories: ['high', 'medium', 'low', 'inactive'],
      period: 'week',
    },
  },
  {
    id: 'performance_metrics',
    type: WIDGET_TYPES.BAR_CHART,
    title: 'Performance Metrics',
    description: 'App performance indicators',
    icon: Zap,
    color: 'yellow',
    size: { width: 2, height: 1 },
    config: {
      metrics: ['response_time', 'throughput', 'error_rate'],
      timeframe: '24h',
      granularity: 'hour',
    },
  },
  {
    id: 'recent_activity',
    type: WIDGET_TYPES.ACTIVITY_FEED,
    title: 'Recent Activity',
    description: 'Latest user actions and events',
    icon: Clock,
    color: 'indigo',
    size: { width: 1, height: 2 },
    config: {
      sources: ['user_actions', 'system_events', 'deployments'],
      limit: 10,
      realtime: true,
    },
  },
];

// Dashboard widget interface
interface DashboardWidget {
  id: string;
  type: string;
  title: string;
  description?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  config: Record<string, any>;
  data?: any;
  loading?: boolean;
  error?: string;
}

// Dashboard configuration interface
interface DashboardConfig {
  id: string;
  name: string;
  description?: string;
  layout: 'grid' | 'masonry' | 'flow';
  gridSize: { columns: number; rowHeight: number };
  widgets: DashboardWidget[];
  settings: {
    autoRefresh: boolean;
    refreshInterval: number;
    theme: 'light' | 'dark' | 'auto';
    showGrid: boolean;
    allowResize: boolean;
  };
  sharing: {
    isPublic: boolean;
    shareToken?: string;
    permissions: string[];
  };
  createdAt: string;
  updatedAt: string;
}

// Draggable widget template component
const WidgetTemplate: React.FC<{
  template: typeof WIDGET_TEMPLATES[0];
  onAddWidget: (template: typeof WIDGET_TEMPLATES[0]) => void;
}> = ({ template, onAddWidget }) => {
  const IconComponent = template.icon;

  return (
    <Card className="cursor-pointer transition-all hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-${template.color}-100 text-${template.color}-600`}>
            <IconComponent className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate">{template.title}</h4>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {template.description}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {template.size.width}x{template.size.height}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {template.type.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full mt-3"
          onClick={() => onAddWidget(template)}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Widget
        </Button>
      </CardContent>
    </Card>
  );
};

// Dashboard grid component
const DashboardGrid: React.FC<{
  widgets: DashboardWidget[];
  onMoveWidget: (widgetId: string, position: { x: number; y: number }) => void;
  onResizeWidget: (widgetId: string, size: { width: number; height: number }) => void;
  onRemoveWidget: (widgetId: string) => void;
  onConfigureWidget: (widgetId: string) => void;
  gridSize: { columns: number; rowHeight: number };
  showGrid: boolean;
}> = ({
  widgets,
  onMoveWidget,
  onResizeWidget,
  onRemoveWidget,
  onConfigureWidget,
  gridSize,
  showGrid,
}) => {
  return (
    <div
      className={`relative min-h-[600px] ${showGrid ? 'grid-background' : ''}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridSize.columns}, 1fr)`,
        gap: '16px',
        padding: '16px',
      }}
    >
      {widgets.map((widget) => (
        <DashboardWidgetComponent
          key={widget.id}
          widget={widget}
          onMove={onMoveWidget}
          onResize={onResizeWidget}
          onRemove={onRemoveWidget}
          onConfigure={onConfigureWidget}
        />
      ))}
    </div>
  );
};

// Individual dashboard widget component
const DashboardWidgetComponent: React.FC<{
  widget: DashboardWidget;
  onMove: (widgetId: string, position: { x: number; y: number }) => void;
  onResize: (widgetId: string, size: { width: number; height: number }) => void;
  onRemove: (widgetId: string) => void;
  onConfigure: (widgetId: string) => void;
}> = ({ widget, onMove, onResize, onRemove, onConfigure }) => {
  return (
    <Card
      className="transition-all hover:shadow-md"
      style={{
        gridColumn: `span ${widget.size.width}`,
        gridRow: `span ${widget.size.height}`,
      }}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
          <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onConfigure(widget.id)}
          >
            <Settings className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(widget.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {widget.loading ? (
          <div className="flex items-center justify-center h-24">
            <RefreshCw className="w-4 h-4 animate-spin" />
          </div>
        ) : widget.error ? (
          <div className="flex items-center justify-center h-24 text-destructive">
            <AlertTriangle className="w-4 h-4 mr-2" />
            <span className="text-sm">Error loading data</span>
          </div>
        ) : (
          <WidgetContent widget={widget} />
        )}
      </CardContent>
    </Card>
  );
};

// Widget content renderer
const WidgetContent: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  switch (widget.type) {
    case WIDGET_TYPES.METRIC_CARD:
      return (
        <div className="space-y-2">
          <div className="text-2xl font-bold">
            {widget.data?.value || '0'}
          </div>
          <p className="text-xs text-muted-foreground">
            {widget.data?.change && (
              <span className={widget.data.change > 0 ? 'text-green-600' : 'text-red-600'}>
                {widget.data.change > 0 ? '+' : ''}{widget.data.change}%
              </span>
            )}
            {' vs previous period'}
          </p>
        </div>
      );
    
    case WIDGET_TYPES.LINE_CHART:
      return (
        <div className="h-32 bg-muted/20 rounded flex items-center justify-center">
          <LineChart className="w-8 h-8 text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Chart Data</span>
        </div>
      );
    
    case WIDGET_TYPES.PIE_CHART:
      return (
        <div className="h-32 bg-muted/20 rounded flex items-center justify-center">
          <PieChart className="w-8 h-8 text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Pie Chart</span>
        </div>
      );
    
    default:
      return (
        <div className="h-24 bg-muted/20 rounded flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Widget Content</span>
        </div>
      );
  }
};

// Main custom dashboard builder component
export default function CustomDashboard() {
  const [dashboards, setDashboards] = useState<DashboardConfig[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<DashboardConfig | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showWidgetPanel, setShowWidgetPanel] = useState(true);

  // Initialize with sample dashboard
  useEffect(() => {
    const sampleDashboard: DashboardConfig = {
      id: 'sample-dashboard',
      name: 'Sample Dashboard',
      description: 'Example dashboard with sample widgets',
      layout: 'grid',
      gridSize: { columns: 4, rowHeight: 200 },
      widgets: [
        {
          id: 'widget-1',
          type: WIDGET_TYPES.METRIC_CARD,
          title: 'Active Users',
          position: { x: 0, y: 0 },
          size: { width: 1, height: 1 },
          config: { metric: 'users.active' },
          data: { value: '1,234', change: 12.5 },
        },
        {
          id: 'widget-2',
          type: WIDGET_TYPES.METRIC_CARD,
          title: 'Revenue',
          position: { x: 1, y: 0 },
          size: { width: 1, height: 1 },
          config: { metric: 'revenue.total' },
          data: { value: '$45,678', change: -2.3 },
        },
      ],
      settings: {
        autoRefresh: true,
        refreshInterval: 30000,
        theme: 'light',
        showGrid: true,
        allowResize: true,
      },
      sharing: {
        isPublic: false,
        permissions: ['view'],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDashboards([sampleDashboard]);
    setActiveDashboard(sampleDashboard);
  }, []);

  const handleCreateDashboard = async (name: string, description?: string) => {
    const newDashboard: DashboardConfig = {
      id: `dashboard-${Date.now()}`,
      name,
      description,
      layout: 'grid',
      gridSize: { columns: 4, rowHeight: 200 },
      widgets: [],
      settings: {
        autoRefresh: false,
        refreshInterval: 30000,
        theme: 'light',
        showGrid: true,
        allowResize: true,
      },
      sharing: {
        isPublic: false,
        permissions: ['view'],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDashboards(prev => [...prev, newDashboard]);
    setActiveDashboard(newDashboard);
    setIsCreating(false);
    toast.success('Dashboard created successfully');
  };

  const handleAddWidget = (template: typeof WIDGET_TEMPLATES[0]) => {
    if (!activeDashboard) return;

    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}`,
      type: template.type,
      title: template.title,
      description: template.description,
      position: { x: 0, y: 0 }, // Will be calculated based on available space
      size: template.size,
      config: template.config,
      loading: false,
    };

    const updatedDashboard = {
      ...activeDashboard,
      widgets: [...activeDashboard.widgets, newWidget],
      updatedAt: new Date().toISOString(),
    };

    setActiveDashboard(updatedDashboard);
    toast.success(`Added ${template.title} widget`);
  };

  const handleMoveWidget = (widgetId: string, position: { x: number; y: number }) => {
    if (!activeDashboard) return;

    const updatedDashboard = {
      ...activeDashboard,
      widgets: activeDashboard.widgets.map(widget =>
        widget.id === widgetId ? { ...widget, position } : widget
      ),
      updatedAt: new Date().toISOString(),
    };

    setActiveDashboard(updatedDashboard);
  };

  const handleRemoveWidget = (widgetId: string) => {
    if (!activeDashboard) return;

    const updatedDashboard = {
      ...activeDashboard,
      widgets: activeDashboard.widgets.filter(widget => widget.id !== widgetId),
      updatedAt: new Date().toISOString(),
    };

    setActiveDashboard(updatedDashboard);
    toast.success('Widget removed');
  };

  const handleSaveDashboard = async () => {
    if (!activeDashboard) return;

    // In a real implementation, this would save to the backend
    console.log('Saving dashboard:', activeDashboard);
    toast.success('Dashboard saved successfully');
  };

  return (
    <div className="flex h-screen bg-background">
        {/* Widget Panel */}
        {showWidgetPanel && (
          <div className="w-80 border-r bg-muted/20">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Widget Library</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowWidgetPanel(false)}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
              
              <ScrollArea className="h-[calc(100vh-120px)]">
                <div className="space-y-3">
                  {WIDGET_TEMPLATES.map((template) => (
                    <WidgetTemplate
                      key={template.id}
                      template={template}
                      onAddWidget={handleAddWidget}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        {/* Main Dashboard Area */}
        <div className="flex-1 flex flex-col">
          {/* Dashboard Header */}
          <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <Select
                  value={activeDashboard?.id || ''}
                  onValueChange={(value) => {
                    const dashboard = dashboards.find(d => d.id === value);
                    setActiveDashboard(dashboard || null);
                  }}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select dashboard" />
                  </SelectTrigger>
                  <SelectContent>
                    {dashboards.map((dashboard) => (
                      <SelectItem key={dashboard.id} value={dashboard.id}>
                        {dashboard.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Dialog open={isCreating} onOpenChange={setIsCreating}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Dashboard
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Dashboard</DialogTitle>
                      <DialogDescription>
                        Create a new custom dashboard with widgets
                      </DialogDescription>
                    </DialogHeader>
                    <CreateDashboardForm onSubmit={handleCreateDashboard} />
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex items-center gap-2">
                {!showWidgetPanel && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowWidgetPanel(true)}
                  >
                    <Grid3X3 className="w-4 h-4 mr-2" />
                    Widgets
                  </Button>
                )}
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveDashboard}
                  disabled={!activeDashboard}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!activeDashboard}
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>
          </div>

          {/* Dashboard Content */}
          <div className="flex-1 overflow-auto">
            {activeDashboard ? (
              <DashboardGrid
                widgets={activeDashboard.widgets}
                onMoveWidget={handleMoveWidget}
                onResizeWidget={(widgetId, size) => {
                  // Handle widget resize
                }}
                onRemoveWidget={handleRemoveWidget}
                onConfigureWidget={(widgetId) => {
                  // Handle widget configuration
                }}
                gridSize={activeDashboard.gridSize}
                showGrid={activeDashboard.settings.showGrid}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Dashboard Selected</h3>
                  <p className="text-muted-foreground mb-4">
                    Select a dashboard or create a new one to get started
                  </p>
                  <Button onClick={() => setIsCreating(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Dashboard
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}

// Create dashboard form component
const CreateDashboardForm: React.FC<{
  onSubmit: (name: string, description?: string) => void;
}> = ({ onSubmit }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim(), description.trim() || undefined);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="dashboard-name">Dashboard Name</Label>
        <Input
          id="dashboard-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter dashboard name"
          required
        />
      </div>
      
      <div>
        <Label htmlFor="dashboard-description">Description (Optional)</Label>
        <Textarea
          id="dashboard-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this dashboard will show"
          rows={3}
        />
      </div>
      
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          Create Dashboard
        </Button>
      </div>
    </form>
  );
};
