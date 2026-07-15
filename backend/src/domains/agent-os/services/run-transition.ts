/**
 * `run-transition` — the PURE run state reducer (domain doc §1.2). Given the
 * current {@link TaskRun} and an incoming {@link RunEvent}, it computes the
 * legal next state and returns a total, side-effect-free outcome. No I/O, no
 * clock unless injected — this is the deterministic heart the ingest service
 * drives, and the one place run-state legality is decided.
 *
 * The legal-transition table + the `transitionTaskRun` reducer are REUSED
 * verbatim from `@recoder/agent-os` (the frozen domain package) — this module
 * only maps a `RunEvent` onto an intended target state and defers legality to the
 * package. It NEVER throws: an illegal move is a returned `illegal_transition`
 * outcome the ingest turns into a `RunEventRejection`.
 */
import {
  isAllowedTaskRunTransition,
  transitionTaskRun,
  type RunEvent,
  type RunEventType,
  type TaskRun,
  type TaskRunState,
} from '@recoder/agent-os';

/** The total outcome of reducing one event against one run. */
export type RunTransitionOutcome =
  | { readonly kind: 'applied'; readonly run: TaskRun; readonly from: TaskRunState; readonly to: TaskRunState }
  | { readonly kind: 'no_state_change'; readonly run: TaskRun; readonly state: TaskRunState }
  | { readonly kind: 'illegal_transition'; readonly from: TaskRunState; readonly to: TaskRunState };

/**
 * The state a given event TYPE implies when the event carries no explicit
 * `state`. Only unambiguous mappings are encoded; ambiguous/evidence events
 * (`log`, `user_message`, `artifact`, `verified`, `handoff`) imply no move and
 * must carry an explicit `state` to transition.
 */
const IMPLIED_STATE_BY_TYPE: Partial<Record<RunEventType, TaskRunState>> = {
  started: 'running',
  needs_input: 'needs_input',
  approval_requested: 'waiting_for_approval',
  failed: 'failed',
  completed: 'completed',
};

/**
 * Resolve the target state an event intends: an explicit `event.state` always
 * wins; otherwise the type's implied state (if any). Returns `undefined` when
 * the event implies no state change.
 */
export function resolveTargetState(event: RunEvent): TaskRunState | undefined {
  if (event.state) return event.state;
  return IMPLIED_STATE_BY_TYPE[event.type];
}

/**
 * Reduce one `RunEvent` against a `TaskRun`. Pure + total:
 *  - no target / same-state target  → `no_state_change` (event is still a valid
 *    log/artifact/etc. append; the run itself does not move).
 *  - target not reachable from the current state → `illegal_transition`.
 *  - otherwise → `applied` with the new immutable run (via `transitionTaskRun`).
 *
 * @param now injected ISO clock (keeps the reducer deterministic under test).
 */
export function applyRunEventToRun(
  run: TaskRun,
  event: RunEvent,
  now?: string,
): RunTransitionOutcome {
  const target = resolveTargetState(event);
  if (target === undefined || target === run.state) {
    return { kind: 'no_state_change', run, state: run.state };
  }
  if (!isAllowedTaskRunTransition(run.state, target)) {
    return { kind: 'illegal_transition', from: run.state, to: target };
  }
  const next = transitionTaskRun(run, target, {
    ...(now ? { now } : {}),
    ...(event.data ? { metadata: event.data } : {}),
  });
  return { kind: 'applied', run: next, from: run.state, to: target };
}
