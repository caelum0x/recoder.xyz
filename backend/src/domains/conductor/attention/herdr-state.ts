/**
 * herdr native-state mapper — translate herdr's own `AgentStatus` machine into
 * Recoder's {@link AttentionState} vocabulary.
 *
 * This is the "free win" of driving the herdr engine (see docs/HERDR-INTEGRATION.md):
 * herdr detects agent state NATIVELY, so a herdr-run workspace can feed a mapped
 * `nativeAttention` signal into {@link classifyAttention} and bypass the terminal-
 * tail heuristics entirely — while still honouring the durable state-of-record and
 * RunEvent tiers, and still falling back to the tail when herdr reports `unknown`.
 *
 * Pure + total: every `AgentStatus` maps to exactly one `AttentionState`, and an
 * unrecognised value maps to `'unknown'` (never a fabricated/guessed state).
 */
import type { AgentStatus } from '@recoder/agent-runtimes/herdr';
import type { AttentionState } from '../types.js';

/**
 * Map a herdr `AgentStatus` to an {@link AttentionState}:
 *  - `working` → `working`            (active progress)
 *  - `blocked` → `awaiting_approval`  (herdr detected a permission/approval gate)
 *  - `idle`    → `agent_idle_prompt`  (settled at a prompt, waiting on the human)
 *  - `done`    → `review_ready`       (the turn finished; work is reviewable)
 *  - `unknown` → `unknown`            (herdr has no signal → the caller may fall
 *                                      back to the tail; never guessed)
 */
export function mapHerdrStatus(status: AgentStatus): AttentionState {
  switch (status) {
    case 'working':
      return 'working';
    case 'blocked':
      return 'awaiting_approval';
    case 'idle':
      return 'agent_idle_prompt';
    case 'done':
      return 'review_ready';
    case 'unknown':
      return 'unknown';
    default:
      // Exhaustive today; a future herdr status is surfaced truthfully as unknown.
      return 'unknown';
  }
}
