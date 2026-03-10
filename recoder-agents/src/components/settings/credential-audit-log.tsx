'use client';

import { useState } from 'react';
import {
  Shield,
  Key,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  Loader2,
  Activity,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useCredentialAuditLog,
  useCredentialAuditSummary,
  useCredentialAnomalies,
} from '@/hooks/settings/use-credential-audit';
import type { AuditLogEntry, AnomalyEntry } from '@/lib/api/credential-audit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskKey(key: string): string {
  if (key.length <= 8) return key.slice(0, 2) + '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

function accessTypeIcon(type: string) {
  switch (type) {
    case 'read':
      return Eye;
    case 'create':
      return Plus;
    case 'update':
      return Pencil;
    case 'delete':
      return Trash2;
    case 'use_in_run':
      return Play;
    default:
      return Key;
  }
}

function accessTypeBadgeColor(type: string): string {
  switch (type) {
    case 'read':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    case 'create':
      return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
    case 'update':
      return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
    case 'delete':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'use_in_run':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function anomalyTypeColor(type: string): string {
  switch (type) {
    case 'high_frequency':
      return 'text-amber-600 dark:text-amber-400';
    case 'repeated_failures':
      return 'text-red-600 dark:text-red-400';
    case 'odd_hours':
      return 'text-purple-600 dark:text-purple-400';
    default:
      return 'text-muted-foreground';
  }
}

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function SummaryCards() {
  const { data: summary, isLoading } = useCredentialAuditSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-4 animate-pulse"
          >
            <div className="h-4 w-20 bg-muted rounded mb-2" />
            <div className="h-7 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Activity className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Accesses</p>
          <p className="text-lg font-semibold tabular-nums">
            {summary?.total_accesses ?? 0}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Key className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unique Keys</p>
          <p className="text-lg font-semibold tabular-nums">
            {summary?.unique_keys ?? 0}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
          <XCircle className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Failed Attempts</p>
          <p className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
            {summary?.failed_count ?? 0}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Anomalies</p>
          <AnomalyCount />
        </div>
      </div>
    </div>
  );
}

function AnomalyCount() {
  const { data: anomalies } = useCredentialAnomalies();
  const count = anomalies?.length ?? 0;
  return (
    <p
      className={cn(
        'text-lg font-semibold tabular-nums',
        count > 0 && 'text-amber-600 dark:text-amber-400'
      )}
    >
      {count}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Anomaly Alerts
// ---------------------------------------------------------------------------

function AnomalyAlerts() {
  const { data: anomalies, isLoading } = useCredentialAnomalies();

  if (isLoading || !anomalies || anomalies.length === 0) return null;

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Anomaly Alerts
        </CardTitle>
        <CardDescription>
          Unusual credential access patterns detected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {anomalies.map((anomaly: AnomalyEntry, idx: number) => (
          <div
            key={`${anomaly.anomaly_type}-${anomaly.credential_key}-${idx}`}
            className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
          >
            <AlertTriangle
              className={cn('h-4 w-4 mt-0.5 shrink-0', anomalyTypeColor(anomaly.anomaly_type))}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm">{anomaly.description}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {anomaly.anomaly_type.replace('_', ' ')}
                </Badge>
                {anomaly.last_seen && (
                  <span className="text-xs text-muted-foreground">
                    Last: {new Date(anomaly.last_seen).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audit Log Table
// ---------------------------------------------------------------------------

function AuditLogTable() {
  const [accessTypeFilter, setAccessTypeFilter] = useState<string>('');
  const { data: entries, isLoading } = useCredentialAuditLog({
    access_type: accessTypeFilter || undefined,
    limit: 100,
  });

  const accessTypes = ['', 'read', 'create', 'update', 'delete', 'use_in_run'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Access Log
            </CardTitle>
            <CardDescription>
              Recent credential access events.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              className="text-xs rounded-md border border-border bg-background px-2 py-1.5"
              value={accessTypeFilter}
              onChange={(e) => setAccessTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              {accessTypes
                .filter((t) => t)
                .map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ')}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading audit log...
            </span>
          </div>
        ) : entries && entries.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_120px_100px_80px_80px_140px] gap-2 px-4 py-2 bg-muted/30 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>Key</span>
              <span>Agent</span>
              <span>Type</span>
              <span>Status</span>
              <span>IP</span>
              <span>Time</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {entries.map((entry: AuditLogEntry) => {
                const Icon = accessTypeIcon(entry.access_type);
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'grid grid-cols-[1fr_120px_100px_80px_80px_140px] gap-2 px-4 py-2.5 items-center text-sm',
                      !entry.success && 'bg-red-500/5'
                    )}
                  >
                    <span className="truncate font-mono text-xs">
                      {maskKey(entry.credential_key)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.agent_id
                        ? entry.agent_id.slice(0, 8) + '...'
                        : '--'}
                    </span>
                    <span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs gap-1',
                          accessTypeBadgeColor(entry.access_type)
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {entry.access_type.replace('_', ' ')}
                      </Badge>
                    </span>
                    <span>
                      {entry.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {entry.ip_address || '--'}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium mb-1">No access logs</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Credential access events will appear here as they occur.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CredentialAuditLog() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Credential Vault Audit
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor access to your credential vault for security auditing.
        </p>
      </div>

      <SummaryCards />
      <AnomalyAlerts />
      <AuditLogTable />
    </div>
  );
}
