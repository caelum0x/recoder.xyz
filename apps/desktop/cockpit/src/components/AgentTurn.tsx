/**
 * AgentTurn — one agent turn rendered as CLEAN PROSE, not a raw timestamped log.
 *
 * The run-tailer streams the agent's output as incremental `log` RunEvents, plus
 * lifecycle events (started / completed / failed / state_transition). The center
 * conversation should read like the agent talking — the concatenated log output
 * as flowing text — with the lifecycle collapsed into ONE subtle status line, not
 * a row-per-event grid. (The raw event log still lives in the right panel's
 * RUN · OUTPUT for debugging.)
 *
 * Truthful: the status reflects the real terminal event — working / done /
 * stopped — and the prose is the agent's real captured output (tmux dead-pane
 * banners stripped by friendlyAgentText), never fabricated.
 */
import { useState } from 'preact/hooks';
import { useSmoothText } from '@recoder/shared/animations/preact';
import { friendlyAgentText } from './EventLog';
import { renderMarkdown } from '../lib/markdown';
import type { RunEvent } from '../types';

interface AgentTurnProps {
  events: RunEvent[];
  /** Stream the tail of the prose char-by-char (defaults to rAF availability). */
  animate?: boolean;
}

type TurnStatus = 'working' | 'done' | 'stopped';

function turnStatus(events: RunEvent[]): TurnStatus {
  // Scan from the newest lifecycle event backwards.
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i].type;
    if (t === 'failed') return 'stopped';
    if (t === 'completed') return 'done';
    if (t === 'needs_input' || t === 'approval_requested') return 'working';
  }
  return 'working';
}

const STATUS_LABEL: Record<TurnStatus, string> = {
  working: 'Working…',
  done: 'Done',
  stopped: 'Stopped',
};

function canAnimate(): boolean {
  return typeof requestAnimationFrame === 'function';
}

/**
 * A short, human elapsed label for a turn — the span from its first to its last
 * event (createdAt). Returns '' when it can't be computed (missing/one event).
 */
export function turnElapsedLabel(events: RunEvent[]): string {
  if (events.length < 2) return '';
  const first = Date.parse(events[0]?.createdAt ?? '');
  const last = Date.parse(events[events.length - 1]?.createdAt ?? '');
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return '';
  const secs = Math.round((last - first) / 1000);
  if (secs < 1) return '';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/**
 * Collapse an EXACT whole-string repetition to a single copy. Older workspaces
 * have logs polluted by the pre-fix run-tailer, which re-emitted the whole pane
 * on every TUI repaint — so the prose is the same block repeated N times back to
 * back. When (and only when) the entire string is a unit repeated ≥3×, we return
 * one unit. Non-repeating text is returned untouched (safe: never collapses
 * genuine content, only the artifact). O(n) in practice — the inner check breaks
 * immediately for non-periodic input.
 */
export function collapseExactRepeat(text: string): string {
  const n = text.length;
  // Skip tiny strings (nothing to collapse) and very large ones (bounded cost).
  if (n < 60 || n > 100_000) return text;
  const maxPeriod = Math.floor(n / 3);
  for (let p = 1; p <= maxPeriod; p++) {
    let periodic = true;
    for (let i = p; i < n; i++) {
      if (text[i] !== text[i - p]) {
        periodic = false;
        break;
      }
    }
    if (periodic) {
      // `text` is `text[0:p]` repeated (n/p ≥ 3 times, possibly a partial tail).
      return text.slice(0, p).trim();
    }
  }
  return text;
}

/** The agent's prose: concatenate the streamed log output, banner-stripped. */
export function agentProse(events: RunEvent[]): string {
  const joined = events
    .filter((e) => e.type === 'log' && e.message)
    .map((e) => friendlyAgentText(e.message as string))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return collapseExactRepeat(joined);
}

export function AgentTurn({ events, animate }: AgentTurnProps) {
  const prose = agentProse(events);
  const status = turnStatus(events);
  const elapsed = turnElapsedLabel(events);
  const shouldAnimate = (animate ?? canAnimate()) && status === 'working';
  // The smooth-text hook must be called unconditionally (rules of hooks); its
  // output is only surfaced while the turn is live.
  const animated = useSmoothText(prose, { speed: 260 });
  const display = shouldAnimate ? animated || prose : prose;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prose);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (rare in the desktop shell) — fail quietly.
    }
  }

  return (
    <div class={`agent-turn agent-turn-${status}`}>
      {prose ? (
        <div class="agent-turn-body">{renderMarkdown(display)}</div>
      ) : (
        <div class="agent-turn-thinking">{STATUS_LABEL.working}</div>
      )}
      {prose && (
        <div class={`agent-turn-status status-${status}`}>
          <span class="agent-turn-dot" aria-hidden="true" />
          {STATUS_LABEL[status]}
          {elapsed && <span class="agent-turn-elapsed">· {elapsed}</span>}
          <button
            class="agent-turn-copy"
            onClick={copy}
            title="Copy this message"
            aria-label="Copy this message"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
