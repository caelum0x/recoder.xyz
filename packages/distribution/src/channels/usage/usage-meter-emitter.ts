import type { BillingPort, MeterEvent } from '../../ports/billing-port';
import type { EventBusPort } from '../../ports/event-bus-port';
import type { RunEvent } from '@recoder/agent-os';
import type { Result } from '../../result';
import { ok, err } from '../../result';
import { DistributionError } from '../../errors/index';
import { UsageEventSchema, type UsageEvent } from './usage-event';

/**
 * The set of idempotency keys already emitted, so a retried emit is a no-op
 * rather than a double-charge. In-memory reference; a host wires a durable set.
 */
export interface IdempotencyLedger {
  /** Returns true if the key was newly recorded; false if already present. */
  record(key: string): boolean;
  has(key: string): boolean;
}

export function createInMemoryIdempotencyLedger(): IdempotencyLedger {
  const seen = new Set<string>();
  return {
    record(key) {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    has: (key) => seen.has(key),
  };
}

export interface MeterEmitResult {
  /** True when the event was forwarded to the billing meter feed. */
  readonly emitted: boolean;
  /** True when the emit was skipped because the key was already seen. */
  readonly deduped: boolean;
  readonly idempotencyKey: string;
}

/**
 * Emit metered usage to the billing meter feed (→ Polar `/v1/events/ingest`).
 *
 * Fail safe:
 *  - The event is Zod-validated at the boundary; a malformed event is rejected
 *    BEFORE any network call (never trust the caller).
 *  - The billing port itself fails safe: with no `POLAR_ACCESS_TOKEN` the emit
 *    raises a `FailSafeError` (surfaced as an `err`), never a faked "emitted".
 *  - Duplicate idempotency keys are deduped locally and reported as such.
 *
 * On a successful emit an optional `RunEvent` (`type: 'log'`) is published to
 * the outbox so the control plane has an audit trail of metered usage.
 */
export interface UsageMeterEmitter {
  emit(event: UsageEvent): Promise<Result<MeterEmitResult, DistributionError>>;
}

export interface UsageMeterEmitterDeps {
  readonly billing: BillingPort;
  readonly ledger?: IdempotencyLedger;
  readonly events?: EventBusPort;
  /** For the audit RunEvent — the task/run this usage belongs to. */
  readonly taskId?: string;
  readonly eventId?: () => string;
  readonly now?: () => Date;
}

export function createUsageMeterEmitter(deps: UsageMeterEmitterDeps): UsageMeterEmitter {
  const ledger = deps.ledger ?? createInMemoryIdempotencyLedger();
  const newEventId = deps.eventId ?? (() => `evt_${Math.random().toString(36).slice(2)}`);

  return {
    async emit(rawEvent) {
      const parsed = UsageEventSchema.safeParse(rawEvent);
      if (!parsed.success) {
        return err(
          new DistributionError('invalid_input', 'invalid usage event', {
            issues: parsed.error.issues.map((i) => i.message),
          }),
        );
      }
      const event = parsed.data;

      // Idempotency: a key we have already emitted is a no-op (never double-bill).
      if (!ledger.record(event.idempotencyKey)) {
        return ok({ emitted: false, deduped: true, idempotencyKey: event.idempotencyKey });
      }

      const meterEvent: MeterEvent = {
        subjectId: event.subjectId,
        kind: event.kind,
        quantity: event.quantity,
        idempotencyKey: event.idempotencyKey,
        timestamp: event.timestamp,
      };

      try {
        await deps.billing.emitUsage(meterEvent);
      } catch (e) {
        // The emit failed — surface it. The ledger keeps the key recorded only
        // when the provider actually accepted it, so a failed emit is retryable.
        return err(
          e instanceof DistributionError
            ? e
            : new DistributionError('provider_unavailable', e instanceof Error ? e.message : 'emit failed'),
        );
      }

      if (deps.events && deps.taskId) {
        const auditEvent: RunEvent = {
          eventId: newEventId(),
          type: 'log',
          taskId: deps.taskId,
          message: `metered usage emitted: ${event.kind} x${event.quantity}`,
          createdAt: (deps.now ?? (() => new Date()))().toISOString(),
          data: {
            subjectId: event.subjectId,
            subjectKind: event.subjectKind,
            kind: event.kind,
            quantity: event.quantity,
            idempotencyKey: event.idempotencyKey,
          },
        };
        await deps.events.emit(auditEvent);
      }

      return ok({ emitted: true, deduped: false, idempotencyKey: event.idempotencyKey });
    },
  };
}
