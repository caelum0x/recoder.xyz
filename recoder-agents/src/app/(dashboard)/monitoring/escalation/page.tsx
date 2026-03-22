'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  List,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePolicies,
  useCreatePolicy,
  useUpdatePolicy,
  useDeletePolicy,
  useIncidents,
  useIncidentDetail,
  useCreateIncident,
  useAcknowledgeIncident,
  useEscalateIncident,
  useResolveIncident,
  useEscalationStats,
} from '@/hooks/monitoring/use-alert-escalation';
import type {
  EscalationIncident,
  EscalationPolicy,
  CreatePolicyData,
  IncidentFilters,
} from '@/lib/api/alert-escalation';

// ============================================================================
// Constants
// ============================================================================

const SEVERITY_CONFIG = {
  critical: {
    label: 'Critical',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    dot: 'bg-red-500',
  },
  high: {
    label: 'High',
    badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    dot: 'bg-orange-500',
  },
  medium: {
    label: 'Medium',
    badge: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    dot: 'bg-yellow-500',
  },
  low: {
    label: 'Low',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    dot: 'bg-blue-500',
  },
} as const;

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  acknowledged: { label: 'Acknowledged', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  escalated: { label: 'Escalated', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  resolved: { label: 'Resolved', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  closed: { label: 'Closed', color: 'bg-muted text-muted-foreground' },
} as const;

// ============================================================================
// Stats Row
// ============================================================================

function StatsRow() {
  const { data: stats, isLoading } = useEscalationStats();

  const cards = [
    {
      label: 'Open Incidents',
      value: isLoading ? '—' : String(stats?.open_count ?? 0),
      icon: AlertTriangle,
      accent: 'text-red-500',
    },
    {
      label: 'Avg Resolution (min)',
      value: isLoading
        ? '—'
        : stats?.avg_resolution_minutes != null
        ? String(stats.avg_resolution_minutes)
        : 'N/A',
      icon: Clock,
      accent: 'text-blue-500',
    },
    {
      label: 'Escalation Rate',
      value: isLoading
        ? '—'
        : `${((stats?.escalation_rate ?? 0) * 100).toFixed(1)}%`,
      icon: TrendingUp,
      accent: 'text-orange-500',
    },
    {
      label: 'Critical Open',
      value: isLoading ? '—' : String(stats?.by_severity?.critical ?? 0),
      icon: Bell,
      accent: 'text-red-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map(({ label, value, icon: Icon, accent }) => (
        <div
          key={label}
          className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1"
        >
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Icon className={cn('h-4 w-4', accent)} />
            {label}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Create Incident Dialog
// ============================================================================

function CreateIncidentDialog({
  open,
  onClose,
  policies,
}: {
  open: boolean;
  onClose: () => void;
  policies: EscalationPolicy[];
}) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [source, setSource] = useState('');
  const [policyId, setPolicyId] = useState('');
  const createIncident = useCreateIncident();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createIncident.mutateAsync({
      title,
      severity,
      source: source || undefined,
      policy_id: policyId || undefined,
    });
    setTitle('');
    setSeverity('medium');
    setSource('');
    setPolicyId('');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Create Incident</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Title *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Incident title"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as typeof severity)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Source</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. agent-monitor, webhook"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Policy</label>
            <select
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— None —</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.policy_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createIncident.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {createIncident.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Policy Manager
// ============================================================================

function CreatePolicyDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stepsJson, setStepsJson] = useState(
    JSON.stringify(
      [{ step: 1, action: 'notify', notify_after_minutes: 15 }],
      null,
      2
    )
  );
  const [jsonError, setJsonError] = useState('');
  const createPolicy = useCreatePolicy();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let steps;
    try {
      steps = JSON.parse(stepsJson);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON');
      return;
    }
    await createPolicy.mutateAsync({
      policy_name: name,
      description: description || undefined,
      escalation_steps: steps,
    });
    setName('');
    setDescription('');
    setStepsJson(JSON.stringify([{ step: 1, action: 'notify', notify_after_minutes: 15 }], null, 2));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Create Policy</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Policy Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Critical Alert Policy"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Escalation Steps{' '}
              <span className="text-muted-foreground font-normal">
                (JSON array of {'{step, action, notify_after_minutes}'})
              </span>
            </label>
            <textarea
              value={stepsJson}
              onChange={(e) => setStepsJson(e.target.value)}
              rows={6}
              className={cn(
                'w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono',
                jsonError ? 'border-red-500' : 'border-border'
              )}
            />
            {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createPolicy.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {createPolicy.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Create Policy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PoliciesPanel() {
  const { data: policies, isLoading } = usePolicies();
  const deletePolicy = useDeletePolicy();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Escalation Policies</span>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3 w-3" />
          New Policy
        </button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !policies?.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">No policies created yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs">
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Steps</th>
              <th className="text-left px-4 py-2">Active</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{policy.policy_name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {Array.isArray(policy.escalation_steps) ? policy.escalation_steps.length : 0} steps
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      policy.is_active
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {policy.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => deletePolicy.mutate(policy.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete policy"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <CreatePolicyDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ============================================================================
// Timeline Sheet
// ============================================================================

function TimelineSheet({
  incidentId,
  onClose,
}: {
  incidentId: string;
  onClose: () => void;
}) {
  const { data: incident, isLoading } = useIncidentDetail(incidentId);

  const ACTION_LABELS: Record<string, string> = {
    acknowledge: 'Acknowledged',
    escalate: 'Escalated',
    resolve: 'Resolved',
    notify: 'Notified',
    comment: 'Comment',
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-card border-l border-border h-full overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Incident Timeline</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {incident && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-medium">{incident.title}</p>
                <p className="text-muted-foreground text-xs">
                  Created {new Date(incident.created_at).toLocaleString()}
                </p>
              </div>
            )}
            {!incident?.actions?.length ? (
              <p className="text-sm text-muted-foreground">No actions recorded yet.</p>
            ) : (
              <div className="relative pl-4">
                <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                {incident.actions.map((action, idx) => (
                  <div key={action.id} className="relative mb-4">
                    <div className="absolute -left-3 top-1 h-2 w-2 rounded-full bg-primary border-2 border-card" />
                    <div className="pl-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {ACTION_LABELS[action.action_type] ?? action.action_type}
                        </span>
                        {action.step_index > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Step {action.step_index}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(action.performed_at).toLocaleString()}
                      </p>
                      {action.notes && (
                        <p className="text-xs text-foreground mt-0.5 italic">"{action.notes}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Incident Card
// ============================================================================

function IncidentCard({
  incident,
  onViewTimeline,
}: {
  incident: EscalationIncident;
  onViewTimeline: (id: string) => void;
}) {
  const acknowledge = useAcknowledgeIncident();
  const escalate = useEscalateIncident();
  const resolve = useResolveIncident();

  const severity = SEVERITY_CONFIG[incident.severity as keyof typeof SEVERITY_CONFIG];
  const status = STATUS_CONFIG[incident.status as keyof typeof STATUS_CONFIG];

  const canAcknowledge = incident.status === 'open';
  const canEscalate = incident.status === 'open' || incident.status === 'acknowledged';
  const canResolve =
    incident.status !== 'resolved' && incident.status !== 'closed';

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {severity && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                  severity.badge
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', severity.dot)} />
                {severity.label}
              </span>
            )}
            {status && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  status.color
                )}
              >
                {status.label}
              </span>
            )}
          </div>
          <p className="font-medium text-sm truncate">{incident.title}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {incident.source && <span>Source: {incident.source}</span>}
            <span>Step {incident.current_step}</span>
            <span>{new Date(incident.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onViewTimeline(incident.id)}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"
        >
          <List className="h-3 w-3" />
          View Timeline
        </button>
        {canAcknowledge && (
          <button
            onClick={() => acknowledge.mutate(incident.id)}
            disabled={acknowledge.isPending}
            className="flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1 text-xs hover:bg-blue-500/20 disabled:opacity-50"
          >
            {acknowledge.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Acknowledge
          </button>
        )}
        {canEscalate && (
          <button
            onClick={() => escalate.mutate({ id: incident.id })}
            disabled={escalate.isPending}
            className="flex items-center gap-1 rounded-lg border border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2.5 py-1 text-xs hover:bg-orange-500/20 disabled:opacity-50"
          >
            {escalate.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Escalate
          </button>
        )}
        {canResolve && (
          <button
            onClick={() => resolve.mutate({ id: incident.id })}
            disabled={resolve.isPending}
            className="flex items-center gap-1 rounded-lg border border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400 px-2.5 py-1 text-xs hover:bg-green-500/20 disabled:opacity-50"
          >
            {resolve.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Resolve
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function AlertEscalationPage() {
  const [filters, setFilters] = useState<IncidentFilters>({});
  const [createIncidentOpen, setCreateIncidentOpen] = useState(false);
  const [showPolicies, setShowPolicies] = useState(false);
  const [timelineIncidentId, setTimelineIncidentId] = useState<string | null>(null);

  const { data: incidents, isLoading } = useIncidents(filters);
  const { data: policies } = usePolicies();

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Alert Escalation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage escalation policies and incident lifecycle
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPolicies((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Settings2 className="h-4 w-4" />
            Manage Policies
          </button>
          <button
            onClick={() => setCreateIncidentOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Incident
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsRow />

      {/* Policies Panel */}
      {showPolicies && (
        <div className="mb-2">
          <PoliciesPanel />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value || undefined }))
          }
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={filters.severity ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, severity: e.target.value || undefined }))
          }
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Incident List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !incidents?.length ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No incidents found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onViewTimeline={setTimelineIncidentId}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateIncidentDialog
        open={createIncidentOpen}
        onClose={() => setCreateIncidentOpen(false)}
        policies={policies ?? []}
      />
      {timelineIncidentId && (
        <TimelineSheet
          incidentId={timelineIncidentId}
          onClose={() => setTimelineIncidentId(null)}
        />
      )}
    </div>
  );
}
