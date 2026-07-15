/**
 * The PORT interfaces persistence implements for the observability domain's
 * minimal durable state. Observability is a *signals* domain — it owns only
 * alert rules/events, work-signal dispositions, and SLO targets. All access is
 * app-layer scoped (`WHERE space_id = :space_id`), parameterized `:param` SQL
 * through the injected {@link QueryExecutor} — never string interpolation.
 *
 * FROZEN CONTRACT — the composer + services compile against these; the concrete
 * repositories over the executor are in `repositories/`.
 */
import type {
  AlertEvent,
  AlertRule,
  AlertStatus,
  DispositionState,
  SignalDisposition,
  SloTarget,
} from '../types.js';

/** SLO target rows backing the `/health/full` rollup + alert expressions. */
export interface SloRepository {
  listTargets(spaceId: string): Promise<readonly SloTarget[]>;
  upsertTarget(target: SloTarget): Promise<SloTarget>;
}

/** Alert rules + fired events (space-scoped). */
export interface AlertRepository {
  listRules(spaceId: string): Promise<readonly AlertRule[]>;
  listEnabledRules(): Promise<readonly AlertRule[]>;
  upsertRule(rule: AlertRule): Promise<AlertRule>;
  /** List fired events, optionally filtered by status. */
  listEvents(spaceId: string, status?: AlertStatus): Promise<readonly AlertEvent[]>;
  getEvent(id: string): Promise<AlertEvent | null>;
  insertEvent(event: AlertEvent): Promise<AlertEvent>;
  /** Transition an event's status (fire → ack → resolve); returns the new row. */
  updateEventStatus(
    id: string,
    patch: {
      readonly status: AlertStatus;
      readonly ackedAt?: string;
      readonly ackedBy?: string;
      readonly resolvedAt?: string;
      readonly auditRef?: string;
    },
  ): Promise<AlertEvent | null>;
  /** Most-recent firing event for a rule (dedupe/debounce lookup). */
  latestFiring(ruleId: string): Promise<AlertEvent | null>;
}

/** Work-signal dispositions (the human decision on a stuck/blocked/needs-you signal). */
export interface SignalDispositionRepository {
  list(spaceId: string): Promise<readonly SignalDisposition[]>;
  getBySignal(signalId: string): Promise<SignalDisposition | null>;
  upsert(disposition: SignalDisposition): Promise<SignalDisposition>;
  setDisposition(
    signalId: string,
    patch: {
      readonly disposition: DispositionState;
      readonly decidedBy: string;
      readonly decidedAt: string;
      readonly auditRef?: string;
    },
  ): Promise<SignalDisposition | null>;
}
