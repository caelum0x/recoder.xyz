import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { PromptTaskQueueStore } from './prompt-task-queue.js';

const tempDirs: string[] = [];

function createStore(): { store: PromptTaskQueueStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recoder-prompt-queue-'));
  tempDirs.push(dir);
  const dbPath = path.join(dir, 'queue.sqlite');
  return {
    store: new PromptTaskQueueStore(dbPath),
    dir,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('PromptTaskQueueStore', () => {
  it('supports enqueue, claim, reschedule, and ack', async () => {
    const { store } = createStore();
    const now = Date.now();
    await store.enqueue('task-1', { runAt: now, attempt: 0 });

    const claimed = await store.claimDue(now, 10, 30_000);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ taskId: 'task-1', attempt: 0 });

    // Should not be claimable while lease is active
    expect(await store.claimDue(now + 1_000, 10, 30_000)).toHaveLength(0);

    await store.reschedule('task-1', { runAt: now + 5_000, attempt: 1, lastError: 'temporary' });
    expect(await store.claimDue(now + 2_000, 10, 30_000)).toHaveLength(0);

    const retryClaim = await store.claimDue(now + 5_100, 10, 30_000);
    expect(retryClaim).toHaveLength(1);
    expect(retryClaim[0]).toMatchObject({
      taskId: 'task-1',
      attempt: 1,
      lastError: 'temporary',
    });

    await store.ack('task-1');
    expect(await store.claimDue(now + 10_000, 10, 30_000)).toHaveLength(0);
  });

  it('moves permanently failed tasks to dead-letter queue', async () => {
    const { store } = createStore();
    const now = Date.now();
    await store.enqueue('task-dlq', { runAt: now, attempt: 3 });

    // Claim it
    const claimed = await store.claimDue(now, 10, 30_000);
    expect(claimed).toHaveLength(1);

    // Dead-letter it
    await store.deadLetter('task-dlq', {
      attempts: 4,
      lastError: 'Provider timeout after 4 retries',
    });

    // No longer in active queue
    expect(await store.claimDue(now + 60_000, 10, 30_000)).toHaveLength(0);

    // Appears in DLQ
    const dlq = await store.listDeadLetters();
    expect(dlq).toHaveLength(1);
    expect(dlq[0]).toMatchObject({
      taskId: 'task-dlq',
      attempts: 4,
      lastError: 'Provider timeout after 4 retries',
    });
    expect(dlq[0].failedAt).toBeGreaterThan(0);
  });

  it('releases zombie locks older than threshold', async () => {
    const { store } = createStore();
    const now = Date.now();
    await store.enqueue('task-zombie', { runAt: now, attempt: 0 });

    // Claim with a 30s lease
    const claimed = await store.claimDue(now, 10, 30_000);
    expect(claimed).toHaveLength(1);

    // Not claimable yet (lease active)
    expect(await store.claimDue(now + 1_000, 10, 30_000)).toHaveLength(0);

    // Release zombies older than 5 minutes from a future timestamp
    const futureNow = now + 400_000; // 6.7 min later
    const released = await store.releaseZombieLocks(futureNow, 300_000); // 5 min threshold
    expect(released).toBe(1);

    // Now claimable again
    const reclaimed = await store.claimDue(futureNow, 10, 30_000);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0].taskId).toBe('task-zombie');
  });

  it('listDeadLetters returns empty when no failures', async () => {
    const { store } = createStore();
    const dlq = await store.listDeadLetters();
    expect(dlq).toEqual([]);
  });
});
