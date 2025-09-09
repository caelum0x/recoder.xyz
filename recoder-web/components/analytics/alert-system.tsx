// Alert system component for monitoring analytics metrics
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
import { Progress } from '@/components/ui/progress';
import {
  Plus,
  X,
  Save,
  Play,
  Pause,
  AlertTriangle,
  Bell,
  Mail,
  Webhook,
  Settings,
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Zap,
  Database,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertCondition {
  id: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  value: number;
  severity: 'info' | 'warning' | 'critical';
}

interface AlertConfig {
  id?: string;
  name: string;
  description?: string;
  type: 'threshold' | 'anomaly' | 'trend' | 'comparison';
  dataSource: 'projects' | 'usage' | 'deployments' | 'performance' | 'errors';
  metric: {
    field: string;
    aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max';
    timeWindow: '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | '7d';
  };
  conditions: AlertCondition[];
  notifications: {
    email?: {
      enabled: boolean;
      recipients: string[];
      template?: string;
    };
    webhook?: {
      enabled: boolean;
      url: string;
      headers?: Record<string, string>;
    };
    inApp: {
      enabled: boolean;
    };
  };
  schedule: {
    enabled: boolean;
    frequency: 'realtime' | '5m' | '15m' | '30m' | '1h';
  };
  status: 'active' | 'paused' | 'triggered';
  lastEvaluated?: string;
  lastTriggered?: string;
  triggerCount?: number;
}

interface AlertSystemProps {
  className?: string;
}

const alertTypeOptions = [
  {
    value: 'threshold',
    label: 'Threshold',
    description: 'Trigger when value crosses a threshold',
    icon: Target,
  },
  {
    value: 'anomaly',
    label: 'Anomaly Detection',
    description: 'Detect unusual patterns in data',
    icon: AlertTriangle,
  },
  {
    value: 'trend',
    label: 'Trend Analysis',
    description: 'Monitor trends over time',
    icon: TrendingUp,
  },
  {
    value: 'comparison',
    label: 'Comparison',
    description: 'Compare with previous periods',
    icon: BarChart3,
  },
];

const dataSourceOptions = [
  { value: 'projects', label: 'Projects', icon: Database },
  { value: 'usage', label: 'Usage Statistics', icon: Activity },
  { value: 'deployments', label: 'Deployments', icon: Zap },
  { value: 'performance', label: 'Performance Metrics', icon: TrendingUp },
  { value: 'errors', label: 'Error Logs', icon: AlertTriangle },
];

const metricOptions: Record<string, any[]> = {
  projects: [
    { field: 'count', label: 'Project Count', aggregations: ['count'] },
    { field: 'deploymentCount', label: 'Deployment Count', aggregations: ['sum', 'avg', 'max'] },
    { field: 'createdAt', label: 'New Projects', aggregations: ['count'] },
  ],
  usage: [
    { field: 'generationsUsed', label: 'Generations Used', aggregations: ['sum', 'avg', 'max'] },
    { field: 'tokensUsed', label: 'Tokens Used', aggregations: ['sum', 'avg', 'max'] },
    { field: 'costAccrued', label: 'Cost Accrued', aggregations: ['sum', 'avg', 'max'] },
  ],
  deployments: [
    { field: 'count', label: 'Deployment Count', aggregations: ['count'] },
    { field: 'successRate', label: 'Success Rate', aggregations: ['avg'] },
    { field: 'failureCount', label: 'Failure Count', aggregations: ['count', 'sum'] },
  ],
  performance: [
    { field: 'responseTime', label: 'Response Time', aggregations: ['avg', 'max'] },
    { field: 'errorRate', label: 'Error Rate', aggregations: ['avg'] },
    { field: 'throughput', label: 'Throughput', aggregations: ['sum', 'avg'] },
  ],
  errors: [
    { field: 'count', label: 'Error Count', aggregations: ['count'] },
    { field: 'criticalErrors', label: 'Critical Errors', aggregations: ['count'] },
    { field: 'errorRate', label: 'Error Rate', aggregations: ['avg'] },
  ],
};

const timeWindowOptions = [
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
];

const operatorOptions = [
  { value: 'gt', label: 'Greater than' },
  { value: 'gte', label: 'Greater than or equal' },
  { value: 'lt', label: 'Less than' },
  { value: 'lte', label: 'Less than or equal' },
  { value: 'eq', label: 'Equal to' },
  { value: 'neq', label: 'Not equal to' },
];

const severityOptions = [
  { value: 'info', label: 'Info', color: 'bg-blue-500' },
  { value: 'warning', label: 'Warning', color: 'bg-yellow-500' },
  { value: 'critical', label: 'Critical', color: 'bg-red-500' },
];

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'info': return Info;
    case 'warning': return AlertCircle;
    case 'critical': return XCircle;
    default: return Info;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active': return CheckCircle;
    case 'paused': return Pause;
    case 'triggered': return AlertTriangle;
    default: return CheckCircle;
  }
};

export default function AlertSystem({ className }: AlertSystemProps) {
  const [alerts, setAlerts] = useState<AlertConfig[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertConfig | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evaluationResults, setEvaluationResults] = useState<any[]>([]);

  // Default alert configuration
  const defaultAlert: AlertConfig = {
    name: '',
    description: '',
    type: 'threshold',
    dataSource: 'projects',
    metric: {
      field: '',
      aggregation: 'count',
      timeWindow: '1h',
    },
    conditions: [],
    notifications: {
      inApp: { enabled: true },
    },
    schedule: {
      enabled: true,
      frequency: '15m',
    },
    status: 'active',
  };

  const [newAlert, setNewAlert] = useState<AlertConfig>(defaultAlert);

  // Load alerts
  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const response = await fetch('/api/analytics/alert-system');
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  };

  const createAlert = async () => {
    if (!newAlert.name.trim() || newAlert.conditions.length === 0) return;

    setLoading(true);
    try {
      const response = await fetch('/api/analytics/alert-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAlert),
      });

      if (response.ok) {
        await loadAlerts();
        setCreateDialogOpen(false);
        setNewAlert(defaultAlert);
      }
    } catch (error) {
      console.error('Failed to create alert:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAlert = async (alertId: string, updates: Partial<AlertConfig>) => {
    try {
      const response = await fetch('/api/analytics/alert-system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, ...updates }),
      });

      if (response.ok) {
        await loadAlerts();
      }
    } catch (error) {
      console.error('Failed to update alert:', error);
    }
  };

  const deleteAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/analytics/alert-system?id=${alertId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadAlerts();
      }
    } catch (error) {
      console.error('Failed to delete alert:', error);
    }
  };

  const evaluateAlerts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/analytics/alert-system/evaluate', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setEvaluationResults(data.results || []);
        await loadAlerts(); // Refresh to get updated trigger counts
      }
    } catch (error) {
      console.error('Failed to evaluate alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const addCondition = (alert: AlertConfig, setAlert: (alert: AlertConfig) => void) => {
    const newCondition: AlertCondition = {
      id: `condition_${Date.now()}`,
      operator: 'gt',
      value: 0,
      severity: 'warning',
    };
    setAlert({
      ...alert,
      conditions: [...alert.conditions, newCondition],
    });
  };

  const updateCondition = (
    alert: AlertConfig,
    setAlert: (alert: AlertConfig) => void,
    conditionId: string,
    updates: Partial<AlertCondition>
  ) => {
    setAlert({
      ...alert,
      conditions: alert.conditions.map(c =>
        c.id === conditionId ? { ...c, ...updates } : c
      ),
    });
  };

  const removeCondition = (
    alert: AlertConfig,
    setAlert: (alert: AlertConfig) => void,
    conditionId: string
  ) => {
    setAlert({
      ...alert,
      conditions: alert.conditions.filter(c => c.id !== conditionId),
    });
  };

  const renderAlertCard = (alert: AlertConfig) => {
    const StatusIcon = getStatusIcon(alert.status);
    const statusColor = alert.status === 'active' ? 'text-green-500' :
                       alert.status === 'triggered' ? 'text-red-500' : 'text-gray-500';

    return (
      <Card key={alert.id} className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <StatusIcon className={cn('h-4 w-4', statusColor)} />
                <CardTitle className="text-lg">{alert.name}</CardTitle>
                <Badge variant={alert.status === 'triggered' ? 'destructive' : 'secondary'}>
                  {alert.status}
                </Badge>
              </div>
              {alert.description && (
                <CardDescription>{alert.description}</CardDescription>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={alert.status === 'active'}
                onCheckedChange={(checked) =>
                  updateAlert(alert.id!, { status: checked ? 'active' : 'paused' })
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedAlert(alert);
                  setEditDialogOpen(true);
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteAlert(alert.id!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Data Source</div>
              <div className="font-medium">{alert.dataSource}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Type</div>
              <div className="font-medium">{alert.type}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Metric</div>
              <div className="font-medium">{alert.metric.field} ({alert.metric.aggregation})</div>
            </div>
            <div>
              <div className="text-muted-foreground">Time Window</div>
              <div className="font-medium">{alert.metric.timeWindow}</div>
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-2">Conditions</div>
            <div className="space-y-1">
              {alert.conditions.map((condition) => {
                const SeverityIcon = getSeverityIcon(condition.severity);
                const severityColor = severityOptions.find(s => s.value === condition.severity)?.color;
                
                return (
                  <div key={condition.id} className="flex items-center gap-2 text-sm">
                    <div className={cn('w-2 h-2 rounded-full', severityColor)} />
                    <span>
                      {operatorOptions.find(o => o.value === condition.operator)?.label} {condition.value}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {condition.severity}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              {alert.notifications.email?.enabled && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Email
                </div>
              )}
              {alert.notifications.webhook?.enabled && (
                <div className="flex items-center gap-1">
                  <Webhook className="h-3 w-3" />
                  Webhook
                </div>
              )}
              {alert.notifications.inApp.enabled && (
                <div className="flex items-center gap-1">
                  <Bell className="h-3 w-3" />
                  In-app
                </div>
              )}
            </div>
            <div>
              {alert.triggerCount ? `Triggered ${alert.triggerCount} times` : 'Never triggered'}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderAlertForm = (alert: AlertConfig, setAlert: (alert: AlertConfig) => void) => (
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="alert-name">Alert Name</Label>
          <Input
            id="alert-name"
            value={alert.name}
            onChange={(e) => setAlert({ ...alert, name: e.target.value })}
            placeholder="Enter alert name"
          />
        </div>
        <div>
          <Label htmlFor="alert-description">Description (Optional)</Label>
          <Textarea
            id="alert-description"
            value={alert.description}
            onChange={(e) => setAlert({ ...alert, description: e.target.value })}
            placeholder="Describe what this alert monitors"
          />
        </div>
      </div>

      {/* Alert Type */}
      <div>
        <Label>Alert Type</Label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {alertTypeOptions.map((type) => (
            <Button
              key={type.value}
              variant={alert.type === type.value ? 'default' : 'outline'}
              className="h-auto p-4 flex-col gap-2"
              onClick={() => setAlert({ ...alert, type: type.value as any })}
            >
              <type.icon className="h-6 w-6" />
              <div className="text-center">
                <div className="font-medium">{type.label}</div>
                <div className="text-xs text-muted-foreground">{type.description}</div>
              </div>
            </Button>
          ))}
        </div>
      </div>

      {/* Data Source & Metric */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="data-source">Data Source</Label>
          <Select value={alert.dataSource} onValueChange={(value) => {
            setAlert({
              ...alert,
              dataSource: value as any,
              metric: { ...alert.metric, field: '' }
            });
          }}>
            <SelectTrigger>
              <SelectValue />
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
        <div>
          <Label htmlFor="metric-field">Metric</Label>
          <Select value={alert.metric.field} onValueChange={(value) => {
            setAlert({
              ...alert,
              metric: { ...alert.metric, field: value }
            });
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent>
              {metricOptions[alert.dataSource]?.map((metric) => (
                <SelectItem key={metric.field} value={metric.field}>
                  {metric.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="aggregation">Aggregation</Label>
          <Select value={alert.metric.aggregation} onValueChange={(value) => {
            setAlert({
              ...alert,
              metric: { ...alert.metric, aggregation: value as any }
            });
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count">Count</SelectItem>
              <SelectItem value="sum">Sum</SelectItem>
              <SelectItem value="avg">Average</SelectItem>
              <SelectItem value="min">Minimum</SelectItem>
              <SelectItem value="max">Maximum</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="time-window">Time Window</Label>
          <Select value={alert.metric.timeWindow} onValueChange={(value) => {
            setAlert({
              ...alert,
              metric: { ...alert.metric, timeWindow: value as any }
            });
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeWindowOptions.map((window) => (
                <SelectItem key={window.value} value={window.value}>
                  {window.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Conditions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label>Alert Conditions</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addCondition(alert, setAlert)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Condition
          </Button>
        </div>
        <div className="space-y-3">
          {alert.conditions.map((condition) => (
            <div key={condition.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <Select
                value={condition.operator}
                onValueChange={(value) =>
                  updateCondition(alert, setAlert, condition.id, { operator: value as any })
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorOptions.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={condition.value}
                onChange={(e) =>
                  updateCondition(alert, setAlert, condition.id, { value: parseFloat(e.target.value) || 0 })
                }
                className="w-32"
              />
              <Select
                value={condition.severity}
                onValueChange={(value) =>
                  updateCondition(alert, setAlert, condition.id, { severity: value as any })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {severityOptions.map((severity) => (
                    <SelectItem key={severity.value} value={severity.value}>
                      {severity.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeCondition(alert, setAlert, condition.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div>
        <Label className="text-base">Notification Settings</Label>
        <div className="space-y-4 mt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span>In-app notifications</span>
            </div>
            <Switch
              checked={alert.notifications.inApp.enabled}
              onCheckedChange={(enabled) =>
                setAlert({
                  ...alert,
                  notifications: {
                    ...alert.notifications,
                    inApp: { enabled }
                  }
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span>Email notifications</span>
            </div>
            <Switch
              checked={alert.notifications.email?.enabled || false}
              onCheckedChange={(enabled) =>
                setAlert({
                  ...alert,
                  notifications: {
                    ...alert.notifications,
                    email: { enabled, recipients: [] }
                  }
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Alert System
              </CardTitle>
              <CardDescription>
                Monitor your analytics and get notified when thresholds are exceeded
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={evaluateAlerts}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Evaluate All
                  </>
                )}
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create Alert
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Alert Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <div className="text-sm text-muted-foreground">Active Alerts</div>
                <div className="text-2xl font-bold">
                  {alerts.filter(a => a.status === 'active').length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <div>
                <div className="text-sm text-muted-foreground">Triggered</div>
                <div className="text-2xl font-bold">
                  {alerts.filter(a => a.status === 'triggered').length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Pause className="h-4 w-4 text-gray-500" />
              <div>
                <div className="text-sm text-muted-foreground">Paused</div>
                <div className="text-2xl font-bold">
                  {alerts.filter(a => a.status === 'paused').length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              <div>
                <div className="text-sm text-muted-foreground">Total Alerts</div>
                <div className="text-2xl font-bold">{alerts.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts List */}
      <div>
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No alerts configured</h3>
              <p className="text-muted-foreground mb-4">
                Create your first alert to start monitoring your analytics metrics.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create Alert
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {alerts.map(renderAlertCard)}
          </div>
        )}
      </div>

      {/* Create Alert Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Alert</DialogTitle>
            <DialogDescription>
              Set up monitoring for your analytics metrics
            </DialogDescription>
          </DialogHeader>
          {renderAlertForm(newAlert, setNewAlert)}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createAlert}
              disabled={loading || !newAlert.name.trim() || newAlert.conditions.length === 0}
            >
              {loading ? 'Creating...' : 'Create Alert'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Alert Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Alert</DialogTitle>
            <DialogDescription>
              Modify alert configuration and settings
            </DialogDescription>
          </DialogHeader>
          {selectedAlert && renderAlertForm(selectedAlert, setSelectedAlert)}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedAlert) {
                  updateAlert(selectedAlert.id!, selectedAlert);
                  setEditDialogOpen(false);
                }
              }}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
