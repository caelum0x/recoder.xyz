"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptTaskQueue = exports.PromptTaskQueueStore = void 0;
exports.getPromptTaskQueueDiagnostics = getPromptTaskQueueDiagnostics;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Dynamic import to avoid crash when native module is unavailable (e.g., in Docker without native build)
let Database;
try {
    Database = require('better-sqlite3');
}
catch {
    // better-sqlite3 not available — Redis backend must be used
}
const ioredis_1 = __importDefault(require("ioredis"));
const prompt_task_queue_config_js_1 = require("./prompt-task-queue-config.js");
class PromptTaskQueueStore {
    db;
    constructor(dbPath) {
        if (!Database) {
            throw new Error('better-sqlite3 native module not available. Use PUBLIC_PROMPT_TASK_QUEUE_BACKEND=redis instead.');
        }
        fs_1.default.mkdirSync(path_1.default.dirname(dbPath), { recursive: true });
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
    async enqueue(taskId, options) {
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
    async claimDue(now, limit, leaseMs) {
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
        const claimed = [];
        const tx = this.db.transaction(() => {
            const rows = selectStmt.all(now, now, limit);
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
    async ack(taskId) {
        this.db.prepare(`DELETE FROM prompt_task_queue WHERE task_id = ?`).run(taskId);
    }
    async reschedule(taskId, options) {
        const now = Date.now();
        this.db.prepare(`
      UPDATE prompt_task_queue
      SET run_at = ?, attempt = ?, locked_until = 0, last_error = ?, updated_at = ?
      WHERE task_id = ?
    `).run(options.runAt, options.attempt, options.lastError ?? null, now, taskId);
    }
    async cancel(taskId) {
        await this.ack(taskId);
    }
    async clearAll() {
        this.db.prepare(`DELETE FROM prompt_task_queue`).run();
    }
    async deadLetter(taskId, options) {
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
    async listDeadLetters(limit = 50) {
        const rows = this.db.prepare(`
      SELECT task_id, attempts, last_error, failed_at
      FROM prompt_task_dlq
      ORDER BY failed_at DESC
      LIMIT ?
    `).all(limit);
        return rows.map((row) => ({
            taskId: row.task_id,
            attempts: row.attempts,
            lastError: row.last_error,
            failedAt: row.failed_at,
        }));
    }
    async releaseZombieLocks(now, maxLockAgeMs) {
        const threshold = now - maxLockAgeMs;
        const result = this.db.prepare(`
      UPDATE prompt_task_queue
      SET locked_until = 0, updated_at = ?
      WHERE locked_until > 0 AND locked_until < ?
    `).run(now, threshold);
        return result.changes;
    }
}
exports.PromptTaskQueueStore = PromptTaskQueueStore;
class RedisPromptTaskQueueStore {
    redis;
    dueKey;
    lockKey;
    metaPrefix;
    constructor(redisUrl, keyPrefix) {
        this.redis = new ioredis_1.default(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 2,
            enableReadyCheck: true,
        });
        this.dueKey = `${keyPrefix}:due`;
        this.lockKey = `${keyPrefix}:lock`;
        this.metaPrefix = `${keyPrefix}:meta:`;
    }
    metaKey(taskId) {
        return `${this.metaPrefix}${taskId}`;
    }
    async enqueue(taskId, options) {
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
    async claimDue(now, limit, leaseMs) {
        const candidateIds = await this.redis.zrangebyscore(this.dueKey, '-inf', String(now), 'LIMIT', 0, Math.max(limit * 4, 20));
        const claimedIds = [];
        const tx = this.redis.multi();
        for (const taskId of candidateIds) {
            if (claimedIds.length >= limit)
                break;
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
            const result = metaResults?.[index]?.[1];
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
    async ack(taskId) {
        const multi = this.redis.multi();
        multi.zrem(this.dueKey, taskId);
        multi.zrem(this.lockKey, taskId);
        multi.del(this.metaKey(taskId));
        await multi.exec();
    }
    async reschedule(taskId, options) {
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
    async cancel(taskId) {
        await this.ack(taskId);
    }
    async clearAll() {
        const stream = this.redis.scanStream({
            match: `${this.metaPrefix}*`,
            count: 500,
        });
        const deletions = [];
        stream.on('data', (keys) => {
            if (keys.length > 0) {
                deletions.push(this.redis.del(...keys));
            }
        });
        await new Promise((resolve, reject) => {
            stream.on('end', () => resolve());
            stream.on('error', (error) => reject(error));
        });
        await Promise.all(deletions);
        await this.redis.del(this.dueKey, this.lockKey);
    }
    get dlqKey() {
        return `${this.dueKey}:dlq`;
    }
    dlqMetaKey(taskId) {
        return `${this.metaPrefix}dlq:${taskId}`;
    }
    async deadLetter(taskId, options) {
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
    async listDeadLetters(limit = 50) {
        const taskIds = await this.redis.zrevrangebyscore(this.dlqKey, '+inf', '-inf', 'LIMIT', 0, limit);
        if (taskIds.length === 0)
            return [];
        const pipeline = this.redis.pipeline();
        for (const taskId of taskIds) {
            pipeline.hgetall(this.dlqMetaKey(taskId));
        }
        const results = await pipeline.exec();
        return taskIds.map((taskId, i) => {
            const meta = results?.[i]?.[1];
            return {
                taskId,
                attempts: Number.parseInt(meta?.attempts || '0', 10),
                lastError: meta?.lastError || null,
                failedAt: Number.parseInt(meta?.failedAt || '0', 10),
            };
        });
    }
    async releaseZombieLocks(now, maxLockAgeMs) {
        const threshold = now - maxLockAgeMs;
        // Find all locks that expired before the threshold
        const zombieIds = await this.redis.zrangebyscore(this.lockKey, '1', String(threshold));
        if (zombieIds.length === 0)
            return 0;
        const multi = this.redis.multi();
        for (const taskId of zombieIds) {
            multi.zrem(this.lockKey, taskId);
        }
        await multi.exec();
        return zombieIds.length;
    }
}
const queueConfig = (0, prompt_task_queue_config_js_1.readPromptTaskQueueConfig)(process.env);
function getPromptTaskQueueDiagnostics() {
    return (0, prompt_task_queue_config_js_1.getPromptTaskQueueDiagnosticsFromConfig)(queueConfig);
}
function createPromptTaskQueue() {
    (0, prompt_task_queue_config_js_1.validatePromptTaskQueueConfig)(queueConfig);
    const selectedBackend = (0, prompt_task_queue_config_js_1.resolvePromptTaskQueueBackend)(queueConfig);
    if (selectedBackend === 'redis') {
        return new RedisPromptTaskQueueStore(queueConfig.redisUrl, queueConfig.redisKeyPrefix);
    }
    return new PromptTaskQueueStore(queueConfig.sqlitePath);
}
exports.promptTaskQueue = createPromptTaskQueue();
