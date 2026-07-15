/**
 * `RunEventIngestService` — the concrete {@link RunEventBusPort}. THE ingest
 * spine of the control plane (domain doc §1.2, §8): every runtime / engine /
 * conductor / internal-API emitter drives run state through this one seam, and
 * the edge + outbox drain subscribe to its accepted stream.
 *
 * The frozen invariant, implemented in exactly ONE order:
 *   validate → gate → apply state-of-record → append immutable event log →
 *   enqueue CloudEvents outbox → notify subscribers.
 *
 *  - IDEMPOTENT by `event.eventId`: a replay returns `{accepted:true,
 *    duplicate:true}` and mutates NOTHING (no double transition, no duplicate
 *    outbox row, no re-delivery to subscribers).
 *  - NEVER throws for a domain outcome — an illegal transition / unknown run /
 *    gate denial / validation failure is a returned {@link RunEventIngestResult}
 *    with a populated `rejection`. Only an INFRA fault (repo unreachable mid-
 *    write) rejects the promise.
 *  - `ingestBatch` applies in array order; a per-event rejection does NOT abort
 *    the batch. Results are index-aligned.
 */
import { z } from 'zod';
import {
  mapRunEventToCloudEvent,
  createOutboxRecord,
  type OutboxRecord,
} from '@recoder/agent-events';
import type { RunEvent, TaskRun } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import type {
  RunEventBusPort,
  RunEventEnvelope,
  RunEventHandler,
  RunEventIngestResult,
  RunEventRejection,
  RunEventSource,
  RunEventSubscription,
} from '../ports/run-event.port.js';
import type { AgentOsGovernanceGate } from '../adapters/governance-gate.adapter.js';
import { applyRunEventToRun } from './run-transition.js';

/** Injected ISO clock (keeps ingest deterministic under test). */
export type Clock = () => string;

export interface RunEventIngestDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly gate: AgentOsGovernanceGate;
  readonly logger: Logger;
  /** Owner attribution resolver — maps an event to its owner (space membership upstream). */
  readonly now?: Clock;
}

/** Boundary validation for an inbound RunEvent (shape only; legality is the reducer's). */
const runEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum([
    'started',
    'state_transition',
    'log',
    'user_message',
    'artifact',
    'needs_input',
    'verified',
    'approval_requested',
    'handoff',
    'failed',
    'completed',
  ]),
  taskId: z.string().min(1),
  runId: z.string().min(1).optional(),
  agentId: z.string().optional(),
  state: z.string().optional(),
  message: z.string().optional(),
  artifactId: z.string().optional(),
  createdAt: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

function reject(
  event: Pick<RunEvent, 'eventId' | 'taskId' | 'runId'>,
  rejection: RunEventRejection,
): RunEventIngestResult {
  return {
    eventId: event.eventId,
    accepted: false,
    duplicate: false,
    taskId: event.taskId,
    ...(event.runId ? { runId: event.runId } : {}),
    stateChanged: false,
    rejection,
  };
}

export class RunEventIngestService implements RunEventBusPort {
  private readonly repository: AgentOsRepositoryPort;
  private readonly gate: AgentOsGovernanceGate;
  private readonly logger: Logger;
  private readonly now: Clock;
  private readonly handlers = new Set<RunEventHandler>();

  /** In-process idempotency index, lazily seeded from the durable event log. */
  private readonly seen = new Set<string>();
  private seeded = false;

  constructor(deps: RunEventIngestDeps) {
    this.repository = deps.repository;
    this.gate = deps.gate;
    this.logger = deps.logger;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  subscribe(handler: RunEventHandler): RunEventSubscription {
    this.handlers.add(handler);
    return {
      unsubscribe: () => {
        this.handlers.delete(handler);
      },
    };
  }

  async ingest(event: RunEvent, source: RunEventSource = 'system'): Promise<RunEventIngestResult> {
    await this.ensureSeeded();

    // 1. VALIDATE (boundary shape).
    const parsed = runEventSchema.safeParse(event);
    if (!parsed.success) {
      return reject(
        { eventId: event?.eventId ?? 'unknown', taskId: event?.taskId ?? 'unknown', runId: event?.runId },
        { reason: 'validation_error', message: parsed.error.issues.map((i) => i.message).join('; ') },
      );
    }
    const valid = event;

    // Idempotent replay — nothing mutates, subscribers are NOT re-notified.
    if (this.seen.has(valid.eventId)) {
      return {
        eventId: valid.eventId,
        accepted: true,
        duplicate: true,
        taskId: valid.taskId,
        ...(valid.runId ? { runId: valid.runId } : {}),
        stateChanged: false,
      };
    }

    // Resolve the target run (when the event targets one).
    let run: TaskRun | undefined;
    if (valid.runId) {
      const runs = await this.repository.listRuns();
      run = runs.find((r) => r.runId === valid.runId);
      if (!run) {
        return reject(valid, {
          reason: 'unknown_run',
          message: `run not found: ${valid.runId}`,
        });
      }
    }

    // Compute the intended transition (pure) so we know if this is a state WRITE.
    const outcome = run ? applyRunEventToRun(run, valid, this.now()) : undefined;
    if (outcome && outcome.kind === 'illegal_transition') {
      return reject(valid, {
        reason: 'illegal_transition',
        message: `illegal run transition ${outcome.from} → ${outcome.to}`,
        from: outcome.from,
        to: outcome.to,
      });
    }

    const willChangeState = outcome?.kind === 'applied';

    // 2. GATE — only state-of-record mutations are gated (append-only evidence
    //    events are immutable log entries, not governed writes).
    if (willChangeState) {
      const decision = await this.gate.guard(`run.${outcome.to}`, {
        ...(valid.runId ? { runId: valid.runId } : {}),
        taskId: valid.taskId,
        metadata: { eventType: valid.type, source },
      });
      if (!decision.allowed) {
        return reject(valid, {
          reason: 'gate_denied',
          message: decision.reason,
          ...(outcome.kind === 'applied' ? { from: outcome.from, to: outcome.to } : {}),
        });
      }
    }

    // From here, any throw is an INFRA fault → rejects the promise (per contract).
    let previousState: TaskRun['state'] | undefined;
    let currentState: TaskRun['state'] | undefined;
    let stateChanged = false;

    // 3. APPLY state-of-record.
    if (outcome?.kind === 'applied') {
      previousState = outcome.from;
      currentState = outcome.to;
      stateChanged = true;
      await this.repository.upsertRun(outcome.run);
    } else if (run) {
      previousState = run.state;
      currentState = run.state;
    }

    // 4. APPEND immutable event log.
    await this.repository.appendEvent(valid);
    this.seen.add(valid.eventId);

    // 5. ENQUEUE CloudEvents outbox (best-effort mapping — some event types have
    //    no CloudEvent projection and are log-only).
    let outboxId: string | undefined;
    const record = this.toOutboxRecord(valid);
    if (record) {
      await this.repository.appendOutbox(record);
      outboxId = record.outboxId;
    }

    const result: RunEventIngestResult = {
      eventId: valid.eventId,
      accepted: true,
      duplicate: false,
      taskId: valid.taskId,
      ...(valid.runId ? { runId: valid.runId } : {}),
      stateChanged,
      ...(previousState ? { previousState } : {}),
      ...(currentState ? { currentState } : {}),
      ...(outboxId ? { outboxId } : {}),
    };

    // 6. NOTIFY accepted, non-duplicate subscribers (isolated — handler throws
    //    are logged, never propagated to the emitter).
    const envelope: RunEventEnvelope = {
      event: valid,
      source,
      receivedAt: this.now(),
    };
    void this.notify(envelope, result);

    return result;
  }

  async ingestBatch(
    events: readonly RunEvent[],
    source: RunEventSource = 'system',
  ): Promise<RunEventIngestResult[]> {
    const results: RunEventIngestResult[] = [];
    for (const event of events) {
      // A per-event rejection does NOT abort the batch.
      results.push(await this.ingest(event, source));
    }
    return results;
  }

  private toOutboxRecord(event: RunEvent): OutboxRecord | null {
    try {
      const cloudEvent = mapRunEventToCloudEvent(event);
      return createOutboxRecord(cloudEvent, this.now());
    } catch {
      // No CloudEvent projection for this event type — log-only, not an error.
      return null;
    }
  }

  private async notify(envelope: RunEventEnvelope, result: RunEventIngestResult): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(envelope, result);
      } catch (error) {
        this.logger.warn(
          { err: error instanceof Error ? error.message : String(error), eventId: result.eventId },
          'run-event subscriber threw — isolated, not propagated to emitter',
        );
      }
    }
  }

  private async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;
    try {
      const events = await this.repository.listEvents();
      for (const ev of events) this.seen.add(ev.eventId);
    } catch (error) {
      // A seed failure must not brick ingest; the durable append still guards
      // idempotency on postgres via the primary key. Log and continue.
      this.seeded = false;
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'run-event ingest could not seed idempotency index from event log',
      );
    }
  }
}
