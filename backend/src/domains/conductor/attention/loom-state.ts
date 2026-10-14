/**
 * loom native-state mapper — translate loom's own `AgentStatus` machine into
 * Recoder's {@link AttentionState} vocabulary.
 *
 * ATTRIBUTION (Apache-2.0): the `AgentStatus` state machine this maps is derived
 * from herdr (github.com/herdrdev/herdr, Apache-2.0), the upstream project now
 * vendored as the Loom engine. Copyright (c) herdr contributors.
 *
 * This is the "free win" of driving the loom engine (see docs/LOOM-INTEGRATION.md):
 * loom detects agent state NATIVELY, so a loom-run workspace can feed a mapped
 * `nativeAttention` signal into {@link classifyAttention} and bypass the terminal-
 * tail heuristics entirely — while still honouring the durable state-of-record and
 * RunEvent tiers, and still falling back to the tail when loom reports `unknown`.
 *
 * Pure + total: every `AgentStatus` maps to exactly one `AttentionState`, and an
 * unrecognised value maps to `'unknown'` (never a fabricated/guessed state).
 */
import type { AgentStatus } from '@recoder/agent-runtimes/loom-client';
import type { AttentionState } from '../types.js';

/**
 * Map a loom `AgentStatus` to an {@link AttentionState}:
 *  - `working` → `working`            (active progress)
 *  - `blocked` → `awaiting_approval`  (loom detected a permission/approval gate)
 *  - `idle`    → `agent_idle_prompt`  (settled at a prompt, waiting on the human)
 *  - `done`    → `review_ready`       (the turn finished; work is reviewable)
 *  - `unknown` → `unknown`            (loom has no signal → the caller may fall
 *                                      back to the tail; never guessed)
 */
export function mapLoomStatus(status: AgentStatus): AttentionState {
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
      // Exhaustive today; a future loom status is surfaced truthfully as unknown.
      return 'unknown';
  }
}
