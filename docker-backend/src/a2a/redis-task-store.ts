/**
 * @module redis-task-store
 *
 * Redis-backed implementation of the TaskStore interface from
 * task-lifecycle.service.ts. Uses a hybrid local-cache + Redis
 * write-through pattern:
 *
 * - Local Map cache is the source of truth for reads (performance).
 * - Every mutation is written through to Redis for persistence
 *   across process restarts.
 * - On construction the local cache is hydrated from Redis
 *   (async, non-blocking — the store is usable immediately with
 *   an empty cache; hydration fills it in the background).
 * - All Redis I/O is fire-and-forget with error logging; a Redis
 *   outage never throws into the caller.
 * - Terminal tasks (completed, failed, cancelled) are automatically
 *   evicted after a configurable TTL (default: 24 hours). A background
 *   sweep runs periodically to clean both the local cache and Redis.
 */

import Redis from 'ioredis';
import { type TaskEnvelope, isTerminalState } from '@recoder/shared/a2a';
import type { TaskStore, TaskListFilter } from './task-lifecycle.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-redis-task-store');

/** Default Redis hash key for all task envelopes. */
const DEFAULT_HASH_KEY = 'recoder:a2a:tasks';

/** Default TTL for terminal tasks: 24 hours in milliseconds. */
const DEFAULT_TERMINAL_TASK_TTL_MS = 24 * 60 * 60 * 1000;

/** Default interval for the background eviction sweep: 5 minutes. */
const DEFAULT_EVICTION_INTERVAL_MS = 5 * 60 * 1000;

export interface RedisTaskStoreOptions {
  /** Full redis:// connection URL. */
  redisUrl: string;
  /** Override the default hash key (useful for tests / namespacing). */
  hashKey?: string;
  /** TTL in ms for terminal tasks (completed/failed/cancelled). Default: 24h. */
  terminalTaskTtlMs?: number;
  /** Interval in ms for the background eviction sweep. Default: 5 min. */
  evictionIntervalMs?: number;
}

export class RedisTaskStore implements TaskStore {
  private readonly cache = new Map<string, TaskEnvelope>();
  private readonly redis: Redis;
  private readonly hashKey: string;
  private readonly terminalTaskTtlMs: number;
  private readonly evictionIntervalMs: number;
  private hydrated = false;
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RedisTaskStoreOptions) {
    this.hashKey = options.hashKey ?? DEFAULT_HASH_KEY;
    this.terminalTaskTtlMs = options.terminalTaskTtlMs ?? DEFAULT_TERMINAL_TASK_TTL_MS;
    this.evictionIntervalMs = options.evictionIntervalMs ?? DEFAULT_EVICTION_INTERVAL_MS;

    this.redis = new Redis(options.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) return null; // give up after 5 retries
        return Math.min(times * 200, 3000);
      },
      lazyConnect: true,
    });

    // Connect, hydrate, and start eviction in the background — never block construction.
    this.redis
      .connect()
      .then(() => this.hydrate())
      .then(() => this.startEvictionSweep())
      .catch((err) => {
        logger.warn({ err: err?.message }, 'Redis task store initial connection failed, will retry on next operation');
        // Start eviction sweep anyway to keep the local cache clean.
        this.startEvictionSweep();
      });
  }

  // -------------------------------------------------------------------------
  // TaskStore interface
  // -------------------------------------------------------------------------

  get(taskId: string): TaskEnvelope | undefined {
    return this.cache.get(taskId);
  }

  set(taskId: string, envelope: TaskEnvelope): void {
    this.cache.set(taskId, envelope);
    // Write-through to Redis (fire-and-forget)
    this.redisSet(taskId, envelope);
  }

  delete(taskId: string): boolean {
    const existed = this.cache.delete(taskId);
    if (existed) {
      this.redisDel(taskId);
    }
    return existed;
  }

  has(taskId: string): boolean {
    return this.cache.has(taskId);
  }

  list(filter?: TaskListFilter): TaskEnvelope[] {
    let results = Array.from(this.cache.values());

    if (filter?.workspace_id) {
      results = results.filter((e) => e.workspace_id === filter.workspace_id);
    }
    if (filter?.thread_id) {
      results = results.filter((e) => e.thread_id === filter.thread_id);
    }
    if (filter?.state) {
      results = results.filter((e) => e.state === filter.state);
    }
    if (filter?.assignee_agent_id) {
      results = results.filter((e) => e.assignee.agent_id === filter.assignee_agent_id);
    }

    // Sort by created_at descending (newest first)
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  // -------------------------------------------------------------------------
  // Hydration
  // -------------------------------------------------------------------------

  /** Bulk-load all tasks from the Redis hash into the local cache. */
  private async hydrate(): Promise<void> {
    try {
      const raw = await this.redis.hgetall(this.hashKey);
      if (!raw || Object.keys(raw).length === 0) {
        logger.info('Redis task store hydrated (0 tasks)');
        this.hydrated = true;
        return;
      }

      let loaded = 0;
      let skipped = 0;
      for (const [taskId, json] of Object.entries(raw)) {
        try {
          const envelope = JSON.parse(json) as TaskEnvelope;
          this.cache.set(taskId, envelope);
          loaded++;
        } catch {
          skipped++;
          logger.warn({ taskId }, 'skipped corrupt task envelope during hydration');
        }
      }

      this.hydrated = true;
      logger.info({ loaded, skipped }, 'Redis task store hydrated');
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Redis task store hydration failed — continuing with empty cache',
      );
    }
  }

  // -------------------------------------------------------------------------
  // TTL eviction for terminal tasks
  // -------------------------------------------------------------------------

  /**
   * Start a background interval that evicts expired terminal tasks from
   * both the local cache and Redis. The sweep runs every `evictionIntervalMs`.
   */
  private startEvictionSweep(): void {
    if (this.evictionTimer) return;

    this.evictionTimer = setInterval(() => {
      void this.evictExpiredTasks();
    }, this.evictionIntervalMs);

    // Ensure the timer does not prevent process exit.
    if (this.evictionTimer && typeof this.evictionTimer === 'object' && 'unref' in this.evictionTimer) {
      this.evictionTimer.unref();
    }

    logger.info(
      { intervalMs: this.evictionIntervalMs, ttlMs: this.terminalTaskTtlMs },
      'Redis task store eviction sweep started',
    );
  }

  /**
   * Evict terminal tasks whose `updated_at` (or `created_at` fallback)
   * is older than `terminalTaskTtlMs`.
   *
   * This cleans both the local cache and the Redis hash in a single pass.
   */
  private async evictExpiredTasks(): Promise<void> {
    const cutoffMs = Date.now() - this.terminalTaskTtlMs;
    const expiredIds: string[] = [];

    for (const [taskId, envelope] of this.cache.entries()) {
      if (!isTerminalState(envelope.state)) continue;
      const taskTs = Date.parse(envelope.updated_at || envelope.created_at);
      if (!Number.isFinite(taskTs) || taskTs > cutoffMs) continue;
      expiredIds.push(taskId);
    }

    if (expiredIds.length === 0) return;

    // Remove from local cache
    for (const taskId of expiredIds) {
      this.cache.delete(taskId);
    }

    // Batch remove from Redis hash (fire-and-forget)
    try {
      await this.redis.hdel(this.hashKey, ...expiredIds);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), count: expiredIds.length },
        'Redis HDEL batch failed during eviction sweep',
      );
    }

    logger.info({ evicted: expiredIds.length, remaining: this.cache.size }, 'evicted expired terminal tasks');
  }

  // -------------------------------------------------------------------------
  // Redis write helpers (fire-and-forget, never throw)
  // -------------------------------------------------------------------------

  private redisSet(taskId: string, envelope: TaskEnvelope): void {
    try {
      const json = JSON.stringify(envelope);
      this.redis
        .hset(this.hashKey, taskId, json)
        .catch((err) => {
          logger.warn(
            { err: err?.message, taskId },
            'Redis HSET failed for task envelope',
          );
        });
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), taskId },
        'Failed to serialize task envelope for Redis',
      );
    }
  }

  private redisDel(taskId: string): void {
    this.redis
      .hdel(this.hashKey, taskId)
      .catch((err) => {
        logger.warn(
          { err: err?.message, taskId },
          'Redis HDEL failed for task envelope',
        );
      });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Disconnect from Redis and stop the eviction sweep. Call on process shutdown. */
  dispose(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.redis.disconnect();
  }

  /** Whether the initial hydration from Redis has completed. */
  get isHydrated(): boolean {
    return this.hydrated;
  }

  /** Number of envelopes currently in the local cache. */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Health summary for diagnostics / admin endpoints.
   * Returns key stats about the store and its Redis connection.
   */
  health(): {
    hydrated: boolean;
    cacheSize: number;
    redisStatus: string;
    terminalTaskTtlMs: number;
    evictionIntervalMs: number;
  } {
    return {
      hydrated: this.hydrated,
      cacheSize: this.cache.size,
      redisStatus: this.redis.status,
      terminalTaskTtlMs: this.terminalTaskTtlMs,
      evictionIntervalMs: this.evictionIntervalMs,
    };
  }
}
