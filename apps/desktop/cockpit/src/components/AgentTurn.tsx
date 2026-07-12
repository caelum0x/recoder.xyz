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

/** The agent's prose: concatenate the streamed log output, banner-stripped. */
export function agentProse(events: RunEvent[]): string {
  return events
    .filter((e) => e.type === 'log' && e.message)
    .map((e) => friendlyAgentText(e.message as string))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function AgentTurn({ events, animate }: AgentTurnProps) {
  const prose = agentProse(events);
  const status = turnStatus(events);
  const shouldAnimate = (animate ?? canAnimate()) && status === 'working';
  // The smooth-text hook must be called unconditionally (rules of hooks); its
  // output is only surfaced while the turn is live.
  const animated = useSmoothText(prose, { speed: 260 });
  const display = shouldAnimate ? animated || prose : prose;

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
        </div>
      )}
    </div>
  );
}
