"use strict";
/**
 * @module task-envelope
 *
 * Canonical TaskEnvelope schema for the Recoder A2A control plane.
 *
 * A TaskEnvelope is the top-level wrapper that carries a task through the
 * entire lifecycle -- from submission by a requester agent, through execution
 * by an assignee agent, to terminal completion/failure/cancellation.
 *
 * Every envelope is scoped to a workspace + thread and carries an
 * OpenTelemetry-compatible trace_id so that downstream consumers (audit,
 * observability, billing) can correlate events end-to-end.
 *
 * Consumed by: codex adapter, claude adapter, control-plane orchestrator,
 * audit-log service, billing metering.
 *
 * @example
 * ```ts
 * import type { TaskEnvelope } from '@recoder/shared/a2a/schemas';
 *
 * const envelope: TaskEnvelope = {
 *   envelope_version: TASK_ENVELOPE_VERSION,
 *   id: 'task_01HXYZ',
 *   workspace_id: 'ws_abc',
 *   thread_id: 'thr_def',
 *   trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   state: TaskStateEnum.Submitted,
 *   connector: { platform: 'codex', protocol: 'jsonrpc', connector_id: 'codex-v1' },
 *   requester: { agent_id: 'agent-pm', platform: 'recoder_pm' },
 *   assignee:  { agent_id: 'agent-codex', platform: 'codex' },
 *   payload: { kind: 'text', text: 'Implement the auth flow' },
 *   created_at: '2026-02-24T10:00:00.000Z',
 *   updated_at: '2026-02-24T10:00:00.000Z',
 * };
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_STATE_TRANSITIONS = exports.TERMINAL_TASK_STATES = exports.TASK_STATES = exports.TaskStateEnum = exports.TASK_ENVELOPE_VERSION = void 0;
exports.isTerminalState = isTerminalState;
exports.createTaskEnvelope = createTaskEnvelope;
exports.isValidTransition = isValidTransition;
exports.transitionTaskEnvelope = transitionTaskEnvelope;
// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
/** Current version of the TaskEnvelope schema. */
exports.TASK_ENVELOPE_VERSION = '1.0.0';
/**
 * Named-access enum for task state values.
 *
 * Lifecycle:
 * ```
 * submitted -> working -> completed
 *                |     -> failed
 *                |     -> cancelled
 *                +---> input-required -> working (loop)
 * ```
 *
 * These values are identical to the `TaskState` union from the control plane,
 * but exposed as a const object for ergonomic named access:
 * ```ts
 * if (envelope.state === TaskStateEnum.Completed) { ... }
 * ```
 */
exports.TaskStateEnum = {
    /** Task has been created and is awaiting execution. */
    Submitted: 'submitted',
    /** Task is actively being processed by the assignee agent. */
    Working: 'working',
    /** The assignee needs additional input before it can continue. */
    InputRequired: 'input-required',
    /** Task finished successfully. */
    Completed: 'completed',
    /** Task terminated with an error. */
    Failed: 'failed',
    /** Task was explicitly cancelled by a requester or operator. */
    Cancelled: 'cancelled',
};
/** Ordered list of all task states (useful for validation). */
exports.TASK_STATES = [
    exports.TaskStateEnum.Submitted,
    exports.TaskStateEnum.Working,
    exports.TaskStateEnum.InputRequired,
    exports.TaskStateEnum.Completed,
    exports.TaskStateEnum.Failed,
    exports.TaskStateEnum.Cancelled,
];
/** Set of terminal states -- once a task reaches one of these it cannot transition further. */
exports.TERMINAL_TASK_STATES = new Set([
    exports.TaskStateEnum.Completed,
    exports.TaskStateEnum.Failed,
    exports.TaskStateEnum.Cancelled,
]);
/**
 * Returns true when the given state is a terminal state.
 *
 * @param state - The task state to check.
 */
function isTerminalState(state) {
    return exports.TERMINAL_TASK_STATES.has(state);
}
/**
 * Create a new `TaskEnvelope` in the `submitted` state with sensible
 * defaults for version, timestamps, and empty history.
 *
 * @param input - The required fields for envelope creation.
 * @returns A fully populated `TaskEnvelope`.
 */
function createTaskEnvelope(input) {
    const now = input.now ?? new Date().toISOString();
    return {
        envelope_version: exports.TASK_ENVELOPE_VERSION,
        id: input.id,
        workspace_id: input.workspace_id,
        thread_id: input.thread_id,
        trace_id: input.trace_id,
        parent_id: input.parent_id,
        state: input.initial_state ?? exports.TaskStateEnum.Submitted,
        history: [],
        requester: input.requester,
        assignee: input.assignee,
        connector: input.connector,
        payload: input.payload,
        created_at: now,
        updated_at: now,
        metadata: input.metadata,
        tags: input.tags,
    };
}
// ---------------------------------------------------------------------------
// State transition helper
// ---------------------------------------------------------------------------
/**
 * Allowed state transitions. Maps each state to the set of states it can
 * move to. Any transition not in this map is invalid.
 */
exports.ALLOWED_STATE_TRANSITIONS = {
    [exports.TaskStateEnum.Submitted]: [exports.TaskStateEnum.Working, exports.TaskStateEnum.Cancelled, exports.TaskStateEnum.Failed],
    [exports.TaskStateEnum.Working]: [
        exports.TaskStateEnum.Completed,
        exports.TaskStateEnum.Failed,
        exports.TaskStateEnum.Cancelled,
        exports.TaskStateEnum.InputRequired,
    ],
    [exports.TaskStateEnum.InputRequired]: [exports.TaskStateEnum.Working, exports.TaskStateEnum.Cancelled, exports.TaskStateEnum.Failed],
    [exports.TaskStateEnum.Completed]: [],
    [exports.TaskStateEnum.Failed]: [],
    [exports.TaskStateEnum.Cancelled]: [],
};
/**
 * Check whether a state transition is valid according to the lifecycle rules.
 *
 * @param from - The current state.
 * @param to - The desired next state.
 * @returns `true` if the transition is allowed.
 */
function isValidTransition(from, to) {
    return (exports.ALLOWED_STATE_TRANSITIONS[from] ?? []).includes(to);
}
/**
 * Apply a state transition to an envelope, returning a new envelope with
 * the updated state and an appended history entry. Throws if the transition
 * is not allowed.
 *
 * @param envelope - The current envelope.
 * @param to - The target state.
 * @param options - Optional reason and actor for the transition.
 * @returns A new `TaskEnvelope` with the transition applied.
 */
function transitionTaskEnvelope(envelope, to, options) {
    if (!isValidTransition(envelope.state, to)) {
        throw new Error(`Invalid task state transition: ${envelope.state} -> ${to} (task ${envelope.id})`);
    }
    const now = options?.now ?? new Date().toISOString();
    const transition = {
        from: envelope.state,
        to,
        transitioned_at: now,
        reason: options?.reason,
        triggered_by: options?.triggered_by,
    };
    return {
        ...envelope,
        state: to,
        updated_at: now,
        history: [...(envelope.history ?? []), transition],
    };
}
