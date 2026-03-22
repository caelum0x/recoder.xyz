'use client';

import React, { useState, useMemo } from 'react';
import {
  Activity,
  Bot,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Filter,
  Hash,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Shield,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  useAuditEvents,
  useAuditStats,
  useLogEvent,
  useRetentionPolicy,
  useUpdateRetentionPolicy,
  useCleanupAuditEvents,
} from '@/hooks/agents/use-agent-audit-log';
import type { AuditEvent, AuditFilters } from '@/lib/api/agent-audit-log';

// ============================================================================
// Stat Card
// ============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className={cn('h-4 w-4', accent)} />
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ============================================================================
// Stats Row
// ============================================================================

function StatsRow() {
  const { data: stats, isLoading } = useAuditStats();

  const today = new Date().toISOString().slice(0, 10);
  const eventsToday = useMemo(() => {
    if (!stats) return 0;
    const entry = stats.events_per_day.find((d) => d.date === today);
    return entry?.count ?? 0;
  }, [stats, today]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard
        label="Total Events"
        value={isLoading ? '—' : String(stats?.total_events ?? 0)}
        icon={ClipboardList}
        accent="text-blue-500"
      />
      <StatCard
        label="Event Types"
        value={isLoading ? '—' : String(Object.keys(stats?.by_event_type ?? {}).length)}
        icon={Hash}
        accent="text-purple-500"
      />
      <StatCard
        label="Agents Audited"
        value={isLoading ? '—' : String(Object.keys(stats?.by_agent ?? {}).length)}
        icon={Bot}
        accent="text-orange-500"
      />
      <StatCard
        label="Events Today"
        value={isLoading ? '—' : String(eventsToday)}
        icon={Activity}
        accent="text-green-500"
      />
    </div>
  );
}

// ============================================================================
// Activity Chart
// ============================================================================

function ActivityChart() {
  const { data: stats, isLoading } = useAuditStats();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 h-52 animate-pulse flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const data = stats?.events_per_day ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium mb-4">Events per Day (last 7 days)</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
            className="text-muted-foreground"
          />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Log Event Dialog
// ============================================================================

function LogEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [eventType, setEventType] = useState('');
  const [action, setAction] = useState('');
  const [agentId, setAgentId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [resourceId, setResourceId] = useState('');
  const logEvent = useLogEvent();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await logEvent.mutateAsync({
      event_type: eventType,
      action,
      agent_id: agentId || undefined,
      resource_type: resourceType || undefined,
      resource_id: resourceId || undefined,
    });
    setEventType('');
    setAction('');
    setAgentId('');
    setResourceType('');
    setResourceId('');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Log Audit Event</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Event Type *</label>
            <input
              required
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. config_change, run_start"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Action *</label>
            <input
              required
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. create, update, delete"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Agent ID</label>
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Resource Type</label>
              <input
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="e.g. agent, thread"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Resource ID</label>
              <input
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="UUID"
              />
            </div>
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
              disabled={logEvent.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {logEvent.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Log Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Event Detail Sheet
// ============================================================================

function EventDetailSheet({
  event,
  onClose,
}: {
  event: AuditEvent;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-card border-l border-border h-full overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Event Detail</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          <dl className="space-y-2">
            {[
              ['ID', event.id],
              ['Event Type', event.event_type],
              ['Action', event.action],
              ['Actor', event.actor],
              ['Agent ID', event.agent_id ?? '—'],
              ['Resource Type', event.resource_type ?? '—'],
              ['Resource ID', event.resource_id ?? '—'],
              ['IP Address', event.ip_address ?? '—'],
              ['User Agent', event.user_agent ?? '—'],
              ['Created At', new Date(event.created_at).toLocaleString()],
            ].map(([k, v]) => (
              <div key={k as string} className="flex gap-3">
                <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Old Values</p>
              <pre className="rounded-lg border border-border bg-muted/30 p-3 text-xs overflow-x-auto">
                {JSON.stringify(event.old_values, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">New Values</p>
              <pre className="rounded-lg border border-border bg-muted/30 p-3 text-xs overflow-x-auto">
                {JSON.stringify(event.new_values, null, 2)}
              </pre>
            </div>
          </div>

          {Object.keys(event.metadata).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Metadata</p>
              <pre className="rounded-lg border border-border bg-muted/30 p-3 text-xs overflow-x-auto">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Retention Settings Panel
// ============================================================================

function RetentionPanel() {
  const [open, setOpen] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const { data: policy, isLoading } = useRetentionPolicy();
  const updateRetention = useUpdateRetentionPolicy();
  const cleanup = useCleanupAuditEvents();

  const [days, setDays] = useState(90);
  const [exportFirst, setExportFirst] = useState(false);

  // sync from server
  React.useEffect(() => {
    if (policy) {
      setDays(policy.retention_days);
      setExportFirst(policy.export_before_delete ?? false);
    }
  }, [policy]);

  const handleSave = async () => {
    await updateRetention.mutateAsync({ retention_days: days, export_before_delete: exportFirst });
  };

  const handleCleanup = async () => {
    if (!confirmCleanup) {
      setConfirmCleanup(true);
      return;
    }
    await cleanup.mutateAsync();
    setConfirmCleanup(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          Retention Settings
        </div>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Retention Days</label>
                  <span className="text-sm tabular-nums font-semibold">{days} days</span>
                </div>
                <input
                  type="range"
                  min={7}
                  max={365}
                  step={1}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>7 days</span>
                  <span>365 days</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Export before delete</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={exportFirst}
                  onClick={() => setExportFirst((v) => !v)}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                    exportFirst ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform shadow',
                      exportFirst ? 'translate-x-4' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={updateRetention.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateRetention.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Save
                </button>
                <button
                  onClick={handleCleanup}
                  disabled={cleanup.isPending}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50',
                    confirmCleanup
                      ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'
                      : 'border-border hover:bg-muted'
                  )}
                >
                  {cleanup.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  {confirmCleanup ? 'Confirm Cleanup?' : 'Run Cleanup'}
                </button>
                {confirmCleanup && (
                  <button
                    onClick={() => setConfirmCleanup(false)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Cancel
                  </button>
                )}
                {cleanup.data && (
                  <span className="text-xs text-muted-foreground">
                    Deleted {cleanup.data.deleted_count} events
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Event Table Row
// ============================================================================

const EVENT_TYPE_COLORS: Record<string, string> = {
  config_change: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  run_start: 'bg-green-500/10 text-green-600 dark:text-green-400',
  run_end: 'bg-green-500/10 text-green-600 dark:text-green-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
  access: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  delete: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function EventTypeBadge({ type }: { type: string }) {
  const color = EVENT_TYPE_COLORS[type] ?? 'bg-muted text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        color
      )}
    >
      {type}
    </span>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function AgentAuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [logEventOpen, setLogEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const { data: events, isLoading } = useAuditEvents(filters);

  const handleFilterChange = (key: keyof AuditFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agent Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track all agent actions and configuration changes
          </p>
        </div>
        <button
          onClick={() => setLogEventOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Log Event
        </button>
      </div>

      {/* Stats */}
      <StatsRow />

      {/* Chart */}
      <ActivityChart />

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filters:
        </div>
        <input
          placeholder="Agent ID"
          value={filters.agent_id ?? ''}
          onChange={(e) => handleFilterChange('agent_id', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm w-40"
        />
        <input
          placeholder="Event Type"
          value={filters.event_type ?? ''}
          onChange={(e) => handleFilterChange('event_type', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm w-36"
        />
        <input
          placeholder="Action"
          value={filters.action ?? ''}
          onChange={(e) => handleFilterChange('action', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm w-32"
        />
        <input
          type="datetime-local"
          value={filters.from_date ?? ''}
          onChange={(e) => handleFilterChange('from_date', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        />
        <span className="text-muted-foreground text-sm">to</span>
        <input
          type="datetime-local"
          value={filters.to_date ?? ''}
          onChange={(e) => handleFilterChange('to_date', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        />
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => setFilters({})}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Event Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !events?.length ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No audit events found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3">Timestamp</th>
                  <th className="text-left px-4 py-3">Agent ID</th>
                  <th className="text-left px-4 py-3">Event Type</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Actor</th>
                  <th className="text-left px-4 py-3">Resource</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[120px] truncate">
                      {event.agent_id ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <EventTypeBadge type={event.event_type} />
                    </td>
                    <td className="px-4 py-3">{event.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">{event.actor}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {event.resource_type
                        ? `${event.resource_type}${event.resource_id ? ` / ${event.resource_id.slice(0, 8)}…` : ''}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="text-xs text-primary hover:underline"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Retention Panel */}
      <RetentionPanel />

      {/* Dialogs / Sheets */}
      <LogEventDialog open={logEventOpen} onClose={() => setLogEventOpen(false)} />
      {selectedEvent && (
        <EventDetailSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
