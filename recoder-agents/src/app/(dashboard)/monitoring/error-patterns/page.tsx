'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronRight,
  Fingerprint,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  TrendingUp,
  VolumeX,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useScanErrors,
  useErrorPatterns,
  useErrorPatternDetail,
  useUpdateErrorPattern,
  useErrorPatternStats,
} from '@/hooks/monitoring/use-error-patterns';
import type { ErrorPattern, ErrorPatternFilters } from '@/lib/api/error-patterns';

// ============================================================================
// Constants
// ============================================================================

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', dot: 'bg-red-500' },
  high: { label: 'High', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', dot: 'bg-orange-500' },
  medium: { label: 'Medium', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20', dot: 'bg-yellow-500' },
  low: { label: 'Low', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', dot: 'bg-blue-500' },
} as const;

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  investigating: { label: 'Investigating', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  resolved: { label: 'Resolved', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  muted: { label: 'Muted', color: 'bg-muted text-muted-foreground' },
} as const;

// ============================================================================
// Stats Cards
// ============================================================================

function StatsCards() {
  const { data: stats, isLoading } = useErrorPatternStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
            <div className="h-4 w-20 bg-muted rounded mb-2" />
            <div className="h-6 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const severityOrder: Array<keyof typeof SEVERITY_CONFIG> = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Active patterns */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-500/10">
          <Fingerprint className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Active Patterns</p>
          <p className="text-lg font-semibold tabular-nums">{stats?.active_count ?? 0}</p>
        </div>
      </div>

      {/* By severity */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-2">By Severity</p>
        <div className="flex items-center gap-2 flex-wrap">
          {severityOrder.map((sev) => {
            const count = stats?.by_severity?.[sev] ?? 0;
            if (count === 0) return null;
            return (
              <span
                key={sev}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium border',
                  SEVERITY_CONFIG[sev].color
                )}
              >
                {count} {SEVERITY_CONFIG[sev].label}
              </span>
            );
          })}
          {(stats?.active_count ?? 0) === 0 && (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
      </div>

      {/* Most frequent */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Most Frequent</p>
          <p className="text-sm font-semibold truncate">
            {stats?.most_frequent?.[0]?.pattern_name ?? '--'}
          </p>
        </div>
      </div>

      {/* Trending */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-orange-500/10">
          <ArrowUpRight className="h-5 w-5 text-orange-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Trending (24h)</p>
          <p className="text-lg font-semibold tabular-nums">{stats?.trending?.length ?? 0}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Filter Bar
// ============================================================================

function FilterBar({
  filters,
  setFilters,
  onScan,
  isScanning,
}: {
  filters: ErrorPatternFilters;
  setFilters: (f: ErrorPatternFilters) => void;
  onScan: () => void;
  isScanning: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Search className="h-4 w-4 text-muted-foreground shrink-0" />

      {/* Status filter */}
      <select
        value={filters.status ?? ''}
        onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Status</option>
        <option value="active">Active</option>
        <option value="investigating">Investigating</option>
        <option value="resolved">Resolved</option>
        <option value="muted">Muted</option>
      </select>

      {/* Severity filter */}
      <select
        value={filters.severity ?? ''}
        onChange={(e) => setFilters({ ...filters, severity: e.target.value || undefined })}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Severity</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <div className="flex-1" />

      <button
        onClick={onScan}
        disabled={isScanning}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        {isScanning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Scan Now
      </button>
    </div>
  );
}

// ============================================================================
// Pattern Row
// ============================================================================

function PatternRow({ pattern }: { pattern: ErrorPattern }) {
  const [expanded, setExpanded] = useState(false);
  const updateMutation = useUpdateErrorPattern();
  const [resolution, setResolution] = useState(pattern.resolution ?? '');

  const sevConfig = SEVERITY_CONFIG[pattern.severity] ?? SEVERITY_CONFIG.medium;
  const statusConfig = STATUS_CONFIG[pattern.status] ?? STATUS_CONFIG.active;

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateMutation.mutateAsync({
        patternId: pattern.id,
        data: { status: newStatus },
      });
    } catch {
      // Error handled by mutation
    }
  };

  const handleSaveResolution = async () => {
    try {
      await updateMutation.mutateAsync({
        patternId: pattern.id,
        data: { resolution: resolution || undefined },
      });
    } catch {
      // Error handled by mutation
    }
  };

  // Compute simple trend arrow based on first_seen vs last_seen proximity
  const lastSeen = new Date(pattern.last_seen_at);
  const hoursAgo = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);
  const isTrending = hoursAgo < 24;

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center">
          {/* Severity badge */}
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium border shrink-0',
              sevConfig.color
            )}
          >
            {sevConfig.label}
          </span>

          {/* Pattern name */}
          <div className="min-w-0">
            <span className="text-sm font-medium truncate block">{pattern.pattern_name}</span>
            <span className="text-xs text-muted-foreground truncate block">
              {pattern.affected_agents.length} agent{pattern.affected_agents.length !== 1 ? 's' : ''} affected
            </span>
          </div>

          {/* Occurrence count */}
          <span className="text-sm font-semibold tabular-nums shrink-0 flex items-center gap-1">
            {pattern.occurrence_count}
            {isTrending ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-orange-500" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>

          {/* Status */}
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
              statusConfig.color
            )}
          >
            {statusConfig.label}
          </span>

          {/* Last seen */}
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {lastSeen.toLocaleDateString()}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
          {/* Error signature */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Error Signature</p>
            <pre className="text-xs bg-background border border-border rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {pattern.error_signature}
            </pre>
          </div>

          {/* Sample errors */}
          {pattern.sample_errors && pattern.sample_errors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Sample Errors ({pattern.sample_errors.length})
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pattern.sample_errors.map((sample, idx) => (
                  <div key={idx} className="bg-background border border-border rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">
                        Agent: {sample.agent_id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(sample.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap break-all text-muted-foreground">
                      {sample.error.slice(0, 500)}
                      {sample.error.length > 500 && '...'}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolution */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Resolution
            </label>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={2}
              placeholder="How this pattern was resolved..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              onClick={handleSaveResolution}
              disabled={updateMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-8 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Resolution
            </button>

            <div className="h-4 w-px bg-border" />

            {/* Status workflow buttons */}
            {pattern.status === 'active' && (
              <button
                onClick={() => handleStatusChange('investigating')}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 px-3 h-8 text-sm font-medium hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
              >
                <Shield className="h-3.5 w-3.5" />
                Investigate
              </button>
            )}

            {(pattern.status === 'active' || pattern.status === 'investigating') && (
              <>
                <button
                  onClick={() => handleStatusChange('resolved')}
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 px-3 h-8 text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Resolve
                </button>
                <button
                  onClick={() => handleStatusChange('muted')}
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted text-muted-foreground border border-border px-3 h-8 text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  <VolumeX className="h-3.5 w-3.5" />
                  Mute
                </button>
              </>
            )}

            {(pattern.status === 'resolved' || pattern.status === 'muted') && (
              <button
                onClick={() => handleStatusChange('active')}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 px-3 h-8 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Reactivate
              </button>
            )}

            {/* Affected agents list */}
            {pattern.affected_agents.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                Agents: {pattern.affected_agents.slice(0, 3).join(', ')}
                {pattern.affected_agents.length > 3 && ` +${pattern.affected_agents.length - 3} more`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ onScan, isScanning }: { onScan: () => void; isScanning: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Fingerprint className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No error patterns detected</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        Scan recent errors to detect recurring patterns and group them for investigation.
      </p>
      <button
        onClick={onScan}
        disabled={isScanning}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isScanning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Scan for Patterns
      </button>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function ErrorPatternsPage() {
  const [filters, setFilters] = useState<ErrorPatternFilters>({});
  const scanMutation = useScanErrors();
  const { data: patterns, isLoading } = useErrorPatterns(filters);

  const handleScan = () => {
    scanMutation.mutate();
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Fingerprint className="h-6 w-6" />
            Error Patterns
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Detect, track, and resolve recurring error patterns across your agents.
          </p>
        </div>

        {/* Scan result toast */}
        {scanMutation.isSuccess && scanMutation.data && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm">
              Scan complete: {scanMutation.data.patterns_found} pattern(s) found,{' '}
              {scanMutation.data.patterns_created} new, {scanMutation.data.patterns_updated} updated.
            </span>
            <button
              onClick={() => scanMutation.reset()}
              className="ml-auto p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Stats */}
        <StatsCards />

        {/* Filter bar */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          onScan={handleScan}
          isScanning={scanMutation.isPending}
        />

        {/* Pattern list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading error patterns...</span>
            </div>
          ) : patterns && patterns.length > 0 ? (
            patterns.map((pattern) => (
              <PatternRow key={pattern.id} pattern={pattern} />
            ))
          ) : (
            <EmptyState onScan={handleScan} isScanning={scanMutation.isPending} />
          )}
        </div>
      </div>
    </div>
  );
}
