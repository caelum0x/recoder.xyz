/**
 * @module task-queue.test
 *
 * Comprehensive test suite for the A2A task queue service.
 *
 * Covers:
 * - Enqueue with defaults and custom options
 * - Priority-based dequeue ordering
 * - FIFO ordering within the same priority
 * - Delayed / scheduled task handling
 * - Peek without dequeue
 * - Complete and fail lifecycle
 * - Retry with exponential backoff
 * - Dead letter queue management
 * - Task listing with status filters
 * - Queue statistics
 * - Event emission
 * - Singleton management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  A2ATaskQueue,
  getA2ATaskQueue,
  resetA2ATaskQueue,
  resetIdCounter,
  type QueuedTask,
  type EnqueueOptions,
  type TaskQueueEventName,
} from '../task-queue.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueue(): A2ATaskQueue {
  return new A2ATaskQueue();
}

function enqueueDefaults(overrides: Partial<EnqueueOptions> = {}): EnqueueOptions {
  return {
    agentId: 'agent-1',
    prompt: 'Do something',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('A2ATaskQueue', () => {
  let queue: A2ATaskQueue;

  beforeEach(() => {
    queue = makeQueue();
    resetIdCounter();
  });

  afterEach(() => {
    queue.reset();
    resetA2ATaskQueue();
  });

  // -----------------------------------------------------------------------
  // 1. Enqueue returns a QueuedTask with correct defaults
  // -----------------------------------------------------------------------
  describe('enqueue', () => {
    it('returns a QueuedTask with correct defaults', () => {
      const task = queue.enqueue(enqueueDefaults());

      expect(task.queueId).toMatch(/^q_/);
      expect(task.agentId).toBe('agent-1');
      expect(task.prompt).toBe('Do something');
      expect(task.priority).toBe('normal');
      expect(task.status).toBe('queued');
      expect(task.attempts).toBe(0);
      expect(task.maxRetries).toBe(3);
      expect(task.retryBackoffMs).toBe(1000);
      expect(task.enqueuedAt).toBeTruthy();
      expect(task.scheduledFor).toBeUndefined();
      expect(task.taskId).toBeUndefined();
      expect(task.metadata).toBeUndefined();
    });

    // -------------------------------------------------------------------
    // 2. Enqueue with custom priority
    // -------------------------------------------------------------------
    it('enqueues with custom priority', () => {
      const task = queue.enqueue(enqueueDefaults({ priority: 'critical' }));
      expect(task.priority).toBe('critical');
    });

    // -------------------------------------------------------------------
    // 3. Enqueue with delay
    // -------------------------------------------------------------------
    it('enqueues with delay and sets scheduledFor', () => {
      const before = Date.now();
      const task = queue.enqueue(enqueueDefaults({ delayMs: 5000 }));
      const after = Date.now();

      expect(task.scheduledFor).toBeDefined();
      const scheduled = new Date(task.scheduledFor!).getTime();
      expect(scheduled).toBeGreaterThanOrEqual(before + 5000);
      expect(scheduled).toBeLessThanOrEqual(after + 5000);
    });

    it('enqueues with taskId and metadata', () => {
      const task = queue.enqueue(
        enqueueDefaults({
          taskId: 'task_abc',
          metadata: { source: 'test' },
        }),
      );
      expect(task.taskId).toBe('task_abc');
      expect(task.metadata).toEqual({ source: 'test' });
    });
  });

  // -----------------------------------------------------------------------
  // 4. Dequeue returns highest priority first
  // -----------------------------------------------------------------------
  describe('dequeue', () => {
    it('returns highest priority first', () => {
      queue.enqueue(enqueueDefaults({ priority: 'low', prompt: 'low' }));
      queue.enqueue(enqueueDefaults({ priority: 'critical', prompt: 'critical' }));
      queue.enqueue(enqueueDefaults({ priority: 'high', prompt: 'high' }));
      queue.enqueue(enqueueDefaults({ priority: 'normal', prompt: 'normal' }));

      const t1 = queue.dequeue();
      const t2 = queue.dequeue();
      const t3 = queue.dequeue();
      const t4 = queue.dequeue();

      expect(t1?.prompt).toBe('critical');
      expect(t2?.prompt).toBe('high');
      expect(t3?.prompt).toBe('normal');
      expect(t4?.prompt).toBe('low');
    });

    // -------------------------------------------------------------------
    // 5. Dequeue returns FIFO within same priority
    // -------------------------------------------------------------------
    it('returns FIFO within same priority', () => {
      // Enqueue three tasks all at normal priority with distinct timestamps.
      // We force different enqueuedAt by manually setting them.
      const t1 = queue.enqueue(enqueueDefaults({ prompt: 'first' }));
      const t2 = queue.enqueue(enqueueDefaults({ prompt: 'second' }));
      const t3 = queue.enqueue(enqueueDefaults({ prompt: 'third' }));

      // Ensure enqueuedAt ordering is deterministic
      t1.enqueuedAt = '2025-01-01T00:00:01.000Z';
      t2.enqueuedAt = '2025-01-01T00:00:02.000Z';
      t3.enqueuedAt = '2025-01-01T00:00:03.000Z';

      expect(queue.dequeue()?.prompt).toBe('first');
      expect(queue.dequeue()?.prompt).toBe('second');
      expect(queue.dequeue()?.prompt).toBe('third');
    });

    // -------------------------------------------------------------------
    // 6. Dequeue skips delayed tasks
    // -------------------------------------------------------------------
    it('skips delayed tasks that are not yet ready', () => {
      queue.enqueue(enqueueDefaults({ prompt: 'delayed', delayMs: 60_000 }));
      queue.enqueue(enqueueDefaults({ prompt: 'ready' }));

      const task = queue.dequeue();
      expect(task?.prompt).toBe('ready');

      // The delayed task should still be in the queue but not dequeued
      expect(queue.size()).toBe(1);
    });

    // -------------------------------------------------------------------
    // 7. Dequeue returns undefined when queue is empty
    // -------------------------------------------------------------------
    it('returns undefined when queue is empty', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('sets status to processing and increments attempts', () => {
      queue.enqueue(enqueueDefaults());
      const task = queue.dequeue()!;

      expect(task.status).toBe('processing');
      expect(task.attempts).toBe(1);
      expect(task.processingStartedAt).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 8. Peek returns next task without removing it
  // -----------------------------------------------------------------------
  describe('peek', () => {
    it('returns next task without removing it', () => {
      queue.enqueue(enqueueDefaults({ prompt: 'peeked' }));

      const peeked = queue.peek();
      expect(peeked?.prompt).toBe('peeked');
      expect(peeked?.status).toBe('queued');

      // Queue size should still be 1
      expect(queue.size()).toBe(1);

      // Dequeue should return the same task
      const dequeued = queue.dequeue();
      expect(dequeued?.queueId).toBe(peeked?.queueId);
    });

    it('returns undefined when queue is empty', () => {
      expect(queue.peek()).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 9. Complete marks task as completed
  // -----------------------------------------------------------------------
  describe('complete', () => {
    it('marks task as completed', () => {
      queue.enqueue(enqueueDefaults());
      const task = queue.dequeue()!;

      queue.complete(task.queueId);

      const updated = queue.getTask(task.queueId)!;
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeTruthy();
    });

    // -------------------------------------------------------------------
    // 10. Complete with output
    // -------------------------------------------------------------------
    it('marks task as completed with output', () => {
      queue.enqueue(enqueueDefaults());
      const task = queue.dequeue()!;

      queue.complete(task.queueId, 'Result data here');

      const updated = queue.getTask(task.queueId)!;
      expect(updated.status).toBe('completed');
      expect(updated.output).toBe('Result data here');
    });

    it('handles unknown queueId gracefully', () => {
      // Should not throw
      queue.complete('nonexistent');
    });
  });

  // -----------------------------------------------------------------------
  // 11. Fail with retries remaining -- re-enqueues
  // -----------------------------------------------------------------------
  describe('fail', () => {
    it('re-enqueues with backoff when retries remain', () => {
      queue.enqueue(enqueueDefaults({ maxRetries: 3 }));
      const task = queue.dequeue()!;

      expect(task.attempts).toBe(1);

      queue.fail(task.queueId, 'Connection timeout');

      const updated = queue.getTask(task.queueId)!;
      expect(updated.status).toBe('queued');
      expect(updated.lastError).toBe('Connection timeout');
      expect(updated.scheduledFor).toBeTruthy();
    });

    // -------------------------------------------------------------------
    // 12. Fail exhausting retries -- dead-letters
    // -------------------------------------------------------------------
    it('dead-letters when max retries exhausted', () => {
      queue.enqueue(enqueueDefaults({ maxRetries: 1 }));
      const task = queue.dequeue()!; // attempts = 1

      queue.fail(task.queueId, 'Fatal error');

      const updated = queue.getTask(task.queueId)!;
      expect(updated.status).toBe('dead-letter');
      expect(updated.lastError).toBe('Fatal error');
    });

    // -------------------------------------------------------------------
    // 13. Retry backoff timing is correct
    // -------------------------------------------------------------------
    it('applies correct exponential backoff timing', () => {
      const retryBackoffMs = 1000;
      queue.enqueue(enqueueDefaults({ maxRetries: 4, retryBackoffMs }));

      // First dequeue: attempts = 1
      const task = queue.dequeue()!;
      const beforeFail1 = Date.now();
      queue.fail(task.queueId, 'err1');

      // After first fail (attempts=1): backoff = 1000 * 2^(1-1) = 1000ms
      const scheduled1 = new Date(task.scheduledFor!).getTime();
      expect(scheduled1).toBeGreaterThanOrEqual(beforeFail1 + 1000);
      expect(scheduled1).toBeLessThanOrEqual(beforeFail1 + 1000 + 100);

      // Simulate time passing -- make the task ready for dequeue
      task.scheduledFor = new Date(Date.now() - 1).toISOString();
      const task2 = queue.dequeue()!;
      expect(task2.attempts).toBe(2);

      const beforeFail2 = Date.now();
      queue.fail(task2.queueId, 'err2');

      // After second fail (attempts=2): backoff = 1000 * 2^(2-1) = 2000ms
      const scheduled2 = new Date(task2.scheduledFor!).getTime();
      expect(scheduled2).toBeGreaterThanOrEqual(beforeFail2 + 2000);
      expect(scheduled2).toBeLessThanOrEqual(beforeFail2 + 2000 + 100);
    });

    it('handles unknown queueId gracefully', () => {
      // Should not throw
      queue.fail('nonexistent', 'oops');
    });
  });

  // -----------------------------------------------------------------------
  // 14. getDeadLetterQueue returns dead-lettered tasks
  // -----------------------------------------------------------------------
  describe('getDeadLetterQueue', () => {
    it('returns dead-lettered tasks', () => {
      queue.enqueue(enqueueDefaults({ maxRetries: 1, prompt: 'will-die' }));
      queue.enqueue(enqueueDefaults({ prompt: 'still-alive' }));

      const task = queue.dequeue()!;
      queue.fail(task.queueId, 'fatal');

      const dlq = queue.getDeadLetterQueue();
      expect(dlq).toHaveLength(1);
      expect(dlq[0].prompt).toBe('will-die');
      expect(dlq[0].status).toBe('dead-letter');
    });
  });

  // -----------------------------------------------------------------------
  // 15. retryDeadLetter moves task back to queued
  // -----------------------------------------------------------------------
  describe('retryDeadLetter', () => {
    it('moves dead-lettered task back to queued', () => {
      queue.enqueue(enqueueDefaults({ maxRetries: 1 }));
      const task = queue.dequeue()!;
      queue.fail(task.queueId, 'fatal');

      expect(queue.getTask(task.queueId)!.status).toBe('dead-letter');

      const retried = queue.retryDeadLetter(task.queueId);
      expect(retried).toBeDefined();
      expect(retried!.status).toBe('queued');
      expect(retried!.attempts).toBe(0);
      expect(retried!.lastError).toBeUndefined();
      expect(retried!.scheduledFor).toBeUndefined();
    });

    it('returns undefined for non-dead-lettered task', () => {
      queue.enqueue(enqueueDefaults());
      const task = queue.dequeue()!;

      expect(queue.retryDeadLetter(task.queueId)).toBeUndefined();
    });

    it('returns undefined for unknown queueId', () => {
      expect(queue.retryDeadLetter('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 16. removeDeadLetter permanently removes task
  // -----------------------------------------------------------------------
  describe('removeDeadLetter', () => {
    it('permanently removes dead-lettered task', () => {
      queue.enqueue(enqueueDefaults({ maxRetries: 1 }));
      const task = queue.dequeue()!;
      queue.fail(task.queueId, 'fatal');

      expect(queue.removeDeadLetter(task.queueId)).toBe(true);
      expect(queue.getTask(task.queueId)).toBeUndefined();
      expect(queue.getDeadLetterQueue()).toHaveLength(0);
    });

    it('returns false for non-dead-lettered task', () => {
      queue.enqueue(enqueueDefaults());
      const task = queue.dequeue()!;

      expect(queue.removeDeadLetter(task.queueId)).toBe(false);
    });

    it('returns false for unknown queueId', () => {
      expect(queue.removeDeadLetter('nonexistent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 17. listTasks with status filter
  // -----------------------------------------------------------------------
  describe('listTasks', () => {
    it('lists all tasks when no filter provided', () => {
      queue.enqueue(enqueueDefaults({ prompt: 'a' }));
      queue.enqueue(enqueueDefaults({ prompt: 'b' }));
      queue.enqueue(enqueueDefaults({ prompt: 'c' }));

      expect(queue.listTasks()).toHaveLength(3);
    });

    it('lists tasks filtered by status', () => {
      queue.enqueue(enqueueDefaults({ prompt: 'a' }));
      queue.enqueue(enqueueDefaults({ prompt: 'b' }));
      queue.dequeue(); // marks first as processing

      expect(queue.listTasks('queued')).toHaveLength(1);
      expect(queue.listTasks('processing')).toHaveLength(1);
      expect(queue.listTasks('completed')).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 18. getStats returns correct counts
  // -----------------------------------------------------------------------
  describe('getStats', () => {
    it('returns correct counts', () => {
      // Enqueue 3 tasks with different priorities
      queue.enqueue(enqueueDefaults({ priority: 'critical' }));
      queue.enqueue(enqueueDefaults({ priority: 'high' }));
      queue.enqueue(enqueueDefaults({ priority: 'normal' }));

      // Dequeue and complete one
      const t1 = queue.dequeue()!;
      queue.complete(t1.queueId);

      // Dequeue and fail one (maxRetries=1 -> dead-letter)
      const t2 = queue.dequeue()!;
      // Override maxRetries for this task
      t2.maxRetries = 1;
      queue.fail(t2.queueId, 'err');

      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(3);
      expect(stats.totalProcessed).toBe(1);
      expect(stats.totalFailed).toBe(1);
      expect(stats.totalDeadLettered).toBe(1);
      expect(stats.queuedCount).toBe(1);
      expect(stats.processingCount).toBe(0);
      expect(stats.deadLetterCount).toBe(1);
      expect(stats.byPriority.normal).toBe(1);
    });

    it('reports byPriority for queued tasks only', () => {
      queue.enqueue(enqueueDefaults({ priority: 'critical' }));
      queue.enqueue(enqueueDefaults({ priority: 'critical' }));
      queue.enqueue(enqueueDefaults({ priority: 'low' }));

      const stats = queue.getStats();
      expect(stats.byPriority.critical).toBe(2);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.byPriority.high).toBe(0);
      expect(stats.byPriority.normal).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 19. size() returns queued count only
  // -----------------------------------------------------------------------
  describe('size', () => {
    it('returns queued count only', () => {
      queue.enqueue(enqueueDefaults());
      queue.enqueue(enqueueDefaults());
      queue.enqueue(enqueueDefaults());

      expect(queue.size()).toBe(3);

      queue.dequeue(); // -> processing
      expect(queue.size()).toBe(2);

      queue.dequeue(); // -> processing
      expect(queue.size()).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // 20. Events emitted: enqueued, processing, completed, failed, retry,
  //     dead-letter
  // -----------------------------------------------------------------------
  describe('events', () => {
    it('emits task:enqueued on enqueue', () => {
      const handler = vi.fn();
      queue.on('task:enqueued', handler);

      const task = queue.enqueue(enqueueDefaults());

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(task);
    });

    it('emits task:processing on dequeue', () => {
      const handler = vi.fn();
      queue.on('task:processing', handler);

      queue.enqueue(enqueueDefaults());
      const task = queue.dequeue()!;

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(task);
    });

    it('emits task:completed on complete', () => {
      const handler = vi.fn();
      queue.on('task:completed', handler);

      queue.enqueue(enqueueDefaults());
      const task = queue.dequeue()!;
      queue.complete(task.queueId, 'done');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].status).toBe('completed');
    });

    it('emits task:failed and task:retry on fail with retries remaining', () => {
      const failHandler = vi.fn();
      const retryHandler = vi.fn();
      queue.on('task:failed', failHandler);
      queue.on('task:retry', retryHandler);

      queue.enqueue(enqueueDefaults({ maxRetries: 3 }));
      const task = queue.dequeue()!;
      queue.fail(task.queueId, 'timeout');

      expect(failHandler).toHaveBeenCalledTimes(1);
      expect(retryHandler).toHaveBeenCalledTimes(1);
    });

    it('emits task:failed and task:dead-letter when retries exhausted', () => {
      const failHandler = vi.fn();
      const deadLetterHandler = vi.fn();
      const retryHandler = vi.fn();
      queue.on('task:failed', failHandler);
      queue.on('task:dead-letter', deadLetterHandler);
      queue.on('task:retry', retryHandler);

      queue.enqueue(enqueueDefaults({ maxRetries: 1 }));
      const task = queue.dequeue()!; // attempts = 1
      queue.fail(task.queueId, 'fatal');

      expect(failHandler).toHaveBeenCalledTimes(1);
      expect(deadLetterHandler).toHaveBeenCalledTimes(1);
      expect(retryHandler).not.toHaveBeenCalled();
    });

    it('emits task:enqueued when retrying a dead-lettered task', () => {
      const handler = vi.fn();

      queue.enqueue(enqueueDefaults({ maxRetries: 1 }));
      const task = queue.dequeue()!;
      queue.fail(task.queueId, 'fatal');

      queue.on('task:enqueued', handler);
      queue.retryDeadLetter(task.queueId);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 21. Singleton management (get/reset)
  // -----------------------------------------------------------------------
  describe('singleton', () => {
    it('getA2ATaskQueue returns the same instance', () => {
      const q1 = getA2ATaskQueue();
      const q2 = getA2ATaskQueue();
      expect(q1).toBe(q2);
    });

    it('resetA2ATaskQueue clears and creates a new instance', () => {
      const q1 = getA2ATaskQueue();
      q1.enqueue(enqueueDefaults());
      expect(q1.size()).toBe(1);

      resetA2ATaskQueue();

      const q2 = getA2ATaskQueue();
      expect(q2).not.toBe(q1);
      expect(q2.size()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 22. Multiple priorities interleaved correctly
  // -----------------------------------------------------------------------
  describe('multiple priorities interleaved', () => {
    it('dequeues in correct order with mixed priorities', () => {
      // Enqueue in random order
      queue.enqueue(enqueueDefaults({ priority: 'normal', prompt: 'n1' }));
      queue.enqueue(enqueueDefaults({ priority: 'critical', prompt: 'c1' }));
      queue.enqueue(enqueueDefaults({ priority: 'low', prompt: 'l1' }));
      queue.enqueue(enqueueDefaults({ priority: 'high', prompt: 'h1' }));
      queue.enqueue(enqueueDefaults({ priority: 'critical', prompt: 'c2' }));
      queue.enqueue(enqueueDefaults({ priority: 'normal', prompt: 'n2' }));
      queue.enqueue(enqueueDefaults({ priority: 'high', prompt: 'h2' }));
      queue.enqueue(enqueueDefaults({ priority: 'low', prompt: 'l2' }));

      const order: string[] = [];
      let task: QueuedTask | undefined;
      while ((task = queue.dequeue())) {
        order.push(task.prompt);
      }

      expect(order).toEqual([
        'c1', 'c2',     // critical (FIFO within priority)
        'h1', 'h2',     // high
        'n1', 'n2',     // normal
        'l1', 'l2',     // low
      ]);
    });

    it('correctly interleaves when tasks are enqueued between dequeues', () => {
      queue.enqueue(enqueueDefaults({ priority: 'low', prompt: 'l1' }));
      queue.enqueue(enqueueDefaults({ priority: 'normal', prompt: 'n1' }));

      // First dequeue should be normal (higher priority than low)
      expect(queue.dequeue()?.prompt).toBe('n1');

      // Now enqueue a critical task
      queue.enqueue(enqueueDefaults({ priority: 'critical', prompt: 'c1' }));

      // Next dequeue should be critical (higher than low)
      expect(queue.dequeue()?.prompt).toBe('c1');

      // Finally the low priority task
      expect(queue.dequeue()?.prompt).toBe('l1');

      expect(queue.dequeue()).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // reset
  // -----------------------------------------------------------------------
  describe('reset', () => {
    it('clears all tasks and stats', () => {
      queue.enqueue(enqueueDefaults());
      queue.enqueue(enqueueDefaults());
      queue.dequeue();

      queue.reset();

      expect(queue.size()).toBe(0);
      expect(queue.listTasks()).toHaveLength(0);

      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(0);
      expect(stats.totalProcessed).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.totalDeadLettered).toBe(0);
    });
  });
});
