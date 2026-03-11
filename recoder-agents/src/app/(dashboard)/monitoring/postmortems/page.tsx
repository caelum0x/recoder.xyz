'use client';

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Loader2,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePostmortems,
  usePostmortemStats,
  useCreatePostmortem,
  useUpdatePostmortem,
  useDeletePostmortem,
  usePublishPostmortem,
} from '@/hooks/monitoring/use-incident-postmortems';
import type { Postmortem, PostmortemFilters, CreatePostmortemData } from '@/lib/api/incident-postmortems';

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
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  in_review: { label: 'In Review', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  published: { label: 'Published', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  archived: { label: 'Archived', color: 'bg-muted text-muted-foreground' },
} as const;

// ============================================================================
// Stats Header
// ============================================================================

function StatsHeader() {
  const { data: stats, isLoading } = usePostmortemStats();

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
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Postmortems</p>
          <p className="text-lg font-semibold tabular-nums">{stats?.total ?? 0}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-2">By Severity</p>
        <div className="flex flex-wrap gap-1.5">
          {severityOrder.map((sev) => {
            const count = stats?.by_severity?.[sev] ?? 0;
            if (count === 0) return null;
            const cfg = SEVERITY_CONFIG[sev];
            return (
              <span key={sev} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.color)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {count}
              </span>
            );
          })}
          {Object.values(stats?.by_severity ?? {}).every((v) => v === 0) && (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500/10">
          <Clock className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Avg Resolution</p>
          <p className="text-lg font-semibold tabular-nums">
            {stats?.avg_resolution_hours != null ? `${stats.avg_resolution_hours}h` : '--'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-2">By Status</p>
        <div className="flex flex-wrap gap-1.5">
          {(['draft', 'in_review', 'published', 'archived'] as const).map((st) => {
            const count = stats?.by_status?.[st] ?? 0;
            if (count === 0) return null;
            const cfg = STATUS_CONFIG[st];
            return (
              <span key={st} className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', cfg.color)}>
                {cfg.label}: {count}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Create Postmortem Dialog
// ============================================================================

function CreatePostmortemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createMutation = useCreatePostmortem();
  const [form, setForm] = useState<CreatePostmortemData>({
    title: '',
    severity: 'medium',
    summary: '',
    root_cause: '',
    impact: '',
    action_items: [],
    lessons_learned: [],
    affected_agents: [],
    started_at: '',
    resolved_at: '',
  });
  const [newActionItem, setNewActionItem] = useState('');
  const [newLesson, setNewLesson] = useState('');
  const [newAgent, setNewAgent] = useState('');

  const handleSubmit = async () => {
    if (!form.title.trim()) return;

    const data: CreatePostmortemData = {
      title: form.title,
      severity: form.severity,
    };

    if (form.summary) data.summary = form.summary;
    if (form.root_cause) data.root_cause = form.root_cause;
    if (form.impact) data.impact = form.impact;
    if (form.action_items && form.action_items.length > 0) data.action_items = form.action_items;
    if (form.lessons_learned && form.lessons_learned.length > 0) data.lessons_learned = form.lessons_learned;
    if (form.affected_agents && form.affected_agents.length > 0) data.affected_agents = form.affected_agents;
    if (form.started_at) data.started_at = form.started_at;
    if (form.resolved_at) data.resolved_at = form.resolved_at;

    await createMutation.mutateAsync(data);
    setForm({ title: '', severity: 'medium', summary: '', root_cause: '', impact: '', action_items: [], lessons_learned: [], affected_agents: [], started_at: '', resolved_at: '' });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Postmortem</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Incident title..."
            />
          </div>

          {/* Severity */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Severity</label>
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Summary */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Summary</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px]"
              placeholder="Brief summary of the incident..."
            />
          </div>

          {/* Root Cause */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Root Cause</label>
            <textarea
              value={form.root_cause}
              onChange={(e) => setForm({ ...form, root_cause: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[60px]"
              placeholder="What caused the incident..."
            />
          </div>

          {/* Impact */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Impact</label>
            <textarea
              value={form.impact}
              onChange={(e) => setForm({ ...form, impact: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[60px]"
              placeholder="What was the impact..."
            />
          </div>

          {/* Action Items */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Action Items</label>
            <div className="mt-1 space-y-1">
              {(form.action_items ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{item.description}</span>
                  <button
                    onClick={() => setForm({ ...form, action_items: form.action_items?.filter((_, idx) => idx !== i) })}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                  ><X className="h-3 w-3" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newActionItem}
                  onChange={(e) => setNewActionItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newActionItem.trim()) {
                      setForm({ ...form, action_items: [...(form.action_items ?? []), { description: newActionItem.trim() }] });
                      setNewActionItem('');
                    }
                  }}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                  placeholder="Add action item..."
                />
                <button
                  onClick={() => {
                    if (newActionItem.trim()) {
                      setForm({ ...form, action_items: [...(form.action_items ?? []), { description: newActionItem.trim() }] });
                      setNewActionItem('');
                    }
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                >Add</button>
              </div>
            </div>
          </div>

          {/* Lessons Learned */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Lessons Learned</label>
            <div className="mt-1 space-y-1">
              {(form.lessons_learned ?? []).map((lesson, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{lesson}</span>
                  <button
                    onClick={() => setForm({ ...form, lessons_learned: form.lessons_learned?.filter((_, idx) => idx !== i) })}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                  ><X className="h-3 w-3" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newLesson}
                  onChange={(e) => setNewLesson(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newLesson.trim()) {
                      setForm({ ...form, lessons_learned: [...(form.lessons_learned ?? []), newLesson.trim()] });
                      setNewLesson('');
                    }
                  }}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                  placeholder="Add lesson..."
                />
                <button
                  onClick={() => {
                    if (newLesson.trim()) {
                      setForm({ ...form, lessons_learned: [...(form.lessons_learned ?? []), newLesson.trim()] });
                      setNewLesson('');
                    }
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                >Add</button>
              </div>
            </div>
          </div>

          {/* Affected Agents */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Affected Agents</label>
            <div className="mt-1 space-y-1">
              {(form.affected_agents ?? []).map((agent, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{agent}</span>
                  <button
                    onClick={() => setForm({ ...form, affected_agents: form.affected_agents?.filter((_, idx) => idx !== i) })}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                  ><X className="h-3 w-3" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newAgent}
                  onChange={(e) => setNewAgent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newAgent.trim()) {
                      setForm({ ...form, affected_agents: [...(form.affected_agents ?? []), newAgent.trim()] });
                      setNewAgent('');
                    }
                  }}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                  placeholder="Agent name or ID..."
                />
                <button
                  onClick={() => {
                    if (newAgent.trim()) {
                      setForm({ ...form, affected_agents: [...(form.affected_agents ?? []), newAgent.trim()] });
                      setNewAgent('');
                    }
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                >Add</button>
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Started At</label>
              <input
                type="datetime-local"
                value={form.started_at}
                onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Resolved At</label>
              <input
                type="datetime-local"
                value={form.resolved_at}
                onChange={(e) => setForm({ ...form, resolved_at: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!form.title.trim() || createMutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Postmortem Detail
// ============================================================================

function PostmortemDetail({
  postmortem,
  onClose,
}: {
  postmortem: Postmortem;
  onClose: () => void;
}) {
  const publishMutation = usePublishPostmortem();
  const deleteMutation = useDeletePostmortem();
  const sevCfg = SEVERITY_CONFIG[postmortem.severity] ?? SEVERITY_CONFIG.medium;
  const statusCfg = STATUS_CONFIG[postmortem.status] ?? STATUS_CONFIG.draft;

  const resolutionHours = useMemo(() => {
    if (!postmortem.started_at || !postmortem.resolved_at) return null;
    const diff = new Date(postmortem.resolved_at).getTime() - new Date(postmortem.started_at).getTime();
    return Math.round(diff / 3600000 * 10) / 10;
  }, [postmortem.started_at, postmortem.resolved_at]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{postmortem.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', sevCfg.color)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', sevCfg.dot)} />
                {sevCfg.label}
              </span>
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.color)}>
                {statusCfg.label}
              </span>
              {resolutionHours !== null && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {resolutionHours}h
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(postmortem.status === 'draft' || postmortem.status === 'in_review') && (
              <button
                onClick={() => publishMutation.mutate(postmortem.id)}
                disabled={publishMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20"
              >
                <Send className="h-3.5 w-3.5" /> Publish
              </button>
            )}
            <button
              onClick={async () => { await deleteMutation.mutateAsync(postmortem.id); onClose(); }}
              disabled={deleteMutation.isPending}
              className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="space-y-5">
          {/* Summary */}
          {postmortem.summary && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Summary</h3>
              <p className="text-sm whitespace-pre-wrap">{postmortem.summary}</p>
            </section>
          )}

          {/* Timeline */}
          {postmortem.timeline && postmortem.timeline.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Timeline</h3>
              <div className="space-y-2 border-l-2 border-border pl-4">
                {postmortem.timeline.map((entry, i) => (
                  <div key={i} className="text-sm">
                    {entry.timestamp && (
                      <span className="text-xs text-muted-foreground mr-2">{entry.timestamp}</span>
                    )}
                    <span>{entry.description}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Root Cause */}
          {postmortem.root_cause && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Root Cause</h3>
              <p className="text-sm whitespace-pre-wrap">{postmortem.root_cause}</p>
            </section>
          )}

          {/* Impact */}
          {postmortem.impact && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Impact</h3>
              <p className="text-sm whitespace-pre-wrap">{postmortem.impact}</p>
            </section>
          )}

          {/* Action Items */}
          {postmortem.action_items && postmortem.action_items.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Action Items</h3>
              <ul className="space-y-1.5">
                {postmortem.action_items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span>{item.description}</span>
                    {item.assignee && <span className="text-xs text-muted-foreground ml-auto">@{item.assignee}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Lessons Learned */}
          {postmortem.lessons_learned && postmortem.lessons_learned.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Lessons Learned</h3>
              <ul className="space-y-1.5">
                {postmortem.lessons_learned.map((lesson, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <BookOpen className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span>{lesson}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Affected Agents */}
          {postmortem.affected_agents && postmortem.affected_agents.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Affected Agents</h3>
              <div className="flex flex-wrap gap-1.5">
                {postmortem.affected_agents.map((agent, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                    {agent}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Timestamps */}
          <section className="text-xs text-muted-foreground space-y-0.5">
            {postmortem.started_at && <p>Started: {new Date(postmortem.started_at).toLocaleString()}</p>}
            {postmortem.resolved_at && <p>Resolved: {new Date(postmortem.resolved_at).toLocaleString()}</p>}
            <p>Created: {new Date(postmortem.created_at).toLocaleString()}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function PostmortemsPage() {
  const [filters, setFilters] = useState<PostmortemFilters>({});
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data: postmortems, isLoading } = usePostmortems(filters);
  const selected = useMemo(
    () => postmortems?.find((p) => p.id === selectedId) ?? null,
    [postmortems, selectedId]
  );

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Incident Postmortems</h1>
          <p className="text-sm text-muted-foreground">Document and learn from incidents</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted',
              showFilters && 'bg-muted'
            )}
          >
            <Filter className="h-4 w-4" /> Filters
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Postmortem
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsHeader />

      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
          <select
            value={filters.status ?? ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="in_review">In Review</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={filters.severity ?? ''}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value || undefined })}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {(filters.status || filters.severity) && (
            <button
              onClick={() => setFilters({})}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !postmortems || postmortems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No postmortems found</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Create your first postmortem
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {postmortems.map((pm) => {
            const sevCfg = SEVERITY_CONFIG[pm.severity] ?? SEVERITY_CONFIG.medium;
            const statusCfg = STATUS_CONFIG[pm.status] ?? STATUS_CONFIG.draft;
            const resHours =
              pm.started_at && pm.resolved_at
                ? Math.round(
                    ((new Date(pm.resolved_at).getTime() - new Date(pm.started_at).getTime()) / 3600000) * 10
                  ) / 10
                : null;

            return (
              <button
                key={pm.id}
                onClick={() => setSelectedId(pm.id)}
                className="w-full text-left rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{pm.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', sevCfg.color)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', sevCfg.dot)} />
                        {sevCfg.label}
                      </span>
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.color)}>
                        {statusCfg.label}
                      </span>
                      {pm.affected_agents && pm.affected_agents.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {pm.affected_agents.length} agent{pm.affected_agents.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {resHours !== null && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {resHours}h
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(pm.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreatePostmortemDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {selected && <PostmortemDetail postmortem={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
