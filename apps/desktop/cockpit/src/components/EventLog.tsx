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
import type { RunEvent, RunEventType } from '../types';

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
/**
 * tmux's remain-on-exit dead-pane banner. tmux prints it INSIDE the pane when a
 * command exits, e.g. "Pane is dead (status 0, Tue Jun 30 01:23:01 2026)". Note
 * the status digits are followed by ", <timestamp>" before the closing paren —
 * the captured pane output is the agent's real text with this banner appended,
 * so we strip the banner wherever it appears (not only when the whole line is it).
 */
const PANE_DEAD_BANNER = /\n*[ \t]*pane is dead\s*\(status\s*(-?\d+)[^)]*\)[ \t]*/gi;

export function friendlyAgentText(raw: string): string {
  // Remember the banner's status (if any) before we strip it, so a line that is
  // ONLY the banner still maps to a truthful finished/stopped message.
  const statusMatch = /pane is dead\s*\(status\s*(-?\d+)/i.exec(raw);
  const stripped = raw.replace(PANE_DEAD_BANNER, '').trimEnd();
  const text = stripped.trim();
  if (!text) {
    // The captured output WAS just the banner — map by exit status.
    if (statusMatch) return statusMatch[1] === '0' ? 'Agent finished' : 'Agent stopped';
    if (/^agent session ended\b/i.test(raw.trim())) return 'Agent finished';
    return raw;
  }
  if (/^agent session ended\b/i.test(text)) return 'Agent finished';
  // A bare "Pane is dead" with no status parens (older tmux) → clean finish.
  if (/^pane is dead\b/i.test(text)) return 'Agent finished';
  // Return the agent's real output with the scary banner removed.
  return stripped;
}

/**
 * The plain-language run-state vocabulary.
 *
 * Every RunEventType maps to a calm, short, human label — never the raw wire
 * word ("state_transition", "needs_input", "approval_requested") which reads
 * like machine internals to a terminal-averse operator. This is the lifecycle
 * twin of `friendlyAgentText` (which softens captured tmux/pty output): together
 * they guarantee no scary low-level vocabulary ever reaches the friendly skin.
 *
 * Truthful, not euphemistic: a `failed` event reads "Stopped", never "Done".
 */
const EVENT_KIND_LABEL: Record<RunEventType, string> = {
  started: 'Working…',
  state_transition: 'Update',
  log: 'Working…',
  user_message: 'You',
  artifact: 'Saved work',
  needs_input: 'Waiting for you',
  verified: 'Reviewing',
  approval_requested: 'Waiting for you',
  handoff: 'Handing off',
  failed: 'Stopped',
  completed: 'Done',
};

/** A calm one-word/short label for a RunEvent's kind. Never the raw wire word. */
export function friendlyEventKind(type: string): string {
  return EVENT_KIND_LABEL[type as RunEventType] ?? 'Update';
}

/**
 * Map a raw backend workspace/run state token (e.g. "awaiting_approval",
 * "running") to the same calm vocabulary. Used when a `state_transition` event
 * carries a raw `state` so the friendly skin shows "Waiting for you" instead of
 * "→ awaiting_approval". Exported so the friendly conversation status and the
 * log share ONE source of plain-language copy.
 */
export function friendlyRunState(state: string): string {
  switch (state) {
    case 'created':
    case 'setting_up':
      return 'Setting up…';
    case 'ready':
      return 'Ready';
    case 'running':
      return 'Working…';
    case 'awaiting_approval':
    case 'awaiting_review':
    case 'changes_requested':
      return 'Waiting for you';
    case 'merging':
      return 'Merging…';
    case 'merged':
      return 'Done';
    case 'failed':
    case 'cancelled':
      return 'Stopped';
    case 'archived':
      return 'Archived';
    case 'thinking':
      return 'Thinking…';
    default:
      // Last-resort: humanize the token (underscores → spaces) so even an
      // unknown future state never shows raw snake_case wire wording.
      return state.replace(/_/g, ' ');
  }
}

function eventText(ev: RunEvent): string {
  if (ev.message) return friendlyAgentText(ev.message);
  // A lifecycle transition: show the calm run-state label, never "→ raw_state".
  if (ev.type === 'state_transition' && ev.state) return friendlyRunState(ev.state);
  if (ev.data && typeof ev.data.output === 'string') return friendlyAgentText(ev.data.output);
  // No message/output — fall back to the friendly kind, never the raw wire type.
  return friendlyEventKind(ev.type);
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
            <span class="log-kind">{friendlyEventKind(ev.type)}</span>
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
