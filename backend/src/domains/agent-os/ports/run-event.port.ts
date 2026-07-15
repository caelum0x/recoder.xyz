/**
 * `RunEventBusPort` — THE RunEvent ingest contract. The seam every runtime /
 * engine / conductor emits into, and the seam edge + the outbox drain subscribe
 * to. This is the event spine of the control plane (domain doc §1.2, §6).
 *
 * FROZEN CONTRACT — Phase 5a seam. The conductor domain (Phase 5b, a CONCURRENT
 * workflow) EMITS `RunEvent`s here as it drives worktree+tmux runs; the runtime
 * adapters (Phase 6) dispatch through it; the edge domain SUBSCRIBES to fan out
 * onto `/sync`. Do NOT widen or narrow these signatures without a cross-domain
 * migration — other domains compile against this file directly.
 *
 * Semantics (the ingest invariant — domain doc §1.2, §8):
 *  - Ingest is IDEMPOTENT by `RunEvent.eventId`. A replayed event returns
 *    `{ accepted: true, duplicate: true }` and mutates nothing — never a double
 *    state transition, never a duplicate outbox record.
 *  - Ingest NEVER throws for a domain outcome. An illegal state transition, an
 *    unknown run, or a governance denial is a returned {@link RunEventIngestResult}
 *    with a populated `rejection`, not an exception. Only an infrastructure fault
 *    (repository unreachable mid-write) rejects the promise.
 *  - A successful ingest is applied in ONE order: validate → gate → apply to
 *    state-of-record → append to the immutable event log → enqueue the
 *    CloudEvents outbox record. `outboxId` is set iff the outbox row was enqueued.
 *  - `RunEvent` is the frozen type from `@recoder/agent-os` (do NOT redefine it).
 *    The bus carries it verbatim inside a {@link RunEventEnvelope}.
 */
import type { RunEvent, TaskRunState } from '@recoder/agent-os';

/** Who emitted the event — for provenance + fan-out routing (not trusted for authz). */
export type RunEventSource =
  | 'conductor' // worktree+tmux run loop (Phase 5b)
  | 'runtime-adapter' // interop runtime dispatch (Phase 6)
  | 'engine' // an in-proc/native engine
  | 'internal-api' // POST /internal/agent-os/events (INTERNAL_SERVICE_KEY)
  | 'system'; // synthesized by agent-os itself (reconciler, timers)

/**
 * The wire envelope the bus carries. Wraps the frozen `RunEvent` with ingestion
 * metadata so provenance survives without polluting the domain event type.
 */
export interface RunEventEnvelope {
  /** The frozen control-plane event (from `@recoder/agent-os`). */
  readonly event: RunEvent;
  /** Emitter provenance. */
  readonly source: RunEventSource;
  /** Owner scope the event is attributed to (app-layer scoping; may be absent for system events). */
  readonly ownerId?: string;
  /** ISO-8601 timestamp the bus received the envelope (distinct from `event.createdAt`). */
  readonly receivedAt: string;
}

/** Why an ingest did not apply. Present on {@link RunEventIngestResult} only when `accepted` is false. */
export type RunEventRejectionReason =
  | 'validation_error' // event failed schema/shape validation at the boundary
  | 'unknown_run' // referenced runId/taskId not found in state-of-record
  | 'illegal_transition' // state_transition rejected by the pure run state machine
  | 'gate_denied' // governance gate denied the implied write
  | 'owner_mismatch'; // event scoped to a run owned by a different principal

/** Structured rejection detail (never a thrown error — a returned outcome). */
export interface RunEventRejection {
  readonly reason: RunEventRejectionReason;
  /** Human-readable explanation (safe to log; carries no secrets). */
  readonly message: string;
  /** For `illegal_transition`: the states involved. */
  readonly from?: TaskRunState;
  readonly to?: TaskRunState;
}

/**
 * The outcome of ingesting exactly one `RunEvent`. Total: exactly one of
 * (`accepted && !rejection`) or (`!accepted && rejection`) holds. A duplicate
 * replay is `accepted: true, duplicate: true` with no state change and no new
 * outbox row.
 */
export interface RunEventIngestResult {
  /** Echo of `RunEvent.eventId` for correlation. */
  readonly eventId: string;
  /** True when the event was persisted (or recognized as an idempotent replay). */
  readonly accepted: boolean;
  /** True when this `eventId` was already ingested — nothing mutated. */
  readonly duplicate: boolean;
  /** The task the event belongs to (always present on accept). */
  readonly taskId: string;
  /** The run the event belongs to, when the event targets a run. */
  readonly runId?: string;
  /** True when the ingest moved the run to a new state. */
  readonly stateChanged: boolean;
  /** The run state before the event applied (when the event targeted a run). */
  readonly previousState?: TaskRunState;
  /** The run state after the event applied. */
  readonly currentState?: TaskRunState;
  /** The enqueued CloudEvents outbox record id, when the event mapped to an outbox row. */
  readonly outboxId?: string;
  /** Populated iff `accepted` is false. */
  readonly rejection?: RunEventRejection;
}

/** Handler invoked for every accepted ingest (edge fan-out, projections). Must not throw. */
export type RunEventHandler = (
  envelope: RunEventEnvelope,
  result: RunEventIngestResult,
) => void | Promise<void>;

/** Opaque subscription handle; call `unsubscribe()` to detach the handler. */
export interface RunEventSubscription {
  unsubscribe(): void;
}

/**
 * THE RunEvent ingest + subscribe seam.
 *
 * Emitters (conductor / runtimes / engines / internal API) call `ingest` /
 * `ingestBatch`. Consumers (edge `/sync`, the outbox drain, read-model
 * projections) call `subscribe`. One event id ingested at-most-once; every
 * accepted event delivered at-least-once to subscribers.
 */
export interface RunEventBusPort {
  /**
   * Validate → gate → apply → append → enqueue-outbox for one event. Idempotent
   * by `event.eventId`. Returns a total {@link RunEventIngestResult}; only an
   * infrastructure fault rejects the promise.
   *
   * @param event  the frozen control-plane event (from `@recoder/agent-os`)
   * @param source the emitter provenance (default `'system'` when omitted)
   */
  ingest(event: RunEvent, source?: RunEventSource): Promise<RunEventIngestResult>;

  /**
   * Batch form of {@link ingest}. Applied in array order; each event is
   * independently idempotent. Returns one result per input event, index-aligned.
   * A per-event rejection does NOT abort the batch.
   */
  ingestBatch(events: readonly RunEvent[], source?: RunEventSource): Promise<RunEventIngestResult[]>;

  /**
   * Subscribe to accepted ingests for fan-out (edge `/sync`, projections).
   * Duplicate replays are NOT re-delivered. The handler must not throw; a
   * throwing handler is isolated and logged, never propagated to the emitter.
   */
  subscribe(handler: RunEventHandler): RunEventSubscription;
}
