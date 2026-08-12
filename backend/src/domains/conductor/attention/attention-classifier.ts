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
 * The terminal-tail tier is a declarative, per-agent, priority-arbitrated rule
 * engine (see {@link evaluateTailManifest}) whose region/matcher/priority design
 * is a clean-room re-expression of herdr's detection manifests.
 */
import type { RunEvent, WorkspaceState } from '@recoder/agent-os';
import type { AttentionState } from '../types.js';
import { evaluateTailManifest } from './attention-manifests.js';

/** The signals the classifier reads. All optional except the durable state. */
export interface AttentionSignals {
  /** The durable workspace state (state of record). */
  readonly state: WorkspaceState;
  /** The run's RunEvents, oldest → newest (as `listWorkspaceEvents` returns). */
  readonly events?: readonly RunEvent[];
  /** Captured terminal tail; `null`/`undefined` = no capture (no signal). */
  readonly tail?: string | null;
  /** The runtime owning the terminal, when known (selects per-agent rules). */
  readonly runtime?: string | null;
  /** The captured OSC window title, when the substrate exposed one. */
  readonly oscTitle?: string | null;
  /**
   * A pre-mapped attention signal from a substrate that detects agent state
   * NATIVELY (herdr's `AgentStatus`, mapped via `herdr-state.ts#mapHerdrStatus`).
   * When present and definite (anything but `'unknown'`) it AUGMENTS the tail
   * tier: honoured after the durable-state and RunEvent tiers but before the
   * terminal-tail heuristics, so a native-state substrate bypasses the manifest
   * guesswork. `'unknown'`/absent = no native signal → the tail path still runs
   * (this never deletes the tail path).
   */
  readonly nativeAttention?: AttentionState | null;
}

/** The classification + the truthful signal that produced it. */
export interface AttentionResult {
  readonly attention: AttentionState;
  readonly reason: string;
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

    // A native substrate status (herdr) AUGMENTS the tail tier: a definite signal
    // wins over the tail heuristics; an `'unknown'` native (herdr had no signal)
    // falls through so the tail path still runs. The durable + RunEvent tiers
    // above already override it, so native never usurps the state of record.
    if (signals.nativeAttention != null && signals.nativeAttention !== 'unknown') {
      return {
        attention: signals.nativeAttention,
        reason: `native substrate status: ${signals.nativeAttention}`,
      };
    }

    if (typeof signals.tail === 'string' && signals.tail.trim().length > 0) {
      const outcome = evaluateTailManifest({
        tail: signals.tail,
        oscTitle: signals.oscTitle,
        runtime: signals.runtime,
      });
      if (outcome.kind === 'signal') {
        return { attention: outcome.attention, reason: `terminal tail [${outcome.ruleId}]: ${outcome.attention}` };
      }
      if (outcome.kind === 'skip') {
        return {
          attention: 'unknown',
          reason: `terminal tail [${outcome.ruleId}]: transcript/menu screen carries no attention signal`,
        };
      }
      return { attention: 'unknown', reason: 'terminal tail carries no recognizable signal' };
    }
    return { attention: 'unknown', reason: 'no terminal tail or run-event signal' };
  }

  // Every other state (created/setting_up/ready/merging/merged/cancelled/archived)
  // has no live-attention semantics — truthfully unknown, never fabricated.
  return { attention: 'unknown', reason: `no live attention signal for state '${state}'` };
}
