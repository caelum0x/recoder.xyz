/**
 * EventLog — live RunEvent stream for a workspace, polled from
 * GET /workspaces/:id/events (~2s). Renders the agent's output (log events) and
 * lifecycle markers (state_transition, completed, failed…). Real events only.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { RunEvent } from '../types';

interface EventLogProps {
  events: RunEvent[] | null;
  error: Error | null;
  loading: boolean;
}

function eventText(ev: RunEvent): string {
  if (ev.message) return ev.message;
  if (ev.type === 'state_transition' && ev.state) return `→ ${ev.state}`;
  if (ev.data && typeof ev.data.output === 'string') return ev.data.output;
  return ev.type;
}

export function EventLog({ events, error, loading }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  if (loading && !events) return <div class="log-empty">Loading output…</div>;
  if (error) return <div class="log-error">Output unavailable: {error.message}</div>;
  if (!events || events.length === 0) return <div class="log-empty">No output yet.</div>;

  return (
    <div class="event-log" ref={scrollRef}>
      {events.map((ev) => (
        <div class={`log-line log-${ev.type}`} key={ev.eventId}>
          <span class="log-time">{new Date(ev.createdAt).toLocaleTimeString()}</span>
          <span class="log-kind">{ev.type}</span>
          <span class="log-msg">{eventText(ev)}</span>
        </div>
      ))}
    </div>
  );
}
