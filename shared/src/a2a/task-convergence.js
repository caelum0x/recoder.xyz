"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentIdentityToRef = agentIdentityToRef;
exports.agentRefToIdentity = agentRefToIdentity;
exports.a2aTaskToEnvelope = a2aTaskToEnvelope;
exports.envelopeToA2ATask = envelopeToA2ATask;
const task_envelope_1 = require("./schemas/task-envelope");
// ---------------------------------------------------------------------------
// Agent identity <-> agent ref projection
// ---------------------------------------------------------------------------
/**
 * Project a full {@link RecoderAgentIdentity} down to the lightweight canonical
 * {@link TaskAgentRef} embedded in a {@link TaskEnvelope}.
 */
function agentIdentityToRef(identity) {
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
function agentRefToIdentity(ref) {
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
const DERIVED_CONNECTOR = {
    platform: 'recoder',
    protocol: 'a2a',
    connector_id: 'control-plane',
    name: 'control-plane',
};
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
function a2aTaskToEnvelope(task, options = {}) {
    const payload = { kind: 'text', text: task.prompt };
    const result = task.resultText !== undefined ? { text: task.resultText } : undefined;
    const envelope = {
        envelope_version: task_envelope_1.TASK_ENVELOPE_VERSION,
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
function extractPromptText(payload) {
    const parts = Array.isArray(payload) ? payload : [payload];
    for (const part of parts) {
        if (part && part.kind === 'text') {
            return part.text;
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
function envelopeToA2ATask(envelope) {
    const task = {
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
