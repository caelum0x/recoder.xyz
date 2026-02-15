import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import {
  getPromptTaskQueueDiagnosticsFromConfig,
  readPromptTaskQueueConfig,
  resolvePromptTaskQueueBackend,
  validatePromptTaskQueueConfig,
} from './prompt-task-queue-config.js';

export interface ClaimedPromptTask {
  taskId: string;
  attempt: number;
  runAt: number;
  lastError: string | null;
}

export interface DeadLetterEntry {
  taskId: string;
  attempts: number;
  lastError: string | null;
  failedAt: number;
}

export interface PromptTaskQueue {
  enqueue(taskId: string, options?: { runAt?: number; attempt?: number; lastError?: string | null }): Promise<void>;
  claimDue(now: number, limit: number, leaseMs: number): Promise<ClaimedPromptTask[]>;
  ack(taskId: string): Promise<void>;
  reschedule(taskId: string, options: { runAt: number; attempt: number; lastError?: string | null }): Promise<void>;
  cancel(taskId: string): Promise<void>;
  clearAll(): Promise<void>;
  /** Move a permanently failed task to the dead-letter store. */
  deadLetter(taskId: string, options: { attempts: number; lastError: string | null }): Promise<void>;
  /** List dead-letter entries (most recent first). */
  listDeadLetters(limit?: number): Promise<DeadLetterEntry[]>;
  /** Release zombie locks older than the given threshold. Returns number of released tasks. */
  releaseZombieLocks(now: number, maxLockAgeMs: number): Promise<number>;
}

export class PromptTaskQueueStore implements PromptTaskQueue {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_task_queue (
        task_id TEXT PRIMARY KEY,
        run_at INTEGER NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_task_queue_due
      ON prompt_task_queue (run_at, locked_until);

      CREATE TABLE IF NOT EXISTS prompt_task_dlq (
        task_id TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL,
        last_error TEXT,
        failed_at INTEGER NOT NULL
      );
    `);
  }

  async enqueue(taskId: string, options?: { runAt?: number; attempt?: number; lastError?: string | null }): Promise<void> {
    const now = Date.now();
    const runAt = options?.runAt ?? now;
    const attempt = options?.attempt ?? 0;
    const lastError = options?.lastError ?? null;
    this.db.prepare(`
      INSERT INTO prompt_task_queue (task_id, run_at, attempt, locked_until, last_error, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        run_at = excluded.run_at,
        attempt = excluded.attempt,
        locked_until = 0,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `).run(taskId, runAt, attempt, lastError, now, now);
  }

  async claimDue(now: number, limit: number, leaseMs: number): Promise<ClaimedPromptTask[]> {
    const selectStmt = this.db.prepare(`
      SELECT task_id, run_at, attempt, last_error
      FROM prompt_task_queue
      WHERE run_at <= ? AND locked_until <= ?
      ORDER BY run_at ASC, created_at ASC
      LIMIT ?
    `);
    const lockStmt = this.db.prepare(`
      UPDATE prompt_task_queue
      SET locked_until = ?, updated_at = ?
      WHERE task_id = ? AND locked_until <= ?
    `);
    const claimed: ClaimedPromptTask[] = [];
    const tx = this.db.transaction(() => {
      const rows = selectStmt.all(now, now, limit) as Array<{
        task_id: string;
        run_at: number;
        attempt: number;
        last_error: string | null;
      }>;
      for (const row of rows) {
        const result = lockStmt.run(now + leaseMs, now, row.task_id, now);
        if (result.changes === 1) {
          claimed.push({
            taskId: row.task_id,
            runAt: row.run_at,
            attempt: row.attempt,
            lastError: row.last_error,
          });
        }
      }
    });
    tx();
    return claimed;
  }

  async ack(taskId: string): Promise<void> {
    this.db.prepare(`DELETE FROM prompt_task_queue WHERE task_id = ?`).run(taskId);
  }

  async reschedule(taskId: string, options: { runAt: number; attempt: number; lastError?: string | null }): Promise<void> {
    const now = Date.now();
    this.db.prepare(`
      UPDATE prompt_task_queue
      SET run_at = ?, attempt = ?, locked_until = 0, last_error = ?, updated_at = ?
      WHERE task_id = ?
    `).run(options.runAt, options.attempt, options.lastError ?? null, now, taskId);
  }

  async cancel(taskId: string): Promise<void> {
    await this.ack(taskId);
  }

  async clearAll(): Promise<void> {
    this.db.prepare(`DELETE FROM prompt_task_queue`).run();
  }

  async deadLetter(taskId: string, options: { attempts: number; lastError: string | null }): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM prompt_task_queue WHERE task_id = ?`).run(taskId);
      this.db.prepare(`
        INSERT INTO prompt_task_dlq (task_id, attempts, last_error, failed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          attempts = excluded.attempts,
          last_error = excluded.last_error,
          failed_at = excluded.failed_at
      `).run(taskId, options.attempts, options.lastError, Date.now());
    });
    tx();
  }

  async listDeadLetters(limit: number = 50): Promise<DeadLetterEntry[]> {
    const rows = this.db.prepare(`
      SELECT task_id, attempts, last_error, failed_at
      FROM prompt_task_dlq
      ORDER BY failed_at DESC
      LIMIT ?
    `).all(limit) as Array<{ task_id: string; attempts: number; last_error: string | null; failed_at: number }>;
    return rows.map((row) => ({
      taskId: row.task_id,
      attempts: row.attempts,
      lastError: row.last_error,
      failedAt: row.failed_at,
    }));
  }

  async releaseZombieLocks(now: number, maxLockAgeMs: number): Promise<number> {
    const threshold = now - maxLockAgeMs;
    const result = this.db.prepare(`
      UPDATE prompt_task_queue
      SET locked_until = 0, updated_at = ?
      WHERE locked_until > 0 AND locked_until < ?
    `).run(now, threshold);
    return result.changes;
  }
}

class RedisPromptTaskQueueStore implements PromptTaskQueue {
  private readonly redis: Redis;
  private readonly dueKey: string;
  private readonly lockKey: string;
  private readonly metaPrefix: string;

  constructor(redisUrl: string, keyPrefix: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
    this.dueKey = `${keyPrefix}:due`;
    this.lockKey = `${keyPrefix}:lock`;
    this.metaPrefix = `${keyPrefix}:meta:`;
  }

  private metaKey(taskId: string): string {
    return `${this.metaPrefix}${taskId}`;
  }

  async enqueue(taskId: string, options?: { runAt?: number; attempt?: number; lastError?: string | null }): Promise<void> {
    const now = Date.now();
    const runAt = options?.runAt ?? now;
    const attempt = options?.attempt ?? 0;
    const lastError = options?.lastError ?? '';
    const multi = this.redis.multi();
    multi.zadd(this.dueKey, String(runAt), taskId);
    multi.zrem(this.lockKey, taskId);
    multi.hset(this.metaKey(taskId), {
      attempt: String(attempt),
      runAt: String(runAt),
      lastError,
      updatedAt: String(now),
    });
    await multi.exec();
  }

  async claimDue(now: number, limit: number, leaseMs: number): Promise<ClaimedPromptTask[]> {
    const candidateIds = await this.redis.zrangebyscore(this.dueKey, '-inf', String(now), 'LIMIT', 0, Math.max(limit * 4, 20));
    const claimedIds: string[] = [];
    const tx = this.redis.multi();
    for (const taskId of candidateIds) {
      if (claimedIds.length >= limit) break;
      const lockScore = await this.redis.zscore(this.lockKey, taskId);
      if (lockScore && Number.parseInt(lockScore, 10) > now) {
        continue;
      }
      tx.zadd(this.lockKey, String(now + leaseMs), taskId);
      claimedIds.push(taskId);
    }
    if (claimedIds.length === 0) {
      return [];
    }
    await tx.exec();

    const metaPipeline = this.redis.pipeline();
    for (const taskId of claimedIds) {
      metaPipeline.hgetall(this.metaKey(taskId));
    }
    const metaResults = await metaPipeline.exec();

    return claimedIds.map((taskId, index) => {
      const result = metaResults?.[index]?.[1] as Record<string, string> | undefined;
      const attempt = Number.parseInt(result?.attempt || '0', 10);
      const runAt = Number.parseInt(result?.runAt || String(now), 10);
      const lastError = result?.lastError ? result.lastError : null;
      return {
        taskId,
        attempt: Number.isFinite(attempt) ? attempt : 0,
        runAt: Number.isFinite(runAt) ? runAt : now,
        lastError,
      };
    });
  }

  async ack(taskId: string): Promise<void> {
    const multi = this.redis.multi();
    multi.zrem(this.dueKey, taskId);
    multi.zrem(this.lockKey, taskId);
    multi.del(this.metaKey(taskId));
    await multi.exec();
  }

  async reschedule(taskId: string, options: { runAt: number; attempt: number; lastError?: string | null }): Promise<void> {
    const now = Date.now();
    const multi = this.redis.multi();
    multi.zadd(this.dueKey, String(options.runAt), taskId);
    multi.zrem(this.lockKey, taskId);
    multi.hset(this.metaKey(taskId), {
      attempt: String(options.attempt),
      runAt: String(options.runAt),
      lastError: options.lastError ?? '',
      updatedAt: String(now),
    });
    await multi.exec();
  }

  async cancel(taskId: string): Promise<void> {
    await this.ack(taskId);
  }

  async clearAll(): Promise<void> {
    const stream = this.redis.scanStream({
      match: `${this.metaPrefix}*`,
      count: 500,
    });
    const deletions: Promise<unknown>[] = [];
    stream.on('data', (keys: string[]) => {
      if (keys.length > 0) {
        deletions.push(this.redis.del(...keys));
      }
    });
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', (error) => reject(error));
    });
    await Promise.all(deletions);
    await this.redis.del(this.dueKey, this.lockKey);
  }

  private get dlqKey(): string {
    return `${this.dueKey}:dlq`;
  }

  private dlqMetaKey(taskId: string): string {
    return `${this.metaPrefix}dlq:${taskId}`;
  }

  async deadLetter(taskId: string, options: { attempts: number; lastError: string | null }): Promise<void> {
    const now = Date.now();
    const multi = this.redis.multi();
    // Remove from active queue
    multi.zrem(this.dueKey, taskId);
    multi.zrem(this.lockKey, taskId);
    multi.del(this.metaKey(taskId));
    // Add to DLQ
    multi.zadd(this.dlqKey, String(now), taskId);
    multi.hset(this.dlqMetaKey(taskId), {
      attempts: String(options.attempts),
      lastError: options.lastError ?? '',
      failedAt: String(now),
    });
    await multi.exec();
  }

  async listDeadLetters(limit: number = 50): Promise<DeadLetterEntry[]> {
    const taskIds = await this.redis.zrevrangebyscore(this.dlqKey, '+inf', '-inf', 'LIMIT', 0, limit);
    if (taskIds.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const taskId of taskIds) {
      pipeline.hgetall(this.dlqMetaKey(taskId));
    }
    const results = await pipeline.exec();
    return taskIds.map((taskId, i) => {
      const meta = results?.[i]?.[1] as Record<string, string> | undefined;
      return {
        taskId,
        attempts: Number.parseInt(meta?.attempts || '0', 10),
        lastError: meta?.lastError || null,
        failedAt: Number.parseInt(meta?.failedAt || '0', 10),
      };
    });
  }

  async releaseZombieLocks(now: number, maxLockAgeMs: number): Promise<number> {
    const threshold = now - maxLockAgeMs;
    // Find all locks that expired before the threshold
    const zombieIds = await this.redis.zrangebyscore(this.lockKey, '1', String(threshold));
    if (zombieIds.length === 0) return 0;
    const multi = this.redis.multi();
    for (const taskId of zombieIds) {
      multi.zrem(this.lockKey, taskId);
    }
    await multi.exec();
    return zombieIds.length;
  }
}

const queueConfig = readPromptTaskQueueConfig(process.env);

export function getPromptTaskQueueDiagnostics() {
  return getPromptTaskQueueDiagnosticsFromConfig(queueConfig);
}

function createPromptTaskQueue(): PromptTaskQueue {
  validatePromptTaskQueueConfig(queueConfig);
  const selectedBackend = resolvePromptTaskQueueBackend(queueConfig);
  if (selectedBackend === 'redis') {
    return new RedisPromptTaskQueueStore(queueConfig.redisUrl, queueConfig.redisKeyPrefix);
  }
  return new PromptTaskQueueStore(queueConfig.sqlitePath);
}

export const promptTaskQueue = createPromptTaskQueue();
