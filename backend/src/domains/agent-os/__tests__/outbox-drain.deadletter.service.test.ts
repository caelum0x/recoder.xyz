import { describe, it, expect, beforeEach } from 'vitest';
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
 * BE-8.1 — poison-message handling. A record whose delivery keeps failing must
 * eventually be dead-lettered to the terminal `discarded` status (attempts
 * ceiling) with its `lastError` preserved, instead of retrying forever. A
 * per-record backoff window must delay re-claiming a just-failed record. These
 * invariants sit ON TOP of the at-least-once guarantees pinned by
 * `outbox-drain.service.test.ts`.
 */

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

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

function seedPending(repo: InMemoryAgentOsRepository, ids: string[], at = '2026-04-01T00:00:00.000Z'): void {
  for (const id of ids) {
    repo.appendOutbox(createOutboxRecord(cloudEvent(id), at));
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

/** A clock that returns the ISO string it is currently set to (mutable). */
function mutableClock(startIso: string): { now: () => string; set: (iso: string) => void; advance: (ms: number) => void } {
  let current = startIso;
  return {
    now: () => current,
    set: (iso: string) => {
      current = iso;
    },
    advance: (ms: number) => {
      current = new Date(Date.parse(current) + ms).toISOString();
    },
  };
}

describe('OutboxDrainService — dead-letter (attempts ceiling)', () => {
  let repo: InMemoryAgentOsRepository;

  beforeEach(() => {
    repo = new InMemoryAgentOsRepository();
  });

  it('dead-letters a persistently failing record to terminal `discarded` once the attempts ceiling is reached, preserving lastError', async () => {
    seedPending(repo, ['poison']);
    const { publisher } = fakePublisher({ failAll: true });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      maxAttempts: 3,
      // backoff disabled → immediate re-claim so we can burn through the ceiling
      now: () => '2026-05-01T00:00:00.000Z',
    });

    // Pass 1 + 2: under ceiling → stays retriable (pending), at-least-once preserved.
    await drain.drainOnce();
    expect(statusOf(repo, 'outbox_poison')?.status).toBe('pending');
    expect(statusOf(repo, 'outbox_poison')?.attempts).toBe(1);

    await drain.drainOnce();
    expect(statusOf(repo, 'outbox_poison')?.status).toBe('pending');
    expect(statusOf(repo, 'outbox_poison')?.attempts).toBe(2);

    // Pass 3: attempts reaches the ceiling → dead-lettered to terminal `discarded`.
    const third = await drain.drainOnce();
    expect(third.failed).toBe(1);
    const rec = statusOf(repo, 'outbox_poison');
    expect(rec?.status).toBe('discarded');
    expect(rec?.attempts).toBe(3);
    expect(rec?.lastError).toContain('delivery fault');
  });

  it('a discarded record is terminal: it is NOT re-claimed even after the transport recovers', async () => {
    seedPending(repo, ['poison']);
    const failIds = new Set(['poison']);
    const { publisher, delivered } = fakePublisher({ failIds });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      maxAttempts: 2,
      now: () => '2026-05-01T00:00:00.000Z',
    });

    await drain.drainOnce(); // attempts 1 → pending
    await drain.drainOnce(); // attempts 2 → discarded
    expect(statusOf(repo, 'outbox_poison')?.status).toBe('discarded');

    failIds.delete('poison'); // transport recovers
    const after = await drain.drainOnce();
    expect(after.attempted).toBe(0); // discarded is not a claimable pending record
    expect(delivered).toEqual([]); // never re-delivered
    expect(statusOf(repo, 'outbox_poison')?.status).toBe('discarded');
  });

  it('keeps healthy records flowing while a sibling gets dead-lettered (poison isolation)', async () => {
    seedPending(repo, ['good', 'poison']);
    const { publisher, delivered } = fakePublisher({ failIds: new Set(['poison']) });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      maxAttempts: 1, // first failure is terminal
      now: () => '2026-05-01T00:00:00.000Z',
    });

    const stats = await drain.drainOnce();

    expect(delivered).toEqual(['good']);
    expect(statusOf(repo, 'outbox_good')?.status).toBe('published');
    expect(statusOf(repo, 'outbox_poison')?.status).toBe('discarded');
    // The discarded record is no longer pending work.
    expect(stats.remainingPending).toBe(0);
  });

  it('rejects an invalid attempts ceiling at construction (fail fast)', () => {
    const { publisher } = fakePublisher();
    expect(
      () =>
        new OutboxDrainService({
          repository: repo,
          publisher,
          logger: silentLogger,
          intervalMs: 1000,
          batchSize: 10,
          maxAttempts: 0,
        }),
    ).toThrow(/maxAttempts/);
  });
});

describe('OutboxDrainService — per-record backoff', () => {
  let repo: InMemoryAgentOsRepository;

  beforeEach(() => {
    repo = new InMemoryAgentOsRepository();
  });

  it('does not re-claim a just-failed record until its backoff window elapses', async () => {
    const clock = mutableClock('2026-05-01T00:00:00.000Z');
    seedPending(repo, ['x'], clock.now());
    const failIds = new Set(['x']);
    const { publisher, delivered } = fakePublisher({ failIds });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      maxAttempts: 10,
      backoffBaseMs: 1000, // 1s base backoff
      now: clock.now,
    });

    // t0: first attempt fails → record re-opened pending, updatedAt = t0.
    const first = await drain.drainOnce();
    expect(first.failed).toBe(1);
    expect(statusOf(repo, 'outbox_x')?.status).toBe('pending');

    // t0 + 500ms: still inside the 1s backoff window → NOT claimed.
    clock.advance(500);
    const early = await drain.drainOnce();
    expect(early.attempted).toBe(0);
    expect(early.remainingPending).toBe(1); // still queued, just backing off

    // Transport recovers; at t0 + 1000ms the window has elapsed → claimed + delivered.
    failIds.delete('x');
    clock.advance(500);
    const ready = await drain.drainOnce();
    expect(ready.attempted).toBe(1);
    expect(delivered).toEqual(['x']);
    expect(statusOf(repo, 'outbox_x')?.status).toBe('published');
  });

  it('backoff grows exponentially with attempts', async () => {
    const clock = mutableClock('2026-05-01T00:00:00.000Z');
    seedPending(repo, ['x'], clock.now());
    const { publisher } = fakePublisher({ failAll: true });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      maxAttempts: 10,
      backoffBaseMs: 1000,
      now: clock.now,
    });

    // Attempt 1 at t0 → next window is base * 2^0 = 1000ms.
    await drain.drainOnce();
    clock.advance(1000);
    // Ready → attempt 2 → attempts becomes 2, next window is base * 2^1 = 2000ms.
    const second = await drain.drainOnce();
    expect(second.attempted).toBe(1);
    expect(statusOf(repo, 'outbox_x')?.attempts).toBe(2);

    // +1000ms is NOT enough for the 2000ms window after attempt 2.
    clock.advance(1000);
    const tooEarly = await drain.drainOnce();
    expect(tooEarly.attempted).toBe(0);

    // A further +1000ms (total 2000ms) satisfies the widened window.
    clock.advance(1000);
    const now = await drain.drainOnce();
    expect(now.attempted).toBe(1);
    expect(statusOf(repo, 'outbox_x')?.attempts).toBe(3);
  });

  it('backoff disabled (default) re-claims a failed record immediately on the next pass', async () => {
    seedPending(repo, ['x']);
    const failIds = new Set(['x']);
    const { publisher, delivered } = fakePublisher({ failIds });
    const drain = new OutboxDrainService({
      repository: repo,
      publisher,
      logger: silentLogger,
      intervalMs: 1000,
      batchSize: 10,
      // no backoffBaseMs → default 0 (disabled); no maxAttempts → default ceiling
      now: () => '2026-05-01T00:00:00.000Z',
    });

    await drain.drainOnce(); // fails
    failIds.delete('x');
    const second = await drain.drainOnce();
    expect(second.attempted).toBe(1); // immediately re-claimed, no backoff wait
    expect(delivered).toEqual(['x']);
  });
});
