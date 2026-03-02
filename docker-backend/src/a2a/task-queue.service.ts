/**
 * @module task-queue.service
 *
 * In-memory priority-based task queue with retry and dead letter queue support
 * for the docker-backend A2A ecosystem.
 *
 * Features:
 * - Priority-based dequeue ordering (critical > high > normal > low)
 * - FIFO ordering within the same priority level
 * - Configurable retry with exponential backoff
 * - Dead letter queue for tasks that exhaust retries
 * - Delayed / scheduled task support
 * - Event emission for lifecycle transitions
 * - Queue statistics
 *
 * This is a pure in-memory implementation suitable for single-process
 * deployments. For distributed setups, replace with a Redis-backed
 * implementation.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../logger';

const logger = createLogger('a2a-task-queue');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';
export type QueuedTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'dead-letter';

export interface QueuedTask {
  /** Unique task ID in the queue */
  queueId: string;
  /** Reference to the A2A task ID (optional) */
  taskId?: string;
  /** Agent to execute the task */
  agentId: string;
  /** Task prompt / payload */
  prompt: string;
  /** Priority level */
  priority: TaskPriority;
  /** Current status */
  status: QueuedTaskStatus;
  /** Number of attempts so far */
  attempts: number;
  /** Max retry attempts (default 3) */
  maxRetries: number;
  /** Backoff base in ms (default 1000) */
  retryBackoffMs: number;
  /** When the task was enqueued */
  enqueuedAt: string;
  /** When the task should be processed (for delayed tasks) */
  scheduledFor?: string;
  /** When processing started */
  processingStartedAt?: string;
  /** When processing completed */
  completedAt?: string;
  /** Result output */
  output?: string;
  /** Last error message */
  lastError?: string;
  /** Metadata */
  metadata?: Record<string, string>;
}

export interface EnqueueOptions {
  taskId?: string;
  agentId: string;
  prompt: string;
  priority?: TaskPriority;
  maxRetries?: number;
  retryBackoffMs?: number;
  /** Delay before processing (ms) */
  delayMs?: number;
  metadata?: Record<string, string>;
}

export interface QueueStats {
  totalEnqueued: number;
  totalProcessed: number;
  totalFailed: number;
  totalDeadLettered: number;
  queuedCount: number;
  processingCount: number;
  deadLetterCount: number;
  byPriority: Record<TaskPriority, number>;
}

export type TaskQueueEventName =
  | 'task:enqueued'
  | 'task:processing'
  | 'task:completed'
  | 'task:failed'
  | 'task:retry'
  | 'task:dead-letter';

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _idCounter = 0;

function generateQueueId(): string {
  const ts = Date.now().toString(36);
  const counter = (_idCounter++).toString(36).padStart(4, '0');
  return `q_${ts}_${counter}`;
}

/** Reset the ID counter (visible for testing). */
export function resetIdCounter(): void {
  _idCounter = 0;
}

// ---------------------------------------------------------------------------
// A2ATaskQueue
// ---------------------------------------------------------------------------

export class A2ATaskQueue extends EventEmitter {
  /** All tasks indexed by queueId. */
  private readonly tasks = new Map<string, QueuedTask>();

  /** Cumulative counters for stats. */
  private stats = {
    totalEnqueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalDeadLettered: 0,
  };

  // -----------------------------------------------------------------------
  // Enqueue
  // -----------------------------------------------------------------------

  /**
   * Add a task to the queue.
   */
  enqueue(options: EnqueueOptions): QueuedTask {
    const now = new Date().toISOString();
    const priority = options.priority ?? 'normal';
    const maxRetries = options.maxRetries ?? 3;
    const retryBackoffMs = options.retryBackoffMs ?? 1000;

    const task: QueuedTask = {
      queueId: generateQueueId(),
      taskId: options.taskId,
      agentId: options.agentId,
      prompt: options.prompt,
      priority,
      status: 'queued',
      attempts: 0,
      maxRetries,
      retryBackoffMs,
      enqueuedAt: now,
      metadata: options.metadata,
    };

    if (options.delayMs != null && options.delayMs > 0) {
      task.scheduledFor = new Date(Date.now() + options.delayMs).toISOString();
    }

    this.tasks.set(task.queueId, task);
    this.stats.totalEnqueued++;

    logger.debug(
      { queueId: task.queueId, agentId: task.agentId, priority },
      'task enqueued',
    );

    this.emit('task:enqueued', task);
    return task;
  }

  // -----------------------------------------------------------------------
  // Dequeue / Peek
  // -----------------------------------------------------------------------

  /**
   * Dequeue the next task (highest priority first, then FIFO within priority).
   * Only returns tasks with status 'queued' that are past their scheduledFor time.
   * Sets the task status to 'processing'.
   */
  dequeue(): QueuedTask | undefined {
    const candidate = this.findNextCandidate();
    if (!candidate) return undefined;

    candidate.status = 'processing';
    candidate.attempts++;
    candidate.processingStartedAt = new Date().toISOString();

    logger.debug(
      { queueId: candidate.queueId, attempt: candidate.attempts },
      'task dequeued for processing',
    );

    this.emit('task:processing', candidate);
    return candidate;
  }

  /**
   * Peek at the next task without dequeuing it.
   */
  peek(): QueuedTask | undefined {
    return this.findNextCandidate();
  }

  /**
   * Find the next eligible candidate: status === 'queued' and scheduledFor
   * is either absent or in the past. Among eligible tasks, pick the one with
   * the highest priority; within the same priority, pick the earliest enqueued.
   */
  private findNextCandidate(): QueuedTask | undefined {
    const now = Date.now();
    let best: QueuedTask | undefined;

    for (const task of this.tasks.values()) {
      if (task.status !== 'queued') continue;

      // Skip tasks scheduled for the future
      if (task.scheduledFor && new Date(task.scheduledFor).getTime() > now) {
        continue;
      }

      if (!best) {
        best = task;
        continue;
      }

      const priorityCmp = PRIORITY_ORDER[task.priority] - PRIORITY_ORDER[best.priority];
      if (priorityCmp < 0) {
        // task has higher priority
        best = task;
      } else if (priorityCmp === 0) {
        // Same priority -- FIFO (earlier enqueuedAt wins)
        if (task.enqueuedAt < best.enqueuedAt) {
          best = task;
        }
      }
    }

    return best;
  }

  // -----------------------------------------------------------------------
  // Complete / Fail
  // -----------------------------------------------------------------------

  /**
   * Mark a task as completed with optional output.
   */
  complete(queueId: string, output?: string): void {
    const task = this.tasks.get(queueId);
    if (!task) {
      logger.warn({ queueId }, 'complete called for unknown task');
      return;
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    if (output !== undefined) {
      task.output = output;
    }
    this.stats.totalProcessed++;

    logger.debug({ queueId }, 'task completed');
    this.emit('task:completed', task);
  }

  /**
   * Mark a task as failed. If retries remain, re-enqueue with backoff.
   * If max retries exhausted, move to dead letter queue.
   */
  fail(queueId: string, error: string): void {
    const task = this.tasks.get(queueId);
    if (!task) {
      logger.warn({ queueId }, 'fail called for unknown task');
      return;
    }

    task.lastError = error;
    this.stats.totalFailed++;

    if (task.attempts < task.maxRetries) {
      // Retry with exponential backoff
      const backoff = task.retryBackoffMs * Math.pow(2, task.attempts - 1);
      task.status = 'queued';
      task.scheduledFor = new Date(Date.now() + backoff).toISOString();

      logger.debug(
        { queueId, attempt: task.attempts, backoffMs: backoff },
        'task scheduled for retry',
      );

      this.emit('task:retry', task);
    } else {
      // Dead-letter
      task.status = 'dead-letter';
      this.stats.totalDeadLettered++;

      logger.warn(
        { queueId, attempts: task.attempts, maxRetries: task.maxRetries },
        'task moved to dead letter queue',
      );

      this.emit('task:dead-letter', task);
    }

    this.emit('task:failed', task);
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * Get a specific queued task by ID.
   */
  getTask(queueId: string): QueuedTask | undefined {
    return this.tasks.get(queueId);
  }

  /**
   * List tasks with optional status filter.
   */
  listTasks(status?: QueuedTaskStatus): QueuedTask[] {
    const all = Array.from(this.tasks.values());
    if (!status) return all;
    return all.filter((t) => t.status === status);
  }

  /**
   * Get all tasks in the dead letter queue.
   */
  getDeadLetterQueue(): QueuedTask[] {
    return this.listTasks('dead-letter');
  }

  // -----------------------------------------------------------------------
  // Dead letter management
  // -----------------------------------------------------------------------

  /**
   * Retry a dead-lettered task (move back to queued).
   */
  retryDeadLetter(queueId: string): QueuedTask | undefined {
    const task = this.tasks.get(queueId);
    if (!task || task.status !== 'dead-letter') {
      return undefined;
    }

    task.status = 'queued';
    task.attempts = 0;
    task.lastError = undefined;
    task.scheduledFor = undefined;
    task.processingStartedAt = undefined;
    task.completedAt = undefined;

    logger.info({ queueId }, 'dead-letter task re-queued');
    this.emit('task:enqueued', task);
    return task;
  }

  /**
   * Remove a task from the dead letter queue permanently.
   */
  removeDeadLetter(queueId: string): boolean {
    const task = this.tasks.get(queueId);
    if (!task || task.status !== 'dead-letter') {
      return false;
    }
    this.tasks.delete(queueId);
    logger.info({ queueId }, 'dead-letter task removed');
    return true;
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    const byPriority: Record<TaskPriority, number> = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    let queuedCount = 0;
    let processingCount = 0;
    let deadLetterCount = 0;

    for (const task of this.tasks.values()) {
      if (task.status === 'queued') {
        queuedCount++;
        byPriority[task.priority]++;
      } else if (task.status === 'processing') {
        processingCount++;
      } else if (task.status === 'dead-letter') {
        deadLetterCount++;
      }
    }

    return {
      totalEnqueued: this.stats.totalEnqueued,
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
      totalDeadLettered: this.stats.totalDeadLettered,
      queuedCount,
      processingCount,
      deadLetterCount,
      byPriority,
    };
  }

  /**
   * Get current queue size (only 'queued' tasks).
   */
  size(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'queued') count++;
    }
    return count;
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  /**
   * Reset all state.
   */
  reset(): void {
    this.tasks.clear();
    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      totalDeadLettered: 0,
    };
    this.removeAllListeners();
    logger.debug('task queue reset');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: A2ATaskQueue | null = null;

/** Get or create the default singleton instance. */
export function getA2ATaskQueue(): A2ATaskQueue {
  if (!_instance) {
    _instance = new A2ATaskQueue();
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetA2ATaskQueue(): void {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}
