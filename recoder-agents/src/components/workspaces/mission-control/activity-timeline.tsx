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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActivityTimeline } from '@/hooks/workspaces/use-mission-control';

interface TimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

const EVENT_ICONS: Record<string, typeof MessageSquare> = {
  'message.new': MessageSquare,
  'task.submitted': Zap,
  'task.started': Zap,
  'task.completed': CheckCircle,
  'task.failed': XCircle,
  'handoff.initiated': ArrowRight,
  'handoff.completed': ArrowRight,
  'approval.requested': ShieldCheck,
  'approval.granted': ShieldCheck,
  'approval.rejected': ShieldCheck,
  'agent.online': UserPlus,
  'agent.offline': UserMinus,
  'worktree.created': GitBranch,
  'worktree.merged': GitBranch,
};

const EVENT_COLORS: Record<string, string> = {
  'message.new': 'text-blue-500',
  'task.completed': 'text-green-500',
  'task.failed': 'text-red-500',
  'handoff.initiated': 'text-amber-500',
  'approval.requested': 'text-purple-500',
  'agent.online': 'text-green-500',
  'agent.offline': 'text-gray-400',
};

interface ActivityTimelineProps {
  workspaceId: string | null;
  maxEvents?: number;
}

export function ActivityTimeline({ workspaceId, maxEvents = 50 }: ActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  const handleEvent = useCallback(
    (event: Record<string, unknown>) => {
      const timelineEvent: TimelineEvent = {
        id: (event.id as string) ?? String(Date.now()),
        type: (event.type as string) ?? 'unknown',
        timestamp: (event.timestamp as string) ?? new Date().toISOString(),
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

  const filters = ['all', 'task', 'message', 'handoff', 'approval', 'agent'];

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
            <TimelineEventItem key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}

function TimelineEventItem({ event }: { event: TimelineEvent }) {
  const Icon = EVENT_ICONS[event.type] ?? Zap;
  const color = EVENT_COLORS[event.type] ?? 'text-muted-foreground';
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const description = getEventDescription(event);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
      <span className="text-xs flex-1 truncate">{description}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
    </div>
  );
}

function getEventDescription(event: TimelineEvent): string {
  const { type, data } = event;

  switch (type) {
    case 'task.submitted':
      return `Task submitted: ${(data.prompt as string)?.slice(0, 60) ?? event.id}`;
    case 'task.started':
      return `Task started by ${data.assignee_agent_id ?? 'agent'}`;
    case 'task.completed':
      return `Task completed by ${data.assignee_agent_id ?? 'agent'}`;
    case 'task.failed':
      return `Task failed: ${data.error ?? 'unknown error'}`;
    case 'message.new':
      return `${data.senderId ?? 'Agent'}: ${((data.text as string) ?? '').slice(0, 60)}`;
    case 'handoff.initiated':
      return `Handoff: ${data.from} → ${data.to}`;
    case 'handoff.completed':
      return `Handoff completed: ${data.from} → ${data.to}`;
    case 'approval.requested':
      return `Approval requested for ${data.action ?? 'action'}`;
    case 'approval.granted':
      return `Approval granted by ${data.resolvedBy ?? 'user'}`;
    case 'approval.rejected':
      return `Approval rejected by ${data.resolvedBy ?? 'user'}`;
    case 'agent.online':
      return `${data.agentId ?? 'Agent'} came online`;
    case 'agent.offline':
      return `${data.agentId ?? 'Agent'} went offline`;
    default:
      return `${type}: ${JSON.stringify(data).slice(0, 60)}`;
  }
}
