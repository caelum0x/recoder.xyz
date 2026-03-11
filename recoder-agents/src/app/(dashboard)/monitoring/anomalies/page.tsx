'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  TrendingUp,
  Eye,
  Check,
  X,
  Search,
  Info,
  Loader2,
  Skull,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAnomalies,
  useAnomalyStats,
  useUpdateAnomalyStatus,
  useRunAnomalyScan,
} from '@/hooks/monitoring/use-anomaly-detection';
import type { Anomaly, AnomalyFilters } from '@/lib/api/anomaly-detection';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

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
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    icon: AlertTriangle,
  },
  high: {
    label: 'High',
    color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
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
  acknowledged: { label: 'Acknowledged', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  resolved: { label: 'Resolved', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  dismissed: { label: 'Dismissed', color: 'bg-muted text-muted-foreground' },
} as const;

const TYPE_LABELS: Record<string, string> = {
  cost_spike: 'Cost Spike',
  run_surge: 'Run Surge',
  error_spike: 'Error Spike',
  latency_spike: 'Latency Spike',
  token_surge: 'Token Surge',
  unusual_hours: 'Unusual Hours',
};

const SUGGESTED_ACTIONS: Record<string, string> = {
  cost_spike: 'Review recent agent runs for unexpected model usage or high-cost operations. Consider adjusting cost limits or switching to a cheaper model.',
  run_surge: 'Check if a trigger or schedule is firing more frequently than expected. Verify there are no infinite loops in agent workflows.',
  error_spike: 'Inspect recent error logs for this agent. Common causes include API rate limits, invalid configurations, or downstream service outages.',
  latency_spike: 'Check if the agent is processing larger inputs or if the model provider is experiencing slowdowns. Consider timeout adjustments.',
  token_surge: 'Review conversation context sizes and check if the agent is sending unnecessarily large prompts. Consider enabling context compression.',
  unusual_hours: 'Verify that scheduled triggers are configured for the correct timezone. Check for unauthorized API key usage.',
};

// ============================================================================
// Stats Header
// ============================================================================

function StatsHeader() {
  const { data: stats, isLoading } = useAnomalyStats();
  const scanMutation = useRunAnomalyScan();

  const handleScan = () => {
    scanMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
        <h1 className="text-xl font-semibold text-foreground">Usage Anomalies</h1>
        <Button
          onClick={handleScan}
          disabled={scanMutation.isPending}
          size="sm"
          className="gap-2"
        >
          {scanMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Run Scan
        </Button>
      </div>

      {scanMutation.isSuccess && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          Scan complete: {scanMutation.data.anomalies_found} anomalies found.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {severities.map((sev) => {
          const config = SEVERITY_CONFIG[sev];
          const count = stats?.open_by_severity[sev] ?? 0;
          const Icon = config.icon;
          return (
            <Card key={sev}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{config.label}</p>
                  <p className="text-2xl font-bold mt-1">{count}</p>
                </div>
                <div className={cn('rounded-full p-2', config.color)}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {stats?.most_affected_agent && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Most affected agent:{' '}
              <span className="font-medium text-foreground">
                {stats.most_affected_agent.agent_name || stats.most_affected_agent.agent_id}
              </span>
              {' '}({stats.most_affected_agent.anomaly_count} open anomalies)
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Filter Bar
// ============================================================================

function FilterBar({
  filters,
  onFiltersChange,
}: {
  filters: AnomalyFilters;
  onFiltersChange: (filters: AnomalyFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Filters:</span>
      </div>

      <Select
        value={filters.status || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, status: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="acknowledged">Acknowledged</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
          <SelectItem value="dismissed">Dismissed</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.anomaly_type || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, anomaly_type: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="cost_spike">Cost Spike</SelectItem>
          <SelectItem value="run_surge">Run Surge</SelectItem>
          <SelectItem value="error_spike">Error Spike</SelectItem>
          <SelectItem value="latency_spike">Latency Spike</SelectItem>
          <SelectItem value="token_surge">Token Surge</SelectItem>
          <SelectItem value="unusual_hours">Unusual Hours</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.severity || 'all'}
        onValueChange={(v) => onFiltersChange({ ...filters, severity: v === 'all' ? undefined : v })}
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

      <Input
        placeholder="Agent ID..."
        value={filters.agent_id || ''}
        onChange={(e) =>
          onFiltersChange({ ...filters, agent_id: e.target.value || undefined })
        }
        className="w-[180px] h-8 text-xs"
      />
    </div>
  );
}

// ============================================================================
// Anomaly Row
// ============================================================================

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const [expanded, setExpanded] = useState(false);
  const updateMutation = useUpdateAnomalyStatus();

  const severityConfig = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.medium;
  const statusConfig = STATUS_CONFIG[anomaly.status] ?? STATUS_CONFIG.open;
  const SeverityIcon = severityConfig.icon;

  const handleStatusUpdate = (newStatus: string) => {
    updateMutation.mutate({ anomalyId: anomaly.id, status: newStatus });
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        <div className={cn('rounded-full p-1.5 flex-shrink-0', severityConfig.color)}>
          <SeverityIcon className="h-3.5 w-3.5" />
        </div>

        <Badge variant="outline" className="text-[10px] flex-shrink-0">
          {TYPE_LABELS[anomaly.anomaly_type] || anomaly.anomaly_type}
        </Badge>

        <span className="text-sm text-foreground flex-1 min-w-0 truncate">
          {anomaly.description}
        </span>

        {anomaly.agent_name && (
          <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:inline">
            {anomaly.agent_name}
          </span>
        )}

        {anomaly.current_value !== null && anomaly.baseline_value !== null && (
          <span className="text-xs text-muted-foreground flex-shrink-0 hidden md:inline">
            {anomaly.current_value.toFixed(2)} / {anomaly.baseline_value.toFixed(2)}
          </span>
        )}

        {anomaly.deviation_percent !== null && (
          <Badge variant="outline" className="text-[10px] flex-shrink-0 text-orange-600 dark:text-orange-400 border-orange-500/20">
            +{anomaly.deviation_percent.toFixed(1)}%
          </Badge>
        )}

        <Badge className={cn('text-[10px] flex-shrink-0', statusConfig.color)}>
          {statusConfig.label}
        </Badge>

        {anomaly.status === 'open' && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Acknowledge"
              disabled={updateMutation.isPending}
              onClick={() => handleStatusUpdate('acknowledged')}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Resolve"
              disabled={updateMutation.isPending}
              onClick={() => handleStatusUpdate('resolved')}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Dismiss"
              disabled={updateMutation.isPending}
              onClick={() => handleStatusUpdate('dismissed')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {anomaly.status === 'acknowledged' && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Resolve"
              disabled={updateMutation.isPending}
              onClick={() => handleStatusUpdate('resolved')}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Dismiss"
              disabled={updateMutation.isPending}
              onClick={() => handleStatusUpdate('dismissed')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t bg-muted/10 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Current Value:</span>{' '}
              <span className="font-medium">{anomaly.current_value?.toFixed(4) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Baseline Value:</span>{' '}
              <span className="font-medium">{anomaly.baseline_value?.toFixed(4) ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Deviation:</span>{' '}
              <span className="font-medium text-orange-600 dark:text-orange-400">
                {anomaly.deviation_percent !== null ? `+${anomaly.deviation_percent.toFixed(2)}%` : 'N/A'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-muted-foreground text-xs">Detected:</span>{' '}
            <span className="text-xs">{new Date(anomaly.detected_at).toLocaleString()}</span>
            {anomaly.resolved_at && (
              <>
                <span className="text-muted-foreground text-xs ml-4">Resolved:</span>{' '}
                <span className="text-xs">{new Date(anomaly.resolved_at).toLocaleString()}</span>
              </>
            )}
          </div>

          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Action</p>
            <p className="text-sm">
              {SUGGESTED_ACTIONS[anomaly.anomaly_type] || 'Review the anomaly details and investigate the root cause.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AnomaliesPage() {
  const [filters, setFilters] = useState<AnomalyFilters>({});
  const { data: anomalies, isLoading, error } = useAnomalies(filters);

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 pt-16 sm:pt-20">
      <StatsHeader />
      <FilterBar filters={filters} onFiltersChange={setFilters} />

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-destructive">
            Failed to load anomalies. Please try again.
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && anomalies && anomalies.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No anomalies detected</p>
            <p className="text-xs text-muted-foreground">
              Run a scan to check for usage anomalies, or adjust your filters.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && anomalies && anomalies.length > 0 && (
        <div className="space-y-2">
          {anomalies.map((anomaly) => (
            <AnomalyRow key={anomaly.id} anomaly={anomaly} />
          ))}
        </div>
      )}
    </div>
  );
}
