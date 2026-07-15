/**
 * `OutboxDrainService` — the at-least-once delivery loop (domain doc §1.3, §8).
 * Merges the legacy `outbox-drain.service.ts` + `outbox-drain-loop.ts` into one:
 * a single `drainOnce()` pass plus a `start()/stop()` interval driver.
 *
 * Each pass claims up to `batchSize` `pending` {@link OutboxRecord}s from the
 * repository and hands each CloudEvent to the {@link OutboxPublisherPort}:
 *  - publish resolves → `markOutboxPublished` (durable delivered).
 *  - publish rejects  → `markOutboxFailed` (left retriable — NEVER lost / dropped).
 * The loop is degrade-safe: with the log-only publisher every record simply
 * stays `pending` and is reported truthfully in {@link DrainStats}.
 */
import { markOutboxFailed, markOutboxPublished, type OutboxRecord } from '@recoder/agent-events';
import type { Logger } from '../../../shared/logger.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import type { OutboxPublisherPort } from '../ports/outbox-publisher.port.js';
import type { DrainStats } from '../types.js';

export interface OutboxDrainDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly publisher: OutboxPublisherPort;
  readonly logger: Logger;
  readonly intervalMs: number;
  readonly batchSize: number;
  readonly now?: () => string;
}

export class OutboxDrainService {
  private readonly repository: AgentOsRepositoryPort;
  private readonly publisher: OutboxPublisherPort;
  private readonly logger: Logger;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly now: () => string;

  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(deps: OutboxDrainDeps) {
    this.repository = deps.repository;
    this.publisher = deps.publisher;
    this.logger = deps.logger;
    this.intervalMs = deps.intervalMs;
    this.batchSize = deps.batchSize;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /** Run one drain pass. Never throws — a publish fault leaves the record `pending`. */
  async drainOnce(): Promise<DrainStats> {
    const all = await this.repository.listOutbox();
    const pending = all.filter((r) => r.status === 'pending').slice(0, this.batchSize);

    let published = 0;
    let failed = 0;

    for (const record of pending) {
      try {
        await this.publisher.publish(record.event);
        await this.repository.upsertOutbox(markOutboxPublished(record, this.now()));
        published += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'publish failed';
        await this.repository.upsertOutbox(markOutboxFailedRetriable(record, reason, this.now()));
        failed += 1;
        this.logger.warn({ outboxId: record.outboxId, reason }, 'outbox record left retriable');
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
}

/**
 * Mark a record failed but keep it `pending` for the next pass (retriable),
 * recording the error + attempt count. `markOutboxFailed` sets status `failed`;
 * the drain treats failures as retriable, so we re-open the record to `pending`
 * while preserving the attempt/error provenance.
 */
function markOutboxFailedRetriable(record: OutboxRecord, error: string, now: string): OutboxRecord {
  const failedRecord = markOutboxFailed(record, error, now);
  return { ...failedRecord, status: 'pending' };
}
