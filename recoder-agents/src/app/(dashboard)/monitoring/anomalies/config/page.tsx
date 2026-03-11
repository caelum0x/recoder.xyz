'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  Skull,
  RefreshCw,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ScanSearch,
  Check,
  Eye,
  X,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAnomalyConfigs,
  useCreateAnomalyConfig,
  useUpdateAnomalyConfig,
  useDeleteAnomalyConfig,
  useRunAnomalyScan,
  useDetectedAnomalies,
  useUpdateAnomalyStatus,
  useAnomalyStats,
} from '@/hooks/monitoring/use-anomaly-detection-configs';
import type {
  AnomalyDetectionConfig,
  DetectedAnomaly,
  DetectedAnomalyFilters,
  CreateAnomalyConfigData,
} from '@/lib/api/anomaly-detection-configs';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ============================================================================
// Constants
// ============================================================================

const SEVERITY_CONFIG = {
  low: {
    label: 'Low',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    icon: Info,
  },
  medium: {
    label: 'Medium',
    color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    icon: AlertTriangle,
  },
  high: {
    label: 'High',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    icon: ShieldAlert,
  },
  critical: {
    label: 'Critical',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    icon: Skull,
  },
} as const;

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  acknowledged: {
    label: 'Acknowledged',
    color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  },
  resolved: { label: 'Resolved', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  false_positive: { label: 'False Positive', color: 'bg-muted text-muted-foreground' },
} as const;

const DETECTION_METHODS = [
  { value: 'zscore', label: 'Z-Score' },
  { value: 'iqr', label: 'IQR' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'percentage_change', label: 'Percentage Change' },
] as const;

// ============================================================================
// Stats Header
// ============================================================================

function StatsHeader() {
  const { data: stats, isLoading } = useAnomalyStats();
  const scanMutation = useRunAnomalyScan();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-20 mb-2" />
              <div className="h-8 bg-muted rounded w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const severities = ['critical', 'high', 'medium', 'low'] as const;

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Anomaly Detection</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure detection rules and review detected anomalies
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          size="sm"
          className="gap-2"
        >
          {scanMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}
          Run Scan
        </Button>
      </div>

      {scanMutation.isSuccess && (
        <div className="text-sm bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 rounded-md px-3 py-2">
          Scan complete: <strong>{scanMutation.data.new_anomalies}</strong> new anomalies detected
          across <strong>{scanMutation.data.configs_scanned}</strong> active configs.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Open</p>
            <p className="text-2xl font-bold mt-1">{stats?.total_open ?? 0}</p>
          </CardContent>
        </Card>
        {severities.map((sev) => {
          const config = SEVERITY_CONFIG[sev];
          const count = stats?.open_by_severity?.[sev] ?? 0;
          const Icon = config.icon;
          return (
            <Card key={sev}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {config.label}
                  </p>
                  <p className="text-2xl font-bold mt-1">{count}</p>
                </div>
                <div className={cn('rounded-full p-2', config.color)}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Config Dialog
// ============================================================================

interface ConfigDialogProps {
  open: boolean;
  onClose: () => void;
  existing?: AnomalyDetectionConfig | null;
}

function ConfigDialog({ open, onClose, existing }: ConfigDialogProps) {
  const createMutation = useCreateAnomalyConfig();
  const updateMutation = useUpdateAnomalyConfig();

  const [metricType, setMetricType] = useState(existing?.metric_type ?? '');
  const [agentId, setAgentId] = useState(existing?.agent_id ?? '');
  const [detectionMethod, setDetectionMethod] = useState<CreateAnomalyConfigData['detection_method']>(
    existing?.detection_method ?? 'zscore'
  );
  const [sensitivity, setSensitivity] = useState(String(existing?.sensitivity ?? 2.0));
  const [windowHours, setWindowHours] = useState(String(existing?.window_hours ?? 24));
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);

  const isEdit = !!existing;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    const data = {
      metric_type: metricType.trim(),
      agent_id: agentId.trim() || null,
      detection_method: detectionMethod,
      sensitivity: parseFloat(sensitivity),
      window_hours: parseInt(windowHours, 10),
      is_active: isActive,
    };

    if (!data.metric_type) return;

    if (isEdit) {
      updateMutation.mutate(
        { configId: existing.id, data },
        { onSuccess: onClose }
      );
    } else {
      createMutation.mutate(data, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Detection Config' : 'New Detection Config'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="metric_type">Metric Type *</Label>
            <Input
              id="metric_type"
              placeholder="e.g. error_rate, token_usage, latency"
              value={metricType}
              onChange={(e) => setMetricType(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent_id">Agent ID (optional)</Label>
            <Input
              id="agent_id"
              placeholder="Leave blank to apply to all agents"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Detection Method</Label>
            <Select
              value={detectionMethod}
              onValueChange={(v) => setDetectionMethod(v as typeof detectionMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DETECTION_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sensitivity">
              Sensitivity: <span className="font-medium">{sensitivity}</span>
            </Label>
            <input
              id="sensitivity"
              type="range"
              min="0.5"
              max="4.0"
              step="0.1"
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.5 (sensitive)</span>
              <span>4.0 (lenient)</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="window_hours">Window (hours)</Label>
            <Input
              id="window_hours"
              type="number"
              min={1}
              max={720}
              value={windowHours}
              onChange={(e) => setWindowHours(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !metricType.trim()}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Save Changes' : 'Create Config'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Config List
// ============================================================================

function ConfigList() {
  const { data: configs, isLoading } = useAnomalyConfigs();
  const updateMutation = useUpdateAnomalyConfig();
  const deleteMutation = useDeleteAnomalyConfig();
  const [editTarget, setEditTarget] = useState<AnomalyDetectionConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnomalyDetectionConfig | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const methodBadgeColor = (method: string) => {
    const map: Record<string, string> = {
      zscore: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      iqr: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      threshold: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
      percentage_change: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    };
    return map[method] ?? 'bg-muted text-muted-foreground';
  };

  return (
    <>
      <div className="space-y-2">
        {(!configs || configs.length === 0) && (
          <Card>
            <CardContent className="p-8 text-center">
              <ScanSearch className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No detection configs</p>
              <p className="text-xs text-muted-foreground">
                Create a config to start detecting anomalies for specific metrics.
              </p>
            </CardContent>
          </Card>
        )}
        {configs?.map((cfg) => (
          <div
            key={cfg.id}
            className="flex items-center gap-3 px-4 py-3 border rounded-lg hover:bg-muted/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{cfg.metric_type}</span>
                <Badge
                  variant="outline"
                  className={cn('text-[10px]', methodBadgeColor(cfg.detection_method))}
                >
                  {cfg.detection_method}
                </Badge>
                {!cfg.is_active && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cfg.agent_id ? `Agent: ${cfg.agent_id}` : 'All agents'} · Sensitivity:{' '}
                {cfg.sensitivity} · Window: {cfg.window_hours}h
              </p>
            </div>

            <Switch
              checked={cfg.is_active}
              onCheckedChange={(val) =>
                updateMutation.mutate({ configId: cfg.id, data: { is_active: val } })
              }
              disabled={updateMutation.isPending}
            />

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setEditTarget(cfg);
                  setShowDialog(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(cfg)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfigDialog
        open={showDialog}
        onClose={() => {
          setShowDialog(false);
          setEditTarget(null);
        }}
        existing={editTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Config</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the detection config for metric{' '}
              <strong>{deleteTarget?.metric_type}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================================
// Anomaly Feed
// ============================================================================

function AnomalyFeed() {
  const [filters, setFilters] = useState<DetectedAnomalyFilters>({});
  const { data: anomalies, isLoading } = useDetectedAnomalies(filters);
  const updateMutation = useUpdateAnomalyStatus();

  const [agentIdInput, setAgentIdInput] = useState('');

  const applyAgentFilter = () => {
    setFilters((f) => ({ ...f, agent_id: agentIdInput.trim() || undefined }));
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />

        <Select
          value={filters.status || 'all'}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, status: v === 'all' ? undefined : v }))
          }
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="false_positive">False Positive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.severity || 'all'}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, severity: v === 'all' ? undefined : v }))
          }
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-1.5">
          <Input
            placeholder="Agent ID..."
            value={agentIdInput}
            onChange={(e) => setAgentIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyAgentFilter()}
            className="w-[160px] h-8 text-xs"
          />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={applyAgentFilter}>
            Filter
          </Button>
          {filters.agent_id && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setAgentIdInput('');
                setFilters((f) => ({ ...f, agent_id: undefined }));
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Feed */}
      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!anomalies || anomalies.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center">
            <Check className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-foreground font-medium">No anomalies detected</p>
            <p className="text-xs text-muted-foreground mt-1">
              Run a scan to detect anomalies, or adjust filters.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && anomalies && anomalies.length > 0 && (
        <div className="space-y-2">
          {anomalies.map((a) => (
            <AnomalyFeedItem
              key={a.id}
              anomaly={a}
              onStatusChange={(status) =>
                updateMutation.mutate({ anomalyId: a.id, status })
              }
              isPending={updateMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AnomalyFeedItem({
  anomaly,
  onStatusChange,
  isPending,
}: {
  anomaly: DetectedAnomaly;
  onStatusChange: (status: string) => void;
  isPending: boolean;
}) {
  const sevConfig = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.medium;
  const statusConfig = STATUS_CONFIG[anomaly.status] ?? STATUS_CONFIG.open;
  const SevIcon = sevConfig.icon;

  return (
    <div className="flex items-start gap-3 px-4 py-3 border rounded-lg hover:bg-muted/20 transition-colors">
      <div className={cn('rounded-full p-1.5 flex-shrink-0 mt-0.5', sevConfig.color)}>
        <SevIcon className="h-3.5 w-3.5" />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{anomaly.metric_type}</span>
          {anomaly.agent_id && (
            <span className="text-xs text-muted-foreground">{anomaly.agent_id}</span>
          )}
          <Badge className={cn('text-[10px]', statusConfig.color)}>{statusConfig.label}</Badge>
          <Badge variant="outline" className={cn('text-[10px]', sevConfig.color)}>
            {sevConfig.label}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {anomaly.observed_value !== null && (
            <span>
              Observed: <span className="text-foreground font-medium">{anomaly.observed_value.toFixed(4)}</span>
            </span>
          )}
          {anomaly.expected_value !== null && (
            <span>
              Expected: <span className="text-foreground font-medium">{anomaly.expected_value.toFixed(4)}</span>
            </span>
          )}
          {anomaly.deviation_score !== null && (
            <span>
              Score:{' '}
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                {anomaly.deviation_score.toFixed(2)}
              </span>
            </span>
          )}
          <span>{new Date(anomaly.detected_at).toLocaleString()}</span>
        </div>

        {anomaly.description && (
          <p className="text-xs text-muted-foreground">{anomaly.description}</p>
        )}
      </div>

      {/* Status action buttons */}
      {anomaly.status === 'open' && (
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Acknowledge"
            disabled={isPending}
            onClick={() => onStatusChange('acknowledged')}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Resolve"
            disabled={isPending}
            onClick={() => onStatusChange('resolved')}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Mark False Positive"
            disabled={isPending}
            onClick={() => onStatusChange('false_positive')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {anomaly.status === 'acknowledged' && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Resolve"
            disabled={isPending}
            onClick={() => onStatusChange('resolved')}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Mark False Positive"
            disabled={isPending}
            onClick={() => onStatusChange('false_positive')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AnomalyDetectionConfigPage() {
  const [showNewConfigDialog, setShowNewConfigDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'configs' | 'feed'>('configs');

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 pt-16 sm:pt-20 max-w-5xl mx-auto">
      <StatsHeader />

      {/* Tab Nav */}
      <div className="flex items-center gap-1 mb-6 border-b">
        <button
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'configs'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('configs')}
        >
          Detection Configs
        </button>
        <button
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'feed'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('feed')}
        >
          Anomaly Feed
        </button>
      </div>

      {activeTab === 'configs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Detection Configs</h2>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setShowNewConfigDialog(true)}
            >
              <Plus className="h-4 w-4" />
              New Config
            </Button>
          </div>
          <ConfigList />
        </div>
      )}

      {activeTab === 'feed' && <AnomalyFeed />}

      <ConfigDialog
        open={showNewConfigDialog}
        onClose={() => setShowNewConfigDialog(false)}
      />
    </div>
  );
}
