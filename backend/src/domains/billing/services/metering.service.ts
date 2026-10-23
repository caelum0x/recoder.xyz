/**
 * `createMeteringService` — the durable, idempotent usage LEDGER on top of the
 * {@link MeteringRepository} (metering-repo.port).
 *
 * This is the single writer for the usage ledger the conductor (per-run),
 * inference (per-token), and engines (per-engine) emit into. Two jobs:
 *
 *  1. RECORD — write a usage event exactly once. Idempotency is enforced at the
 *     DB (`ON CONFLICT (idempotency_key) DO NOTHING`); a retried emit with the
 *     same key is a no-op (`inserted:false`), so a worker/conductor retry never
 *     double-counts. Best-effort materialized-counter increment rides along for
 *     fast headroom reads (the event ledger stays the fail-safe source of truth).
 *
 *  2. FLUSH — drain unflushed events to the active provider's meter feed in
 *     batches (`emitUsage` → `markFlushed`). DEGRADE-SAFE: with no provider, an
 *     unconfigured provider, or a push error, nothing is marked flushed — the
 *     events wait for the next tick (fail-safe law §37: never a faked flush).
 *     The SAME drained batch is also fanned out to any configured
 *     {@link UsageSinkPort}s (e.g. Railyard Mint) — a purely additional,
 *     best-effort emit target. A sink failure is logged and NEVER affects the
 *     primary provider's flush/mark-flushed decision (see `forwardToSinks`).
 *
 * Fail-safe law: every counter/flush side effect is wrapped so a metering hiccup
 * NEVER throws into the caller's hot path — the durable event write is the only
 * operation whose result the caller acts on.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import {
  degraded as degradedHealth,
  healthy,
  type ComponentHealth,
} from '../../../shared/health-types.js';
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type { UsageSinkPort } from '../ports/usage-sink.port.js';
import type { IdempotentWrite, MeteringRepository, UsageReservation } from '../ports/metering-repo.port.js';
import type { MeterEvent, UsageKind } from '../types.js';

const SERVICE_NAME = 'billing.metering';

/** The default batch size drained per flush tick. */
const DEFAULT_FLUSH_BATCH = 100;

/** A caller-facing usage emit. `idempotencyKey` makes a retry a no-op. */
export interface MeterInput {
  readonly subjectId: string;
  readonly kind: UsageKind;
  /** Units consumed (tokens, runs, …). Defaults to `1`; non-positive ⇒ `1`. */
  readonly quantity?: number;
  /** The agent-os Run this usage belongs to, when applicable. */
  readonly runId?: string | null;
  /** The engine that produced the usage (e.g. `tensorzero`, `claude`). */
  readonly engine?: string | null;
  /**
   * The idempotency key. When absent a random one is generated (the write still
   * happens once, but a retry cannot dedupe) — emitters SHOULD pass a stable key
   * derived from the run/turn/token-batch so retries are true no-ops.
   */
  readonly idempotencyKey?: string;
  /** When the usage occurred (ISO); defaults to now at the DB. */
  readonly occurredAt?: string;
}

/** Aggregate result of a batch record. */
export interface BatchRecordResult {
  readonly inserted: number;
  readonly duplicates: number;
}

export interface MeteringService {
  /** Record one usage event durably + idempotently. */
  record(input: MeterInput): Promise<IdempotentWrite>;
  /**
   * Atomically reserve usage against a window quota via a single guarded ledger
   * write (see {@link MeteringRepository.reserveUsage}). Unlike {@link record},
   * a reservation is REFUSED (`reserved:false`) when it would exceed `limit` —
   * this is the enforcement primitive the quota `consume` gate leans on to close
   * the check-then-record TOCTOU. A fresh reservation warms the materialized
   * counter; `limit` MUST be a finite ceiling (unlimited tiers never reserve).
   */
  reserve(input: MeterInput, limit: number, since: string): Promise<UsageReservation>;
  /** Record many events; aggregates fresh inserts vs idempotent duplicates. */
  recordBatch(inputs: readonly MeterInput[]): Promise<BatchRecordResult>;
  /** Drain up to `limit` unflushed events to the provider meter feed (degrade-safe). */
  flushOnce(limit?: number): Promise<number>;
  /** Start the periodic flush loop (no-op when interval is `0` or already running). */
  startFlushLoop(): void;
  /** Stop the periodic flush loop. */
  stop(): void;
  /** Truthful health (degraded when the ledger repo is unavailable). */
  health(): ComponentHealth;
}

export interface MeteringServiceDeps {
  readonly repo: MeteringRepository;
  /**
   * The active MoR provider whose meter feed unflushed events drain to. Optional:
   * absent ⇒ flushing is a no-op (events accumulate durably, never lost).
   */
  readonly provider?: BillingProviderPort;
  /**
   * Additional, best-effort usage-forwarding targets (e.g. Railyard Mint) that
   * receive the SAME drained batch as `provider.emitUsage`, fanned out in
   * parallel. A sink error is logged and never affects the primary provider's
   * flush/mark-flushed decision, and never blocks or slows the other sinks —
   * see `forwardToSinks`. Empty/absent ⇒ byte-identical behavior to before
   * this seam existed.
   */
  readonly extraSinks?: readonly UsageSinkPort[];
  /** Flush cadence (ms). `0` (default) disables the periodic loop. */
  readonly flushIntervalMs?: number;
  /** Events drained per flush tick. */
  readonly flushBatchSize?: number;
  readonly logger?: Logger;
  /** Injectable clock for deterministic `flushedAt` stamps in tests. */
  readonly now?: () => Date;
}

/** Coerce a quantity to a positive integer count (fail safe: never 0/negative). */
function positiveQuantity(q: number | undefined): number {
  if (typeof q !== 'number' || !Number.isFinite(q)) return 1;
  const n = Math.trunc(q);
  return n > 0 ? n : 1;
}

export function createMeteringService(deps: MeteringServiceDeps): MeteringService {
  const { repo, provider } = deps;
  const extraSinks = deps.extraSinks ?? [];
  const clock = deps.now ?? (() => new Date());
  const intervalMs = deps.flushIntervalMs ?? 0;
  const batchSize = deps.flushBatchSize ?? DEFAULT_FLUSH_BATCH;

  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;

  /** Best-effort counter bump — never throws into the record hot path. */
  async function bumpCounter(input: MeterInput, quantity: number): Promise<void> {
    try {
      const now = clock();
      const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      await repo.incrementCounter(input.subjectId, input.kind, windowStart, quantity);
    } catch (error) {
      // The materialized counter is an optimization; the event ledger is the
      // fail-safe source of truth. A miss here is logged, never surfaced.
      deps.logger?.debug?.(
        { error, subjectId: input.subjectId, kind: input.kind },
        'metering: counter increment skipped (non-fatal)',
      );
    }
  }

  /**
   * Fan a flushed batch out to every configured {@link UsageSinkPort} in
   * parallel. Each sink's failure is caught and logged independently — one
   * slow/broken sink can never delay or fail another, and never throws back
   * into `flushOnce`'s hot path (fail-safe law §37: a secondary rollup target
   * degrading is observability, not an outage).
   */
  async function forwardToSinks(events: readonly MeterEvent[]): Promise<void> {
    if (extraSinks.length === 0 || events.length === 0) return;
    const results = await Promise.allSettled(extraSinks.map((sink) => sink.emitUsage(events)));
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      if (result && result.status === 'rejected') {
        deps.logger?.warn?.(
          { error: result.reason, sink: extraSinks[i]?.name, count: events.length },
          'metering: extra sink emitUsage failed (non-fatal — primary provider flush unaffected)',
        );
      }
    }
  }

  async function record(input: MeterInput): Promise<IdempotentWrite> {
    const quantity = positiveQuantity(input.quantity);
    const write = await repo.recordUsage({
      id: randomUUID(),
      subjectId: input.subjectId,
      kind: input.kind,
      quantity,
      runId: input.runId ?? null,
      engine: input.engine ?? null,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    });
    // Only a fresh insert moves the counter (a duplicate must not double-count).
    if (write.inserted) await bumpCounter(input, quantity);
    return write;
  }

  async function reserve(input: MeterInput, limit: number, since: string): Promise<UsageReservation> {
    const quantity = positiveQuantity(input.quantity);
    const result = await repo.reserveUsage(
      {
        id: randomUUID(),
        subjectId: input.subjectId,
        kind: input.kind,
        quantity,
        runId: input.runId ?? null,
        engine: input.engine ?? null,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      },
      limit,
      since,
    );
    // Only a fresh reservation moves the counter (a replay is already counted).
    if (result.inserted) await bumpCounter(input, quantity);
    return result;
  }

  async function recordBatch(inputs: readonly MeterInput[]): Promise<BatchRecordResult> {
    let inserted = 0;
    let duplicates = 0;
    for (const input of inputs) {
      const write = await record(input);
      if (write.inserted) inserted += 1;
      else duplicates += 1;
    }
    return { inserted, duplicates };
  }

  async function flushOnce(limit = batchSize): Promise<number> {
    if (!provider) return 0;

    // Only drain when the provider is truthfully configured — otherwise a
    // degrade-safe no-op `emitUsage` would mark events flushed that never sent.
    let configured = false;
    try {
      const ph = await provider.health();
      configured = ph.configured && ph.status !== 'down';
    } catch (error) {
      deps.logger?.warn?.({ error }, 'metering: provider health probe failed → skip flush');
      return 0;
    }
    if (!configured) return 0;

    let pending;
    try {
      pending = await repo.unflushedUsage(limit);
    } catch (error) {
      deps.logger?.warn?.({ error }, 'metering: unflushed read failed → skip flush');
      return 0;
    }
    if (pending.length === 0) return 0;

    const events: MeterEvent[] = pending.map((u) => ({
      subjectId: u.subjectId,
      kind: u.kind,
      quantity: u.quantity,
      idempotencyKey: u.idempotencyKey,
      timestamp: u.occurredAt,
    }));

    // Best-effort fan-out to any additional sinks (e.g. Railyard Mint), run
    // alongside the primary provider push. Deliberately NOT awaited-and-gated
    // on the primary's outcome below: a sink is a separate rollup target, not
    // part of the mark-flushed contract, so its failure/latency must never
    // change whether THIS batch gets marked flushed against the primary MoR.
    void forwardToSinks(events);

    try {
      await provider.emitUsage(events);
    } catch (error) {
      // Push failed — leave events unflushed for the next tick (never mark).
      deps.logger?.warn?.({ error, count: events.length }, 'metering: provider emitUsage failed → events retained');
      return 0;
    }

    try {
      return await repo.markFlushed(
        pending.map((u) => u.id),
        clock().toISOString(),
      );
    } catch (error) {
      // Emitted but not marked: the next tick re-emits (idempotent by key) —
      // safe over-delivery beats a lost flush.
      deps.logger?.warn?.({ error }, 'metering: markFlushed failed → will re-emit next tick');
      return 0;
    }
  }

  function startFlushLoop(): void {
    if (timer || intervalMs <= 0 || !provider) return;
    timer = setInterval(() => {
      if (flushing) return; // don't overlap ticks
      flushing = true;
      void flushOnce()
        .catch((error) => {
          deps.logger?.warn?.({ error }, 'metering: flush loop tick failed');
        })
        .finally(() => {
          flushing = false;
        });
    }, intervalMs);
    // Never keep the process alive for the flush loop.
    timer.unref?.();
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function health(): ComponentHealth {
    if (!repo.isAvailable()) {
      return degradedHealth(SERVICE_NAME, 'usage ledger repository unavailable — metering degraded');
    }
    if (!provider) {
      return degradedHealth(SERVICE_NAME, 'no billing provider — usage recorded durably but not flushed to a meter feed');
    }
    return healthy(SERVICE_NAME);
  }

  return { record, reserve, recordBatch, flushOnce, startFlushLoop, stop, health };
}
