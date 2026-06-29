/**
 * EventLog — live RunEvent stream for a workspace, polled from
 * GET /workspaces/:id/events (~2s). Renders the agent's output (log events) and
 * lifecycle markers (state_transition, completed, failed…). Real events only.
 *
 * The newest line is revealed character-by-character via the shared Preact-native
 * smooth-text hook (@recoder/shared/animations/preact — the `preact/hooks`
 * binding, NOT the React entry, so the cockpit never pulls in preact/compat).
 * The reveal is degrade-safe: when `requestAnimationFrame` is unavailable
 * (headless environments), the line renders as static, complete text.
 */
import { useEffect, useRef } from 'preact/hooks';
import { useSmoothText } from '@recoder/shared/animations/preact';
import type { RunEvent } from '../types';

interface EventLogProps {
  events: RunEvent[] | null;
  error: Error | null;
  loading: boolean;
  /**
   * Whether the newest line should stream character-by-character. Defaults to
   * the host's animation capability (`requestAnimationFrame` availability), so
   * headless/degraded hosts fall back to static text. Exposed mainly so the
   * degrade-safe path is testable without mutating globals.
   */
  animate?: boolean;
}

/**
 * Map scary, low-level session-lifecycle text to friendly, truthful copy.
 *
 * The conductor substrate surfaces raw tmux/pty messages like
 * "Pane is dead (status 0)" or "Agent session ended" when the agent process
 * exits. Those read like crashes to an operator. We translate them to plain
 * language WITHOUT lying about the outcome:
 *   - a clean exit (status 0) → "Agent finished"
 *   - a non-zero exit         → "Agent stopped"
 *   - a bare "Agent session ended" (no status) → "Agent finished"
 * Any other text is returned unchanged.
 */
export function friendlyAgentText(raw: string): string {
  const text = raw.trim();
  // "Pane is dead (status N)" — N === 0 means a clean finish, otherwise stopped.
  const paneDead = /pane is dead\s*\(status\s*(-?\d+)\)/i.exec(text);
  if (paneDead) {
    return paneDead[1] === '0' ? 'Agent finished' : 'Agent stopped';
  }
  if (/^pane is dead\b/i.test(text)) return 'Agent finished';
  if (/^agent session ended\b/i.test(text)) return 'Agent finished';
  return raw;
}

function eventText(ev: RunEvent): string {
  if (ev.message) return friendlyAgentText(ev.message);
  if (ev.type === 'state_transition' && ev.state) return `→ ${ev.state}`;
  if (ev.data && typeof ev.data.output === 'string') return friendlyAgentText(ev.data.output);
  return ev.type;
}

/** True when the host can drive an animation-frame loop. */
function canAnimate(): boolean {
  return typeof requestAnimationFrame === 'function';
}

interface LiveLineProps {
  text: string;
  animate: boolean;
}

/**
 * The newest log line, streamed character-by-character via the shared Preact
 * smooth-text hook. The hook is always called (rules of hooks); its
 * progressively-revealed output is only surfaced when `animate` is true.
 * Otherwise — and as a convergence guard while a reveal is in flight — we fall
 * back to the full static `text`, so the complete line is never absent from the
 * DOM in a headless/non-animating environment.
 */
function LiveLine({ text, animate }: LiveLineProps) {
  const animated = useSmoothText(text, { speed: 240 });
  const display = animate ? animated || text : text;
  return <span class="log-msg log-msg-live">{display}</span>;
}

export function EventLog({ events, error, loading, animate }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Default to the host's animation capability; callers never pass this in
  // production, so the live board streams whenever rAF is available.
  const shouldAnimate = animate ?? canAnimate();

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  if (loading && !events) return <div class="log-empty">Loading output…</div>;
  if (error) return <div class="log-error">Output unavailable: {error.message}</div>;
  if (!events || events.length === 0) return <div class="log-empty">No output yet.</div>;

  const lastIndex = events.length - 1;

  return (
    <div class="event-log" ref={scrollRef}>
      {events.map((ev, i) => {
        const msg = eventText(ev);
        const isNewest = i === lastIndex;
        return (
          <div class={`log-line log-${ev.type}`} key={ev.eventId}>
            <span class="log-time">{new Date(ev.createdAt).toLocaleTimeString()}</span>
            <span class="log-kind">{ev.type}</span>
            {isNewest ? (
              <LiveLine text={msg} animate={shouldAnimate} />
            ) : (
              <span class="log-msg">{msg}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
