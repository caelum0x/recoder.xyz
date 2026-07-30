/**
 * Attention classifier — derive a truthful {@link AttentionState} for a
 * workspace from three signal sources, strongest first:
 *
 *  1. the DURABLE workspace state (state of record: awaiting_approval /
 *     awaiting_review / failed are authoritative),
 *  2. the run's lifecycle RunEvents (completed / failed / approval_requested /
 *     needs_input mark the end of an agent turn; a NEWER started/user_message
 *     invalidates them — a fresh turn is running),
 *  3. the captured terminal tail (dmux-derived text heuristics: approval
 *     prompts, spinner/progress indicators, settled input prompts).
 *
 * TRUTHFULNESS INVARIANT: when none of the sources carries a signal the result
 * is `'unknown'` with the reason — the classifier NEVER guesses, and a missing
 * tail (capture faulted / no handle) is a missing signal, not "idle".
 *
 * Heuristic patterns are ported (simplified) from the proven dmux pane
 * heuristics (`apps/desktop/engines/dmux/src/utils/paneAttentionHeuristics.ts`).
 */
import type { RunEvent, WorkspaceState } from '@recoder/agent-os';
import type { AttentionState } from '../types.js';

/** The signals the classifier reads. All optional except the durable state. */
export interface AttentionSignals {
  /** The durable workspace state (state of record). */
  readonly state: WorkspaceState;
  /** The run's RunEvents, oldest → newest (as `listWorkspaceEvents` returns). */
  readonly events?: readonly RunEvent[];
  /** Captured terminal tail; `null`/`undefined` = no capture (no signal). */
  readonly tail?: string | null;
}

/** The classification + the truthful signal that produced it. */
export interface AttentionResult {
  readonly attention: AttentionState;
  readonly reason: string;
}

// --- dmux-derived text heuristics -------------------------------------------

const PROGRESS_WORDS =
  'working|thinking|planning|analyzing|building|testing|running|searching|reviewing|loading|processing|writing|reading|editing|generating|reasoning|compiling|indexing|executing|refactoring|fixing|checking|scanning';

const SPINNER_PREFIX = '[⠁-⣿◐◓◑◒◴◷◶◵●○◦•·⋯⋮✦✧✶✻✽⏳⌛]';

const WORKING_ESC_PATTERN = /\besc\s+to\s+(interrupt|cancel|stop|abort)\b/i;
const WORKING_SPINNER_PATTERN = new RegExp(`^${SPINNER_PREFIX}\\s*(?:${PROGRESS_WORDS})(?:\\b|\\.\\.\\.|…|\\s)`, 'i');
const WORKING_SUFFIX_PATTERN = new RegExp(`\\b(?:${PROGRESS_WORDS})\\b.*(?:\\.\\.\\.|…|\\d{1,3}%|/\\d+)`, 'i');

const APPROVAL_PATTERNS: readonly RegExp[] = [
  /\bdo you want\b/i,
  /\ballow\b[^\n?]*\?/i,
  /\bpermission\b/i,
  /\bapprove\b[^\n?]*\?/i,
  /\(y\/n\)/i,
  /\by\/n\b/i,
  /❯?\s*1[.)]\s*yes\b/i,
];

/** A settled input-prompt line (agent waiting on the user's next message). */
const PROMPT_LINE_PATTERNS: readonly RegExp[] = [
  /^\s*(?:│\s*)?[>$❯›]\s*\S/,
  /^\s*(?:│\s*)?[>$❯›]\s*$/,
];

/**
 * Omnara-derived NEEDS-INPUT phrasings (a wait for the user that is NOT a yes/no
 * approval — those are caught by APPROVAL_PATTERNS first). Broadens recall over
 * the settled-prompt-line check for agents that print an explicit ask.
 */
const NEEDS_INPUT_PATTERNS: readonly RegExp[] = [
  /\bwaiting for (?:your )?(?:input|response|reply|answer)\b/i,
  /\bpress\s+enter\b/i,
  /\benter your\b/i,
  /\btype your (?:message|response|answer|reply)\b/i,
];

/** A numbered selection-menu option line (`❯ 1. …`, `2) …`). */
const MENU_OPTION_PATTERN = /^(?:❯\s*)?\d+[.)]\s+\S/;

function recentLines(tail: string, maxLines: number): readonly string[] {
  return tail
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-maxLines);
}

function hasApprovalPrompt(lines: readonly string[]): boolean {
  const recent = lines.join('\n');
  return APPROVAL_PATTERNS.some((pattern) => pattern.test(recent));
}

function hasWorkingIndicators(lines: readonly string[]): boolean {
  const recent = lines.join('\n');
  if (WORKING_ESC_PATTERN.test(recent)) return true;
  return lines.some((line) => WORKING_SPINNER_PATTERN.test(line) || WORKING_SUFFIX_PATTERN.test(line));
}

function endsAtInputPrompt(lines: readonly string[]): boolean {
  const last = lines[lines.length - 1];
  if (!last) return false;
  return PROMPT_LINE_PATTERNS.some((pattern) => pattern.test(last));
}

/**
 * Omnara-style needs-input detection: an explicit "waiting for input" phrasing,
 * or a settled numbered SELECTION MENU (2+ option lines in the window — an agent
 * asking the user to pick). Non-approval; complements {@link endsAtInputPrompt}.
 */
function hasNeedsInputPrompt(lines: readonly string[]): boolean {
  const recent = lines.join('\n');
  if (NEEDS_INPUT_PATTERNS.some((pattern) => pattern.test(recent))) return true;
  return lines.filter((line) => MENU_OPTION_PATTERN.test(line)).length >= 2;
}

// --- RunEvent signal ---------------------------------------------------------

/**
 * Scan the run's events NEWEST → OLDEST for the first turn-terminating signal.
 * A `started`/`user_message` seen before any signal means a NEWER turn is live —
 * the older completed/failed marker no longer describes the present.
 */
function eventSignal(events: readonly RunEvent[]): AttentionResult | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    switch (event.type) {
      case 'failed':
        return { attention: 'error', reason: `run event: failed${event.message ? ` (${event.message})` : ''}` };
      case 'approval_requested':
        return { attention: 'awaiting_approval', reason: 'run event: approval_requested' };
      case 'needs_input':
        return { attention: 'agent_idle_prompt', reason: 'run event: needs_input' };
      case 'completed':
        return { attention: 'review_ready', reason: 'run event: completed' };
      case 'started':
      case 'user_message':
        // A fresh turn began after any older terminal marker — no event signal.
        return null;
      default:
        break; // log / state_transition / artifact / verified / handoff carry no attention.
    }
  }
  return null;
}

// --- classifier --------------------------------------------------------------

/** How many trailing tail lines the text heuristics consider. */
const TAIL_WINDOW_LINES = 10;

/** States where the live tail/events decide (an agent may be at the keyboard). */
const LIVE_STATES: readonly WorkspaceState[] = ['running', 'changes_requested'];

/**
 * Classify a workspace's attention truthfully. Durable state first, then run
 * events, then terminal-tail heuristics; `'unknown'` when nothing signals.
 */
export function classifyAttention(signals: AttentionSignals): AttentionResult {
  const { state } = signals;

  // 1) The durable record is authoritative for these states.
  if (state === 'awaiting_approval') {
    return { attention: 'awaiting_approval', reason: 'workspace state: awaiting_approval' };
  }
  if (state === 'awaiting_review') {
    return { attention: 'review_ready', reason: 'workspace state: awaiting_review' };
  }
  if (state === 'failed') {
    return { attention: 'error', reason: 'workspace state: failed' };
  }

  // 2/3) Live signals only make sense while an agent could be at the terminal.
  if (LIVE_STATES.includes(state)) {
    const fromEvents = signals.events?.length ? eventSignal(signals.events) : null;
    if (fromEvents) return fromEvents;

    if (typeof signals.tail === 'string' && signals.tail.trim().length > 0) {
      const lines = recentLines(signals.tail, TAIL_WINDOW_LINES);
      if (hasApprovalPrompt(lines)) {
        return { attention: 'awaiting_approval', reason: 'terminal tail: approval prompt detected' };
      }
      if (hasWorkingIndicators(lines)) {
        return { attention: 'working', reason: 'terminal tail: progress indicators detected' };
      }
      if (endsAtInputPrompt(lines)) {
        return { attention: 'agent_idle_prompt', reason: 'terminal tail: settled at an input prompt' };
      }
      if (hasNeedsInputPrompt(lines)) {
        return { attention: 'agent_idle_prompt', reason: 'terminal tail: waiting for input (prompt/menu)' };
      }
      return { attention: 'unknown', reason: 'terminal tail carries no recognizable signal' };
    }
    return { attention: 'unknown', reason: 'no terminal tail or run-event signal' };
  }

  // Every other state (created/setting_up/ready/merging/merged/cancelled/archived)
  // has no live-attention semantics — truthfully unknown, never fabricated.
  return { attention: 'unknown', reason: `no live attention signal for state '${state}'` };
}
