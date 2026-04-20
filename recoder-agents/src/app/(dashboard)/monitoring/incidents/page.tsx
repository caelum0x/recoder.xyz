'use client';

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useIncidents,
  useIncidentStats,
  useCreateIncident,
  useUpdateIncident,
} from '@/hooks/monitoring/use-incidents';
import { useAgents } from '@/hooks/agents/use-agents';
import { useAuth } from '@/components/AuthProvider';
import type { Incident, IncidentFilters } from '@/lib/api/incidents';

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
  open: { label: 'Open', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  investigating: { label: 'Investigating', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  resolved: { label: 'Resolved', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  dismissed: { label: 'Dismissed', color: 'bg-muted text-muted-foreground' },
} as const;

// ============================================================================
// Stats header
// ============================================================================

function StatsHeader() {
  const { data: stats, isLoading } = useIncidentStats();

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
      {/* Total open */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-500/10">
          <ShieldAlert className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Open Incidents</p>
          <p className="text-lg font-semibold tabular-nums">{stats?.total_open ?? 0}</p>
        </div>
      </div>

      {/* Open by severity */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-2">By Severity</p>
        <div className="flex items-center gap-2 flex-wrap">
          {severityOrder.map((sev) => {
            const count = stats?.open_by_severity?.[sev] ?? 0;
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
          {(stats?.total_open ?? 0) === 0 && (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
      </div>

      {/* Avg resolution time */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Avg Resolution</p>
          <p className="text-lg font-semibold tabular-nums">
            {stats?.avg_resolution_hours != null
              ? `${stats.avg_resolution_hours}h`
              : '--'}
          </p>
        </div>
      </div>

      {/* Most affected agent */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Most Affected</p>
          <p className="text-sm font-semibold truncate">
            {stats?.most_affected_agents?.[0]?.agent_name
              ?? stats?.most_affected_agents?.[0]?.agent_id
              ?? '--'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Filter bar
// ============================================================================

function FilterBar({
  filters,
  setFilters,
  onNewIncident,
}: {
  filters: IncidentFilters;
  setFilters: (f: IncidentFilters) => void;
  onNewIncident: () => void;
}) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data: agentsData } = useAgents(
    { limit: 100, sort_by: 'name', sort_order: 'asc' },
    { enabled: !!user && !isAuthLoading }
  );
  const agents = agentsData?.agents ?? [];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

      {/* Status filter */}
      <select
        value={filters.status ?? ''}
        onChange={(e) =>
          setFilters({ ...filters, status: e.target.value || undefined })
        }
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Status</option>
        <option value="open">Open</option>
        <option value="investigating">Investigating</option>
        <option value="resolved">Resolved</option>
        <option value="dismissed">Dismissed</option>
      </select>

      {/* Severity filter */}
      <select
        value={filters.severity ?? ''}
        onChange={(e) =>
          setFilters({ ...filters, severity: e.target.value || undefined })
        }
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Severity</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {/* Agent filter */}
      <select
        value={filters.agent_id ?? ''}
        onChange={(e) =>
          setFilters({ ...filters, agent_id: e.target.value || undefined })
        }
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-w-[200px]"
      >
        <option value="">All Agents</option>
        {agents.map((agent) => (
          <option key={agent.agent_id} value={agent.agent_id}>
            {agent.name || agent.agent_id}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      <button
        onClick={onNewIncident}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Incident
      </button>
    </div>
  );
}

// ============================================================================
// New Incident Dialog
// ============================================================================

function NewIncidentDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data: agentsData } = useAgents(
    { limit: 100, sort_by: 'name', sort_order: 'asc' },
    { enabled: open && !!user && !isAuthLoading }
  );
  const agents = agentsData?.agents ?? [];
  const createMutation = useCreateIncident();

  const [agentId, setAgentId] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId || !title.trim()) return;

    try {
      await createMutation.mutateAsync({
        agent_id: agentId,
        severity,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      // Reset and close
      setAgentId('');
      setSeverity('medium');
      setTitle('');
      setDescription('');
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Incident</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Agent */}
          <div>
            <label className="block text-sm font-medium mb-1">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select an agent...</option>
              {agents.map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agent.name || agent.agent_id}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Brief description of the incident..."
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detailed description of what happened..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-md border border-input bg-background px-4 h-9 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !agentId || !title.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Incident
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Incident row (expandable)
// ============================================================================

function IncidentRow({ incident }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false);
  const updateMutation = useUpdateIncident();
  const [rootCause, setRootCause] = useState(incident.root_cause ?? '');
  const [resolution, setResolution] = useState(incident.resolution ?? '');

  const sevConfig = SEVERITY_CONFIG[incident.severity] ?? SEVERITY_CONFIG.medium;
  const statusConfig = STATUS_CONFIG[incident.status] ?? STATUS_CONFIG.open;

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateMutation.mutateAsync({
        incidentId: incident.id,
        data: { status: newStatus },
      });
    } catch {
      // Error handled by mutation
    }
  };

  const handleSaveDetails = async () => {
    try {
      await updateMutation.mutateAsync({
        incidentId: incident.id,
        data: {
          root_cause: rootCause || undefined,
          resolution: resolution || undefined,
        },
      });
    } catch {
      // Error handled by mutation
    }
  };

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

        <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center">
          {/* Severity badge */}
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium border shrink-0',
              sevConfig.color
            )}
          >
            {sevConfig.label}
          </span>

          {/* Title + agent */}
          <div className="min-w-0">
            <span className="text-sm font-medium truncate block">{incident.title}</span>
            <span className="text-xs text-muted-foreground truncate block">
              {incident.agent_name || incident.agent_id}
            </span>
          </div>

          {/* Status */}
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
              statusConfig.color
            )}
          >
            {statusConfig.label}
          </span>

          {/* Auto-created badge */}
          {incident.auto_created && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              Auto
            </span>
          )}

          {/* Date */}
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {new Date(incident.created_at).toLocaleDateString()}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
          {/* Description */}
          {incident.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{incident.description}</p>
            </div>
          )}

          {/* Run link */}
          {incident.run_id && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Run ID</p>
              <p className="text-sm font-mono text-muted-foreground">{incident.run_id}</p>
            </div>
          )}

          {/* Root cause */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Root Cause
            </label>
            <textarea
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              rows={2}
              placeholder="What caused this incident..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Resolution
            </label>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={2}
              placeholder="How was this resolved..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {/* Save details */}
            <button
              onClick={handleSaveDetails}
              disabled={updateMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-8 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Details
            </button>

            <div className="h-4 w-px bg-border" />

            {/* Status workflow buttons */}
            {incident.status === 'open' && (
              <button
                onClick={() => handleStatusChange('investigating')}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 px-3 h-8 text-sm font-medium hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
              >
                <Shield className="h-3.5 w-3.5" />
                Investigate
              </button>
            )}

            {(incident.status === 'open' || incident.status === 'investigating') && (
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
                  onClick={() => handleStatusChange('dismissed')}
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted text-muted-foreground border border-border px-3 h-8 text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  <ShieldX className="h-3.5 w-3.5" />
                  Dismiss
                </button>
              </>
            )}

            {(incident.status === 'resolved' || incident.status === 'dismissed') && (
              <button
                onClick={() => handleStatusChange('open')}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 px-3 h-8 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Reopen
              </button>
            )}

            {/* Resolved at timestamp */}
            {incident.resolved_at && (
              <span className="text-xs text-muted-foreground ml-auto">
                Resolved {new Date(incident.resolved_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <ShieldCheck className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No incidents</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        No incidents match the current filters. Create a new incident to start tracking agent issues.
      </p>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function IncidentsPage() {
  const [filters, setFilters] = useState<IncidentFilters>({});
  const [showNewDialog, setShowNewDialog] = useState(false);

  const { data: incidents, isLoading } = useIncidents(filters);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            Incidents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and manage agent incidents, failed runs, and anomalies.
          </p>
        </div>

        {/* Stats header */}
        <StatsHeader />

        {/* Filter bar */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          onNewIncident={() => setShowNewDialog(true)}
        />

        {/* Incident list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading incidents...</span>
            </div>
          ) : incidents && incidents.length > 0 ? (
            incidents.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} />
            ))
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* New incident dialog */}
      <NewIncidentDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
      />
    </div>
  );
}
