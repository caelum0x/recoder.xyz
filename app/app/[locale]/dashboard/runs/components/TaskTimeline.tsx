'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  MinusCircle,
  ExternalLink,
  GitPullRequest,
  FileCode2,
  MonitorPlay,
  ShieldCheck,
  ListChecks,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types — mirror the docker-backend task-timeline read-model
// ---------------------------------------------------------------------------

type TimelineEventType = 'task' | 'artifact' | 'pr' | 'preview' | 'approval';

type TimelineEventStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'cancelled';

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  timestamp: string;
  url?: string;
  status: TimelineEventStatus;
}

interface TaskTimelineData {
  taskId: string;
  workspaceId: string;
  threadId: string;
  traceId: string;
  state: string;
  events: TimelineEvent[];
}

interface TimelineApiResponse {
  success?: boolean;
  data?: TaskTimelineData;
  error?: unknown;
}

interface TaskTimelineProps {
  taskId: string;
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const typeIcons: Record<TimelineEventType, React.ElementType> = {
  task: ListChecks,
  artifact: FileCode2,
  pr: GitPullRequest,
  preview: MonitorPlay,
  approval: ShieldCheck,
};

const typeLabels: Record<TimelineEventType, string> = {
  task: 'Task',
  artifact: 'Artifact',
  pr: 'Pull Request',
  preview: 'Preview',
  approval: 'Approval',
};

function StatusBadge({ status }: { status: TimelineEventStatus }) {
  const config: Record<TimelineEventStatus, { label: string; className: string; Icon: React.ElementType }> = {
    pending: { label: 'Pending', className: 'text-gray-400 bg-white/5 border-white/10', Icon: Circle },
    in_progress: { label: 'In progress', className: 'text-blue-300 bg-blue-500/10 border-blue-500/30', Icon: Clock },
    success: { label: 'Success', className: 'text-green-300 bg-green-500/10 border-green-500/30', Icon: CheckCircle2 },
    failed: { label: 'Failed', className: 'text-red-300 bg-red-500/10 border-red-500/30', Icon: XCircle },
    cancelled: { label: 'Cancelled', className: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30', Icon: MinusCircle },
  };
  const { label, className, Icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function nodeColor(status: TimelineEventStatus): string {
  switch (status) {
    case 'success':
      return 'bg-green-500 border-green-400';
    case 'in_progress':
      return 'bg-blue-500 border-blue-400';
    case 'failed':
      return 'bg-red-500 border-red-400';
    case 'cancelled':
      return 'bg-yellow-500 border-yellow-400';
    case 'pending':
    default:
      return 'bg-zinc-700 border-zinc-600';
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Vertical stepper that renders the unified task timeline
 * (task -> artifact -> pr -> preview -> approval) sourced from shared run
 * history via the docker-backend read-model. This is not demo-only or
 * per-page derived state: it consumes the canonical backend projection.
 */
export default function TaskTimeline({ taskId }: TaskTimelineProps) {
  const [timeline, setTimeline] = useState<TaskTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/a2a/tasks/${encodeURIComponent(taskId)}/timeline`, { cache: 'no-store' })
      .then(async (res) => {
        const body: TimelineApiResponse = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success || !body.data) {
          throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`);
        }
        return body.data;
      })
      .then((data) => {
        if (!cancelled) setTimeline(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load timeline');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
        Could not load timeline for task <span className="font-mono">{taskId}</span>: {error}
      </div>
    );
  }

  if (!timeline || timeline.events.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-gray-400">
        No timeline events yet for task <span className="font-mono">{taskId}</span>.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">Run Timeline</h3>
          <p className="text-xs text-gray-500 font-mono">{timeline.taskId}</p>
        </div>
        <StatusBadge status={normalizeState(timeline.state)} />
      </div>

      <ol className="relative px-6 py-6">
        {timeline.events.map((event, index) => {
          const Icon = typeIcons[event.type];
          const isLast = index === timeline.events.length - 1;
          return (
            <li key={event.id} className="relative pl-10 pb-6 last:pb-0">
              {/* connector line */}
              {!isLast && (
                <span className="absolute left-[11px] top-6 bottom-0 w-px bg-white/10" aria-hidden="true" />
              )}
              {/* node */}
              <span
                className={`absolute left-0 top-1 w-6 h-6 rounded-full border-2 flex items-center justify-center ${nodeColor(event.status)}`}
                aria-hidden="true"
              >
                <Icon className="w-3 h-3 text-white" />
              </span>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">
                    {typeLabels[event.type]}
                  </span>
                  <StatusBadge status={event.status} />
                </div>
                <div className="flex items-center gap-2">
                  {event.url ? (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white hover:text-orange-400 transition-colors inline-flex items-center gap-1"
                    >
                      {event.title}
                      <ExternalLink className="w-3 h-3 text-gray-500" />
                    </a>
                  ) : (
                    <span className="text-sm text-white">{event.title}</span>
                  )}
                </div>
                <span className="text-xs text-gray-600">{formatTimestamp(event.timestamp)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Map the raw task state onto the badge status vocabulary. */
function normalizeState(state: string): TimelineEventStatus {
  switch (state) {
    case 'completed':
      return 'success';
    case 'working':
    case 'input-required':
      return 'in_progress';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'submitted':
    default:
      return 'pending';
  }
}
