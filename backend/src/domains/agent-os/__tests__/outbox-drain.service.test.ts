import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createOutboxRecord,
  createRecoderCloudEvent,
  type OutboxRecord,
  type RecoderCloudEvent,
} from '@recoder/agent-events';
import { OutboxDrainService } from '../services/outbox-drain.service.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import type { OutboxPublisherPort } from '../ports/outbox-publisher.port.js';

/**
 * The outbox drain is the at-least-once CloudEvents delivery loop. Its core
 * safety invariant: a publish fault NEVER drops the record — it is left
 * retriable (`pending`) with its error/attempt provenance — and the drain never
 * throws. These tests pin delivery accounting and the never-lost guarantee.
 */

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;
const NOW = '2026-05-01T00:00:00.000Z';

function cloudEvent(id: string): RecoderCloudEvent {
  return createRecoderCloudEvent({
    id,
    type: 'recoder.run.started',
    source: 'recoder://agent-os/test',
    subject: `run/${id}`,
    data: { id },
    time: '2026-04-01T00:00:00.000Z',
  });
}

function seedPending(repo: InMemoryAgentOsRepository, ids: string[]): void {
  for (const id of ids) {
    repo.appendOutbox(createOutboxRecord(cloudEvent(id), '2026-04-01T00:00:00.000Z'));
  }
}

/** A publisher whose fault set decides which events reject (delivery fault). */
function fakePublisher(opts: { failIds?: Set<string>; failAll?: boolean } = {}): {
  publisher: OutboxPublisherPort;
  delivered: string[];
} {
  const delivered: string[] = [];
  const publisher: OutboxPublisherPort = {
    async publish(event: RecoderCloudEvent): Promise<void> {
      if (opts.failAll || opts.failIds?.has(event.id)) {
        throw new Error(`delivery fault for ${event.id}`);
      }
      delivered.push(event.id);
    },
    health: () => 'up',
  };
  return { publisher, delivered };
}

function statusOf(repo: InMemoryAgentOsRepository, outboxId: string): OutboxRecord | undefined {
  return repo.listOutbox().find((r) => r.outboxId === outboxId);
}

describe('OutboxDrainService.drainOnce — at-least-once, never-drop', () => {
  let repo: InMemoryAgentOsRepository;

  beforeEach(() => {
    repo = new InMemoryAgentOsRepository();
  });

  it('publishes every pending record and marks it published (durable delivered)', async () => {
    seedPending(repo, ['a', 'b']);
    const { publisher, delivered } = fakePublisher();
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      now: () => NOW,
    });

    const stats = await drain.drainOnce();

    expect(stats).toEqual({
      operation: 'outbox.drain',
      attempted: 2,
      published: 2,
      failed: 0,
      remainingPending: 0,
    });
    expect(delivered.sort()).toEqual(['a', 'b']);
    expect(statusOf(repo, 'outbox_a')?.status).toBe('published');
    expect(statusOf(repo, 'outbox_b')?.status).toBe('published');
  });

  it('NEVER drops a record on a delivery fault: it stays pending, retriable, with error + attempt provenance', async () => {
    seedPending(repo, ['x']);
    const { publisher } = fakePublisher({ failAll: true });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      now: () => NOW,
    });

    const stats = await drain.drainOnce();

    expect(stats.published).toBe(0);
    expect(stats.failed).toBe(1);
    expect(stats.remainingPending).toBe(1);
    const rec = statusOf(repo, 'outbox_x');
    expect(rec?.status).toBe('pending'); // re-opened for retry, NOT 'failed'/'discarded'
    expect(rec?.attempts).toBe(1); // attempt provenance preserved
    expect(rec?.lastError).toContain('delivery fault');
  });

  it('drainOnce never throws even when the publisher rejects', async () => {
    seedPending(repo, ['x']);
    const { publisher } = fakePublisher({ failAll: true });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      now: () => NOW,
    });

    await expect(drain.drainOnce()).resolves.toMatchObject({ failed: 1 });
  });

  it('a failed record is retried and delivered on the next pass (at-least-once)', async () => {
    seedPending(repo, ['x']);
    const failIds = new Set(['x']);
    const { publisher, delivered } = fakePublisher({ failIds });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      now: () => NOW,
    });

    const first = await drain.drainOnce();
    expect(first.failed).toBe(1);
    expect(statusOf(repo, 'outbox_x')?.status).toBe('pending');

    failIds.delete('x'); // transport recovers
    const second = await drain.drainOnce();
    expect(second.published).toBe(1);
    expect(delivered).toEqual(['x']);
    expect(statusOf(repo, 'outbox_x')?.status).toBe('published');
  });

  it('mixed batch: partial fault publishes the good ones and re-queues the bad one', async () => {
    seedPending(repo, ['ok1', 'bad', 'ok2']);
    const { publisher, delivered } = fakePublisher({ failIds: new Set(['bad']) });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      now: () => NOW,
    });

    const stats = await drain.drainOnce();

    expect(stats.published).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.remainingPending).toBe(1);
    expect(delivered.sort()).toEqual(['ok1', 'ok2']);
    expect(statusOf(repo, 'outbox_bad')?.status).toBe('pending');
  });

  it('honors batchSize: claims at most `batchSize` pending records per pass', async () => {
    seedPending(repo, ['a', 'b', 'c', 'd']);
    const { publisher, delivered } = fakePublisher();
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 2,
      now: () => NOW,
    });

    const stats = await drain.drainOnce();

    expect(stats.attempted).toBe(2);
    expect(stats.published).toBe(2);
    expect(stats.remainingPending).toBe(2); // the rest still queued
    expect(delivered).toHaveLength(2);
  });

  it('claims only `pending` records — already-published records are not re-delivered', async () => {
    seedPending(repo, ['fresh']);
    // Seed an already-published record; it must be ignored.
    repo.appendOutbox({ ...createOutboxRecord(cloudEvent('done'), NOW), status: 'published' });
    const { publisher, delivered } = fakePublisher();
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      now: () => NOW,
    });

    const stats = await drain.drainOnce();

    expect(stats.attempted).toBe(1);
    expect(delivered).toEqual(['fresh']);
  });

  it('an empty outbox drains to a zero-work stats result', async () => {
    const { publisher } = fakePublisher();
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      now: () => NOW,
    });

    const stats = await drain.drainOnce();

    expect(stats).toEqual({
      operation: 'outbox.drain',
      attempted: 0,
      published: 0,
      failed: 0,
      remainingPending: 0,
    });
  });
});

describe('OutboxDrainService.start/stop — interval driver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() drives drainOnce on the interval; stop() halts it; both are idempotent', async () => {
    const repo = new InMemoryAgentOsRepository();
    seedPending(repo, ['a']);
    const { publisher, delivered } = fakePublisher();
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 100,
      batchSize: 10,
      now: () => NOW,
    });

    drain.start();
    drain.start(); // idempotent — must not double-schedule

    await vi.advanceTimersByTimeAsync(100);
    expect(delivered).toEqual(['a']);

    drain.stop();
    drain.stop(); // idempotent

    seedPending(repo, ['b']);
    await vi.advanceTimersByTimeAsync(500);
    expect(delivered).toEqual(['a']); // no further drains after stop
  });
});
