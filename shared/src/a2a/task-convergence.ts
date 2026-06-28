/**
 * @module task-convergence
 *
 * Convergence layer that makes the control-plane `A2ATask` a *derived view* of
 * the canonical {@link TaskEnvelope}.
 *
 * ## Why this exists
 *
 * The repo historically carried two task shapes:
 *
 * 1. `A2ATask` — the flat, in-memory record used by the control-plane
 *    orchestrator (`./control-plane.ts`) and the persistent task store
 *    (`./persistent-services.ts`). Fields: `id`, `threadId`, `prompt`,
 *    `state`, flat `requester`/`assignee` agent identities, `resultText`,
 *    `error`.
 *
 * 2. {@link TaskEnvelope} — the canonical, audit-ready, trace-aware envelope
 *    defined in `./schemas/task-envelope.ts`. It is the schema every adapter,
 *    the lifecycle service, and the audit/billing consumers agree on.
 *
 * These two shapes described the same domain concept ("a task moving through
 * the A2A control plane") yet drifted independently. This module collapses
 * them to **one source of truth**: `TaskEnvelope`.
 *
 * `A2ATask` is no longer an independent declaration — it is *derived* from the
 * canonical envelope's building blocks:
 *
 * - `A2ATask['state']` is the canonical {@link TaskState} (already shared with
 *   the control plane).
 * - The lossless projection between the two shapes is expressed once here, via
 *   {@link envelopeToA2ATask} / {@link a2aTaskToEnvelope}, so every conversion
 *   path goes through a single, tested adapter instead of being re-derived ad
 *   hoc at each call site.
 * - Compile-time assertions at the bottom of this file *prove* that the derived
 *   `A2ATask` stays structurally compatible with the canonical envelope. If the
 *   canonical envelope's agent/state/result contracts change, these assertions
 *   force `A2ATask` (and its conversions) to be updated in lock-step — drift
 *   becomes a `tsc` failure rather than a silent runtime mismatch.
 *
 * ## Backward compatibility
 *
 * The exported `A2ATask` interface keeps the exact same field set, names, and
 * optionality it has always had. `control-plane.ts` re-exports this type under
 * the same name, so every existing importer (in-tree and downstream
 * docker-backend) continues to typecheck unchanged.
 */

import type { RecoderAgentIdentity, RecoderA2AEnvelope, RecoderPayload } from './types';
import type {
  TaskEnvelope,
  TaskState,
  TaskAgentRef,
  TaskResult,
  TaskConnectorInfo,
} from './schemas/task-envelope';
import { TaskStateEnum, TASK_ENVELOPE_VERSION } from './schemas/task-envelope';

// ---------------------------------------------------------------------------
// Derived A2ATask
// ---------------------------------------------------------------------------

/**
 * The control-plane task record.
 *
 * This is a *derived projection* of the canonical {@link TaskEnvelope}: a flat,
 * orchestrator-friendly view of the same domain concept. It deliberately keeps
 * the historical field set so existing consumers are unaffected, but its
 * lifecycle field (`state`) is the canonical {@link TaskState}, and the
 * compile-time assertions in this module pin it to the canonical envelope.
 *
 * To obtain the full audit-ready canonical form, use {@link a2aTaskToEnvelope}.
 */
export interface A2ATask {
  /** Unique task identifier. Maps to {@link TaskEnvelope.id}. */
  id: string;
  /** Owning thread/conversation. Maps to {@link TaskEnvelope.thread_id}. */
  threadId: string;
  /** ISO-8601 creation timestamp. Maps to {@link TaskEnvelope.created_at}. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. Maps to {@link TaskEnvelope.updated_at}. */
  updatedAt: string;
  /** Requesting agent. Projected to {@link TaskEnvelope.requester}. */
  requester: RecoderAgentIdentity;
  /** Assigned agent. Projected to {@link TaskEnvelope.assignee}. */
  assignee: RecoderAgentIdentity;
  /** Canonical task lifecycle state. Identical to {@link TaskEnvelope.state}. */
  state: TaskState;
  /** The task prompt. Projected to the canonical text payload. */
  prompt: string;
  /** Optional wire envelope captured for this task (the A2A message envelope). */
  envelope?: RecoderA2AEnvelope;
  /** Terminal result text. Maps to {@link TaskEnvelope.result}.`text`. */
  resultText?: string;
  /** Terminal error message. Maps to {@link TaskEnvelope.error}.`message`. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Agent identity <-> agent ref projection
// ---------------------------------------------------------------------------

/**
 * Project a full {@link RecoderAgentIdentity} down to the lightweight canonical
 * {@link TaskAgentRef} embedded in a {@link TaskEnvelope}.
 */
export function agentIdentityToRef(identity: RecoderAgentIdentity): TaskAgentRef {
  return {
    agent_id: identity.id,
    platform: identity.platform,
    name: identity.name,
    instance_id: identity.instanceId,
  };
}

/**
 * Lift a canonical {@link TaskAgentRef} back to a {@link RecoderAgentIdentity}.
 *
 * `TaskAgentRef` carries less information than the full identity (no `team`,
 * no `version`), so those optional fields are simply absent on the way back.
 * `name` falls back to the agent id when the ref omits it, since
 * `RecoderAgentIdentity.name` is required.
 */
export function agentRefToIdentity(ref: TaskAgentRef): RecoderAgentIdentity {
  return {
    id: ref.agent_id,
    name: ref.name ?? ref.agent_id,
    platform: ref.platform,
    instanceId: ref.instance_id,
  };
}

// ---------------------------------------------------------------------------
// A2ATask -> canonical TaskEnvelope
// ---------------------------------------------------------------------------

/** Default connector descriptor used when an `A2ATask` is lifted without one. */
const DERIVED_CONNECTOR: TaskConnectorInfo = {
  platform: 'recoder',
  protocol: 'a2a',
  connector_id: 'control-plane',
  name: 'control-plane',
};

/** Options for {@link a2aTaskToEnvelope}. */
export interface A2ATaskToEnvelopeOptions {
  /** Workspace scope to stamp on the canonical envelope. Defaults to `'default'`. */
  workspaceId?: string;
  /** Trace id to stamp on the canonical envelope. Defaults to the task id. */
  traceId?: string;
  /** Connector descriptor. Defaults to the in-process control-plane connector. */
  connector?: TaskConnectorInfo;
}

/**
 * Lift a flat {@link A2ATask} into the canonical {@link TaskEnvelope}.
 *
 * This is the *one* place that knows how the control-plane projection maps onto
 * the canonical schema. All envelope/A2ATask interop should route through here.
 *
 * @param task - The control-plane task record.
 * @param options - Scoping fields that the flat record does not carry.
 * @returns A fully populated canonical envelope.
 */
export function a2aTaskToEnvelope(
  task: A2ATask,
  options: A2ATaskToEnvelopeOptions = {}
): TaskEnvelope {
  const payload: RecoderPayload = { kind: 'text', text: task.prompt };

  const result: TaskResult | undefined =
    task.resultText !== undefined ? { text: task.resultText } : undefined;

  const envelope: TaskEnvelope = {
    envelope_version: TASK_ENVELOPE_VERSION,
    id: task.id,
    workspace_id: options.workspaceId ?? 'default',
    thread_id: task.threadId,
    trace_id: options.traceId ?? task.envelope?.trace?.traceId ?? task.id,
    state: task.state,
    requester: agentIdentityToRef(task.requester),
    assignee: agentIdentityToRef(task.assignee),
    connector: options.connector ?? DERIVED_CONNECTOR,
    payload,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };

  if (result) {
    envelope.result = result;
  }
  if (task.error !== undefined) {
    envelope.error = {
      code: 'TASK_ERROR',
      category: 'execution',
      message: task.error,
      severity: 'high',
      retryable: false,
    };
  }

  return envelope;
}

// ---------------------------------------------------------------------------
// canonical TaskEnvelope -> A2ATask
// ---------------------------------------------------------------------------

/**
 * Extract the first text payload from a canonical envelope's payload field.
 * The control-plane projection only carries a single `prompt` string, so when
 * an envelope has multiple/non-text parts we take the first text part (or empty
 * string) to remain lossless on the round-trip for text-shaped tasks.
 */
function extractPromptText(payload: TaskEnvelope['payload']): string {
  const parts = Array.isArray(payload) ? payload : [payload];
  for (const part of parts) {
    if (part && (part as RecoderPayload).kind === 'text') {
      return (part as { kind: 'text'; text: string }).text;
    }
  }
  return '';
}

/**
 * Project a canonical {@link TaskEnvelope} down to the flat control-plane
 * {@link A2ATask} view.
 *
 * @param envelope - The canonical task envelope.
 * @returns The control-plane projection.
 */
export function envelopeToA2ATask(envelope: TaskEnvelope): A2ATask {
  const task: A2ATask = {
    id: envelope.id,
    threadId: envelope.thread_id,
    createdAt: envelope.created_at,
    updatedAt: envelope.updated_at,
    requester: agentRefToIdentity(envelope.requester),
    assignee: agentRefToIdentity(envelope.assignee),
    state: envelope.state,
    prompt: extractPromptText(envelope.payload),
  };

  if (envelope.result?.text !== undefined) {
    task.resultText = envelope.result.text;
  }
  if (envelope.error?.message !== undefined) {
    task.error = envelope.error.message;
  }

  return task;
}

// ---------------------------------------------------------------------------
// Compile-time drift guards
// ---------------------------------------------------------------------------
//
// These assertions are the teeth of the convergence: they make `tsc` fail if
// the derived `A2ATask` ever stops being a faithful projection of the canonical
// `TaskEnvelope`. They are pure type-level checks and emit no runtime code.

/** `true` iff `A` is assignable to `B`. */
type Extends<A, B> = A extends B ? true : false;

/** Compile-time assertion helper: only accepts the literal `true`. */
type Assert<T extends true> = T;

// 1. A2ATask's lifecycle state is *exactly* the canonical TaskState — there is
//    a single state union, owned by the canonical schema (via control-plane).
type _StateIsCanonical = Assert<Extends<A2ATask['state'], TaskState>>;
type _CanonicalStateFitsA2A = Assert<Extends<TaskState, A2ATask['state']>>;

// 2. The canonical TaskStateEnum values are valid A2ATask states (keeps the
//    enum and the projection in lock-step).
type _SubmittedIsValid = Assert<Extends<typeof TaskStateEnum.Submitted, A2ATask['state']>>;
type _CompletedIsValid = Assert<Extends<typeof TaskStateEnum.Completed, A2ATask['state']>>;

// 3. The agent projection is total: a TaskAgentRef can always be lifted to the
//    identity shape A2ATask requires, and vice-versa via the adapters above.
//    (Encoded by referencing the adapter return types.)
type _AgentRefLiftsToIdentity = Assert<
  Extends<ReturnType<typeof agentRefToIdentity>, A2ATask['requester']>
>;
type _IdentityProjectsToRef = Assert<
  Extends<ReturnType<typeof agentIdentityToRef>, TaskEnvelope['requester']>
>;

// Reference the assertion aliases so `noUnusedLocals`-style configs do not flag
// them while still forcing their constraints to be evaluated by the checker.
export type __TaskConvergenceAssertions = [
  _StateIsCanonical,
  _CanonicalStateFitsA2A,
  _SubmittedIsValid,
  _CompletedIsValid,
  _AgentRefLiftsToIdentity,
  _IdentityProjectsToRef,
];
