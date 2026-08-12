/**
 * `playbooks` — the BUILT-IN playbook catalog (data literals). Each recipe is grounded
 * ONLY in the shipped conductor primitives; no new orchestration capability is invented
 * here — a playbook is purely a saved SEQUENCE of typed steps (see {@link Playbook}).
 *
 * The three shipped recipes, simplest → richest:
 *  - `fan-converge`        : the simplest recipe — one `fanout` (which already fans N →
 *                            waits → auto-converges on ≥2 done into ONE branch).
 *  - `fan-unblock-converge`: `fanout`, then `unblock_blocked` over the panes that ended
 *                            BLOCKED (`awaiting_approval`) — escalate by default to keep
 *                            them moving for the human. The fanout's own auto-converge
 *                            still folds the done-ish siblings.
 *  - `fan-converge-refan`  : `fanout` (→ converge), then `re_fan` a narrowed follow-up
 *                            off the converged branch, converging again. The re-fan
 *                            REFUSES truthfully when round 1 did not converge.
 */
import type { Playbook } from './playbook.types.js';

/** The simplest recipe: fan N agents and auto-converge on ≥2 done-ish. */
export const FAN_CONVERGE: Playbook = {
  id: 'fan-converge',
  description:
    'Fan ONE task to N agents in parallel Loom panes and auto-converge the sibling diffs into ONE reviewable branch (the shipped fan-out already waits each pane and folds ≥2 done-ish). The simplest recipe.',
  steps: [{ kind: 'fanout' }],
};

/** Fan → keep blocked panes moving via swarm-unblock (escalate by default) → converge. */
export const FAN_UNBLOCK_CONVERGE: Playbook = {
  id: 'fan-unblock-converge',
  description:
    'Fan ONE task to N agents; the shipped fan-out waits each pane and auto-converges the done-ish siblings, then swarm-unblock resolves every pane that ended BLOCKED (awaiting approval) — escalating by default so a human can keep it moving. Truthful: no blocked panes ⇒ the unblock step is a no-op.',
  steps: [{ kind: 'fanout' }, { kind: 'unblock_blocked' }],
};

/** Fan → converge → re-fan a narrowed follow-up off the converged branch → converge again. */
export const FAN_CONVERGE_REFAN: Playbook = {
  id: 'fan-converge-refan',
  description:
    'Fan ONE task to N agents and auto-converge, then run a SECOND round off the converged branch with a narrowed follow-up task, converging again and linking back to round 1. Requires a followupTask; a round 1 that did not converge makes the re-fan refuse truthfully (never a fabricated base).',
  steps: [{ kind: 'fanout' }, { kind: 're_fan' }],
};

/** The ordered built-in catalog (stable list order for recoder_playbook_list). */
export const BUILT_IN_PLAYBOOK_LIST: readonly Playbook[] = [
  FAN_CONVERGE,
  FAN_UNBLOCK_CONVERGE,
  FAN_CONVERGE_REFAN,
];

/** The built-in catalog keyed by id (the recoder_playbook_run selector). */
export const BUILT_IN_PLAYBOOKS: ReadonlyMap<string, Playbook> = new Map(
  BUILT_IN_PLAYBOOK_LIST.map(pb => [pb.id, pb])
);

/** A compact list-item for recoder_playbook_list (id + description + step kinds). */
export interface PlaybookListItem {
  readonly id: string;
  readonly description: string;
  readonly steps: readonly string[];
}

/** Project the built-in catalog into truthful list-items (never fabricated). */
export function listBuiltInPlaybooks(
  playbooks: readonly Playbook[] = BUILT_IN_PLAYBOOK_LIST
): readonly PlaybookListItem[] {
  return playbooks.map(pb => ({
    id: pb.id,
    description: pb.description,
    steps: pb.steps.map(s => s.kind),
  }));
}
