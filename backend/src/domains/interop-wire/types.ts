/**
 * interop-wire domain-internal types — the A2A WIRE + registry/task PROJECTION
 * vocabulary owned by this slice (Phase 7a). Kept deliberately small: the
 * canonical signed-envelope shape is owned by `@recoder/a2a-sdk` and reached
 * through `wire/*`; the canonical Task/Run state-of-record is owned by agent-os
 * and only PROJECTED here for the JSON-RPC surface + heartbeat SLO.
 *
 * This file carries no behavior — only the shapes the wire services, ports, and
 * repositories bind to.
 */

// --- Wire (A2A envelope / agent-card) ----------------------------------------

/**
 * The domain-facing projection of an A2A message envelope. The canonical signed
 * envelope (`SignedEnvelope` from `@recoder/a2a-sdk`) wraps a `payload`; this is
 * the un-sealed view the wire group builds/parses (no signing internals leak up).
 */
export interface A2AEnvelope<TPayload = unknown> {
  readonly id: string;
  readonly from: string;
  readonly to?: string;
  readonly kind: string;
  readonly payload: TPayload;
  readonly correlationId?: string;
  readonly createdAt: string;
}

/** Result of admitting an untrusted inbound envelope at the edge (fail-closed). */
export interface IngressResult<TPayload = unknown> {
  readonly admitted: boolean;
  /** HTTP-ish status for the edge to surface (200/400/401/403/503). */
  readonly status: number;
  /** Stable rejection/admission code (mirrors `@recoder/a2a-sdk` codes). */
  readonly code: string;
  readonly reason: string;
  /** The verified payload — present only when `admitted === true`. */
  readonly payload?: TPayload;
}

/** An outbound sealed + signed envelope this instance publishes. */
export interface EgressEnvelope<TPayload = unknown> {
  readonly envelope: A2AEnvelope<TPayload>;
  /** Opaque signature material produced by the wire signer (hex/base64). */
  readonly signature?: string;
  /** Key id naming the signing party (mirrors the SignedEnvelope key_id). */
  readonly keyId?: string;
}

/** This instance's (or a remote's) A2A agent-card — capability advertisement. */
export interface AgentCard {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly url?: string;
  readonly capabilities: readonly string[];
  /** ed25519 public key advertised for envelope verification. */
  readonly publicKey?: string;
  readonly version?: string;
}

// --- Registry (interop_agents projection) ------------------------------------

/** The kind of registered endpoint a row represents. */
export type AgentKind = 'runtime' | 'remote_a2a' | 'connector';

/** Truthful liveness a registered agent can report (never a faked `up`). */
export type AgentStatus = 'up' | 'down' | 'degraded' | 'unknown';

/** A registered agent / runtime endpoint row (projection of `interop_agents`). */
export interface AgentRow {
  readonly id: string;
  readonly userId: string;
  readonly kind: AgentKind;
  readonly runtimeId?: string;
  readonly card: AgentCard;
  readonly publicKey?: string;
  readonly status: AgentStatus;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** Input to register/upsert an agent row. */
export interface UpsertAgentInput {
  readonly id: string;
  readonly userId: string;
  readonly kind: AgentKind;
  readonly runtimeId?: string;
  readonly card: AgentCard;
  readonly publicKey?: string;
  readonly status?: AgentStatus;
}

/** A single heartbeat sample for a registered agent. */
export interface HeartbeatSample {
  readonly agentId: string;
  readonly seenAt: string;
  readonly latencyMs?: number;
  readonly ok: boolean;
}

// --- Task lifecycle (interop_tasks projection) -------------------------------

/** The A2A task states (submitted → working → … → terminal). */
export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

/** Terminal states no further transition may leave. */
export const TERMINAL_TASK_STATES: readonly A2ATaskState[] = ['completed', 'failed', 'canceled'];

/** A projected A2A task row (mirror of `interop_tasks`). */
export interface TaskRow {
  readonly id: string;
  readonly userId: string;
  readonly runId?: string;
  readonly runtimeId?: string;
  readonly state: A2ATaskState;
  readonly contextId?: string;
  readonly correlation?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** Input to create a task projection. */
export interface CreateTaskInput {
  readonly id: string;
  readonly userId: string;
  readonly runId?: string;
  readonly runtimeId?: string;
  readonly state?: A2ATaskState;
  readonly contextId?: string;
  readonly correlation?: string;
}

/** A single A2A message row (mirror of `interop_task_messages`). */
export interface TaskMessageRow {
  readonly id: string;
  readonly taskId: string;
  readonly role: 'user' | 'agent' | 'system';
  readonly parts: readonly unknown[];
  readonly createdAt?: string;
}

/** Input to append a message to a task. */
export interface AppendMessageInput {
  readonly id: string;
  readonly taskId: string;
  readonly role: 'user' | 'agent' | 'system';
  readonly parts: readonly unknown[];
}

/** A single scratchpad entry (mirror of `interop_scratchpad`). */
export interface ScratchpadEntry {
  readonly taskId: string;
  readonly seq: number;
  readonly author: string;
  readonly note: string;
  readonly expiresAt?: string;
  readonly createdAt?: string;
}

/** Input to append a scratchpad note (server assigns `seq`). */
export interface AppendScratchpadInput {
  readonly taskId: string;
  readonly author: string;
  readonly note: string;
  readonly expiresAt?: string;
}
