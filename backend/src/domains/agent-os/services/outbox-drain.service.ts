/**
 * `OutboxDrainService` — the at-least-once delivery loop (domain doc §1.3, §8).
 * Merges the legacy `outbox-drain.service.ts` + `outbox-drain-loop.ts` into one:
 * a single `drainOnce()` pass plus a `start()/stop()` interval driver.
 *
 * Each pass claims up to `batchSize` `pending` {@link OutboxRecord}s that are
 * READY (past their per-record backoff window) from the repository and hands
 * each CloudEvent to the {@link OutboxPublisherPort}:
 *  - publish resolves → `markOutboxPublished` (durable delivered).
 *  - publish rejects, attempts still UNDER the ceiling → left retriable
 *    (`pending`), NEVER lost / dropped, with a fresh `updatedAt` stamp that
 *    anchors the next-retry backoff so the record backs off before the next
 *    claim.
 *  - publish rejects, attempts AT/OVER the ceiling → dead-lettered to the
 *    terminal `discarded` status with `lastError` preserved (poison-message
 *    handling: stop retrying forever).
 * The loop is degrade-safe: with the log-only publisher every record simply
 * stays `pending` and is reported truthfully in {@link DrainStats}.
 *
 * Per-record next-retry is DERIVED (`updatedAt + backoffDelay(attempts)`) rather
 * than stored, keeping the shared {@link OutboxRecord} wire contract unchanged.
 * Backoff is opt-in via {@link OutboxDrainDeps.backoffBaseMs} (default `0` =
 * immediate retry, preserving prior behavior).
 */
import { markOutboxFailed, markOutboxPublished, type OutboxRecord } from '@recoder/agent-events';
import type { Logger } from '../../../shared/logger.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import type { OutboxPublisherPort } from '../ports/outbox-publisher.port.js';
import type { DrainStats } from '../types.js';

/**
 * Attempts ceiling before a persistently failing record is dead-lettered to
 * `discarded`. A record that has failed this many times (inclusive) is poison.
 */
const DEFAULT_MAX_ATTEMPTS = 8;

/** Upper bound for a single backoff delay (30 min) so exponential growth caps out. */
const DEFAULT_BACKOFF_MAX_MS = 30 * 60 * 1000;

/** Clamp the exponent so `2 ** exp` never overflows to a non-finite delay. */
const MAX_BACKOFF_EXPONENT = 30;

export interface OutboxDrainDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly publisher: OutboxPublisherPort;
  readonly logger: Logger;
  readonly intervalMs: number;
  readonly batchSize: number;
  readonly now?: () => string;
  /**
   * Attempts ceiling: once a record's `attempts` reaches this, a further
   * delivery fault dead-letters it to terminal `discarded` instead of retrying
   * forever. Defaults to {@link DEFAULT_MAX_ATTEMPTS}. Must be `>= 1`.
   */
  readonly maxAttempts?: number;
  /**
   * Base per-record backoff in ms. `0` (default) disables backoff (immediate
   * retry on the next pass). When `> 0`, a failed record is not re-claimed
   * until `updatedAt + baseMs * 2**(attempts-1)` (capped) has elapsed.
   */
  readonly backoffBaseMs?: number;
  /** Cap for a single backoff delay. Defaults to {@link DEFAULT_BACKOFF_MAX_MS}. */
  readonly backoffMaxMs?: number;
}

export class OutboxDrainService {
  private readonly repository: AgentOsRepositoryPort;
  private readonly publisher: OutboxPublisherPort;
  private readonly logger: Logger;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly now: () => string;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(deps: OutboxDrainDeps) {
    this.repository = deps.repository;
    this.publisher = deps.publisher;
    this.logger = deps.logger;
    this.intervalMs = deps.intervalMs;
    this.batchSize = deps.batchSize;
    this.now = deps.now ?? (() => new Date().toISOString());

    const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error(`OutboxDrainService: maxAttempts must be an integer >= 1, got ${maxAttempts}`);
    }
    this.maxAttempts = maxAttempts;

    const backoffBaseMs = deps.backoffBaseMs ?? 0;
    if (!Number.isFinite(backoffBaseMs) || backoffBaseMs < 0) {
      throw new Error(`OutboxDrainService: backoffBaseMs must be a finite number >= 0, got ${backoffBaseMs}`);
    }
    this.backoffBaseMs = backoffBaseMs;

    const backoffMaxMs = deps.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
    if (!Number.isFinite(backoffMaxMs) || backoffMaxMs < 0) {
      throw new Error(`OutboxDrainService: backoffMaxMs must be a finite number >= 0, got ${backoffMaxMs}`);
    }
    this.backoffMaxMs = backoffMaxMs;
  }

  /** Run one drain pass. Never throws — a publish fault leaves the record `pending`. */
  async drainOnce(): Promise<DrainStats> {
    const nowIso = this.now();
    const nowMs = Date.parse(nowIso);
    const all = await this.repository.listOutbox();
    const pending = all
      .filter((r) => r.status === 'pending' && this.isReady(r, nowMs))
      .slice(0, this.batchSize);

    let published = 0;
    let failed = 0;

    for (const record of pending) {
      try {
        await this.publisher.publish(record.event);
        await this.repository.upsertOutbox(markOutboxPublished(record, nowIso));
        published += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'publish failed';
        const resolved = this.resolveFailed(record, reason, nowIso);
        await this.repository.upsertOutbox(resolved);
        failed += 1;
        if (resolved.status === 'discarded') {
          this.logger.warn(
            { outboxId: record.outboxId, reason, attempts: resolved.attempts, maxAttempts: this.maxAttempts },
            'outbox record dead-lettered (attempts ceiling reached)',
          );
        } else {
          this.logger.warn({ outboxId: record.outboxId, reason }, 'outbox record left retriable');
        }
      }
    }

    const after = await this.repository.listOutbox();
    const remainingPending = after.filter((r) => r.status === 'pending').length;

    return {
      operation: 'outbox.drain',
      attempted: pending.length,
      published,
      failed,
      remainingPending,
    };
  }

  /** Start the interval driver. Idempotent; overlapping passes are skipped. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.draining) return;
      this.draining = true;
      void this.drainOnce()
        .catch((error) => {
          this.logger.warn(
            { err: error instanceof Error ? error.message : String(error) },
            'outbox drain pass failed',
          );
        })
        .finally(() => {
          this.draining = false;
        });
    }, this.intervalMs);
    // Do not keep the event loop alive solely for the drain.
    this.timer.unref?.();
  }

  /** Stop the interval driver. Idempotent, degrade-safe. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * A `pending` record is READY to be claimed when it has never been attempted
   * (`attempts === 0`), when backoff is disabled, or when its derived next-retry
   * time (`updatedAt + backoffDelay(attempts)`) has elapsed. Fail-open on an
   * unparseable `updatedAt` so a record is never stranded forever.
   */
  private isReady(record: OutboxRecord, nowMs: number): boolean {
    if (this.backoffBaseMs <= 0 || record.attempts <= 0) return true;
    const updatedAtMs = Date.parse(record.updatedAt);
    if (Number.isNaN(updatedAtMs) || Number.isNaN(nowMs)) return true;
    return nowMs >= updatedAtMs + this.backoffDelayMs(record.attempts);
  }

  /**
   * Exponential per-record backoff: `baseMs * 2**(attempts-1)`, capped at
   * `backoffMaxMs`. `attempts` is the count of prior failures (>= 1 here).
   */
  private backoffDelayMs(attempts: number): number {
    const exp = Math.min(Math.max(attempts - 1, 0), MAX_BACKOFF_EXPONENT);
    const delay = this.backoffBaseMs * 2 ** exp;
    return Math.min(delay, this.backoffMaxMs);
  }

  /**
   * Resolve a delivery fault into the next record state. `markOutboxFailed`
   * bumps `attempts` and records `lastError`; we then either dead-letter the
   * record to terminal `discarded` (attempts ceiling reached — poison message)
   * or re-open it to `pending` for a backed-off retry (at-least-once preserved
   * under the ceiling). The fresh `updatedAt` from `markOutboxFailed` anchors
   * the next-retry backoff window.
   */
  private resolveFailed(record: OutboxRecord, error: string, now: string): OutboxRecord {
    const failed = markOutboxFailed(record, error, now);
    if (failed.attempts >= this.maxAttempts) {
      return { ...failed, status: 'discarded' };
    }
    return { ...failed, status: 'pending' };
  }
}
