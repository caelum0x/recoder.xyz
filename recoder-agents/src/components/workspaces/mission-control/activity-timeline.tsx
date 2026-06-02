'use client';

import { useState, useCallback } from 'react';
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  ArrowRight,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Zap,
  GitBranch,
  FileDiff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActivityTimeline } from '@/hooks/workspaces/use-mission-control';

interface TimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  taskId: string | null;
  data: Record<string, unknown>;
}

const EVENT_ICONS: Record<string, typeof MessageSquare> = {
  'message.new': MessageSquare,
  'task.submitted': Zap,
  'task.started': Zap,
  'task.input-required': ShieldCheck,
  'artifact.attached': FileDiff,
  'evidence.attached': FileDiff,
  'task.completed': CheckCircle,
  'task.failed': XCircle,
  'handoff.initiated': ArrowRight,
  'handoff.accepted': ArrowRight,
  'handoff.completed': ArrowRight,
  'handoff.declined': XCircle,
  'review.accepted': CheckCircle,
  'merge.requested': GitBranch,
  'approval.requested': ShieldCheck,
  'approval.granted': ShieldCheck,
  'approval.rejected': ShieldCheck,
  'approval.escalated': ShieldCheck,
  'agent.online': UserPlus,
  'agent.offline': UserMinus,
  'worktree.created': GitBranch,
  'worktree.merged': GitBranch,
};

const EVENT_COLORS: Record<string, string> = {
  'message.new': 'text-blue-500',
  'task.input-required': 'text-amber-500',
  'task.completed': 'text-green-500',
  'artifact.attached': 'text-indigo-500',
  'evidence.attached': 'text-indigo-500',
  'task.failed': 'text-red-500',
  'handoff.initiated': 'text-amber-500',
  'handoff.accepted': 'text-cyan-500',
  'handoff.declined': 'text-red-500',
  'review.accepted': 'text-lime-500',
  'merge.requested': 'text-orange-500',
  'approval.requested': 'text-purple-500',
  'approval.escalated': 'text-fuchsia-500',
  'agent.online': 'text-green-500',
  'agent.offline': 'text-gray-400',
};

interface ActivityTimelineProps {
  workspaceId: string | null;
  maxEvents?: number;
  onTaskClick?: (taskId: string) => void;
}

export function ActivityTimeline({ workspaceId, maxEvents = 50, onTaskClick }: ActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  const handleEvent = useCallback(
    (event: Record<string, unknown>) => {
      const timelineEvent: TimelineEvent = {
        id: (event.id as string) ?? String(Date.now()),
        type: (event.type as string) ?? 'unknown',
        timestamp: (event.timestamp as string) ?? new Date().toISOString(),
        taskId:
          typeof event.taskId === 'string'
            ? event.taskId
            : typeof (event.data as Record<string, unknown> | undefined)?.taskId === 'string'
              ? ((event.data as Record<string, unknown>).taskId as string)
              : null,
        data: (event.data as Record<string, unknown>) ?? event,
      };

      setEvents((prev) => [timelineEvent, ...prev].slice(0, maxEvents));
    },
    [maxEvents],
  );

  useActivityTimeline(workspaceId, handleEvent);

  const filteredEvents = filter
    ? events.filter((e) => e.type.startsWith(filter))
    : events;

  const filters = ['all', 'task', 'message', 'handoff', 'review', 'merge', 'approval', 'agent'];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Activity Timeline</h3>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full transition-colors',
                (filter === null && f === 'all') || filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
              onClick={() => setFilter(f === 'all' ? null : f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No events yet. Activity will appear here in real-time.
          </p>
        ) : (
          filteredEvents.map((event) => (
            <TimelineEventItem
              key={event.id}
              event={event}
              onTaskClick={onTaskClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TimelineEventItem({
  event,
  onTaskClick,
}: {
  event: TimelineEvent;
  onTaskClick?: (taskId: string) => void;
}) {
  const Icon = EVENT_ICONS[event.type] ?? Zap;
  const color = EVENT_COLORS[event.type] ?? 'text-muted-foreground';
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const description = getEventDescription(event);
  const isClickable = !!event.taskId && !!onTaskClick;

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/30',
        isClickable ? 'cursor-pointer' : 'cursor-default',
      )}
      onClick={() => {
        if (event.taskId && onTaskClick) {
          onTaskClick(event.taskId);
        }
      }}
      disabled={!isClickable}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
      <span className="text-xs flex-1 truncate">{description}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
    </button>
  );
}

function getEventDescription(event: TimelineEvent): string {
  const { type, data } = event;

  switch (type) {
    case 'task.submitted':
      return `Task submitted: ${(data.prompt as string)?.slice(0, 60) ?? event.id}`;
    case 'task.started':
      return `Task started by ${data.assignee_agent_id ?? 'agent'}`;
    case 'task.input-required':
      return `Task waiting for approval or input`;
    case 'artifact.attached':
      return `Artifacts attached: ${Array.isArray(data.artifactKeys) ? data.artifactKeys.join(', ') : data.taskId ?? 'task'}`;
    case 'evidence.attached':
      return `Evidence updated for ${data.taskId ?? 'task'}`;
    case 'task.completed':
      return `Task completed by ${data.assignee_agent_id ?? 'agent'}`;
    case 'task.failed':
      return `Task failed: ${data.error ?? 'unknown error'}`;
    case 'message.new':
      return `${data.senderId ?? 'Agent'}: ${((data.text as string) ?? '').slice(0, 60)}`;
    case 'handoff.initiated':
      return `Handoff: ${data.from} → ${data.to}`;
    case 'handoff.accepted':
      return `Handoff accepted: ${data.from ?? 'agent'} → ${data.to ?? 'agent'}`;
    case 'handoff.completed':
      return `Handoff completed: ${data.from} → ${data.to}`;
    case 'handoff.declined':
      return `Handoff declined: ${data.from ?? 'agent'} → ${data.to ?? 'agent'}`;
    case 'review.accepted':
      return `Review accepted for ${data.reviewTarget ?? data.taskId ?? 'task'}`;
    case 'merge.requested':
      return `Merge requested for ${data.branchName ?? data.taskId ?? 'task'}`;
    case 'approval.requested':
      return `Approval requested for ${data.action ?? 'action'}`;
    case 'approval.granted':
      return `Approval granted by ${data.resolvedBy ?? 'user'}`;
    case 'approval.rejected':
      return `Approval rejected by ${data.resolvedBy ?? 'user'}`;
    case 'approval.escalated':
      return `Approval escalated for ${data.action ?? 'action'}`;
    case 'agent.online':
      return `${data.agentId ?? 'Agent'} came online`;
    case 'agent.offline':
      return `${data.agentId ?? 'Agent'} went offline`;
    default:
      return `${type}: ${JSON.stringify(data).slice(0, 60)}`;
  }
}
