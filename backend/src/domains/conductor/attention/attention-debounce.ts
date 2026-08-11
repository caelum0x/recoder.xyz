/**
 * Attention debounce — a clock-free, per-workspace transition guard that kills
 * status flicker on the one transition that flickers in practice: an agent that
 * is genuinely `working` but momentarily *looks* idle mid-turn (a spinner frame
 * lands between renders, a prompt line settles for one capture, a tool result
 * clears the screen).
 *
 * The rule is herdr's `should_hold_working_to_idle` (src/pane/agent_detection.rs
 * :39-77) re-expressed WITHOUT a clock: herdr holds a pending working→idle for a
 * bounded time; we hold it for a bounded *count* of consecutive idle confirms.
 * The count form is the deterministically testable shape of the same guard.
 *
 * Clean-room note: behaviour absorbed from herdr (Apache-2.0) by design only —
 * no code was copied. herdr's time-cap becomes our consecutive-confirm count.
 *
 * Rule: a `working`→idle transition (idle = `agent_idle_prompt` or an
 * `unknown` that follows `working`) is HELD — we keep publishing `working` —
 * until {@link IDLE_CONFIRMATIONS} consecutive idle classifications confirm it.
 * ANY `working` classification in between RESETS the pending count and keeps
 * publishing `working`. Strong states (`awaiting_approval` / `error` /
 * `review_ready`) publish immediately and clear any pending hold.
 *
 * TRUTHFULNESS INVARIANT: the debouncer only ever substitutes `working` for a
 * freshly-idle read WHILE the guard is holding — it never fabricates a signal,
 * and once the idle is confirmed it publishes exactly the classified idle state.
 */
import type { AttentionState } from '../types.js';

/** Consecutive idle classifications required to confirm a working→idle flip. */
export const IDLE_CONFIRMATIONS = 3;

/** The idle-ish states a working→idle transition is debounced against. */
const IDLE_STATES: readonly AttentionState[] = ['agent_idle_prompt', 'unknown'];

function isIdle(state: AttentionState): boolean {
  return IDLE_STATES.includes(state);
}

/** Per-workspace pending-hold bookkeeping (internal, replaced immutably). */
interface DebounceEntry {
  /** The state we last actually published for this workspace. */
  readonly lastPublished: AttentionState;
  /** How many consecutive idle reads have accrued against a `working` publish. */
  readonly pendingIdle: number;
}

/**
 * A small stateful holder keyed by `workspaceId`. Deterministic given the call
 * sequence: {@link publish} takes the freshly-classified state and returns the
 * state to actually surface, holding `working` across brief idle blips.
 */
export class AttentionDebouncer {
  private readonly entries = new Map<string, DebounceEntry>();

  /**
   * Fold a freshly-classified state into the per-workspace guard and return the
   * state to actually publish.
   */
  publish(workspaceId: string, fresh: AttentionState): AttentionState {
    const previous = this.entries.get(workspaceId);
    const lastPublished = previous?.lastPublished;

    // A working signal always wins immediately and clears any pending hold.
    if (fresh === 'working') {
      this.entries.set(workspaceId, {
        lastPublished: 'working',
        pendingIdle: 0,
      });
      return 'working';
    }

    // Only a working→idle transition is debounced; every other read publishes
    // as-is (including idle reads that did not follow a `working` publish).
    const isWorkingToIdle = lastPublished === 'working' && isIdle(fresh);
    if (!isWorkingToIdle) {
      this.entries.set(workspaceId, { lastPublished: fresh, pendingIdle: 0 });
      return fresh;
    }

    // Holding a working→idle: accrue a confirmation. Until N consecutive idle
    // reads confirm it, keep publishing `working`.
    const pendingIdle = (previous?.pendingIdle ?? 0) + 1;
    if (pendingIdle < IDLE_CONFIRMATIONS) {
      this.entries.set(workspaceId, { lastPublished: 'working', pendingIdle });
      return 'working';
    }

    // Confirmed: the agent really did go idle — publish the classified state.
    this.entries.set(workspaceId, { lastPublished: fresh, pendingIdle: 0 });
    return fresh;
  }

  /** Clear the guard for a workspace (e.g. on teardown or a fresh run). */
  reset(workspaceId: string): void {
    this.entries.delete(workspaceId);
  }
}
