"use strict";
/**
 * @module context-bridge.service
 *
 * Context Bridge service for sharing context between agents during handoffs.
 *
 * When Agent A hands off to Agent B, the context (workspace files, conversation
 * history, intermediate results, environment state, metadata) needs to be
 * transferred. This service manages context snapshots associated with tasks
 * or threads, with configurable TTL and size limits.
 *
 * Storage backends:
 * - **InMemoryContextStore**: Default in-process Map store for single-process
 *   deployments and tests. TTL is enforced via periodic sweep.
 * - **RedisContextStore**: Optional Redis-backed store (activated when REDIS_URL
 *   env var is present). Uses Redis EXPIRE for TTL.
 *
 * The service automatically selects the appropriate backend based on
 * environment configuration.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextBridgeService = exports.RedisContextStore = exports.InMemoryContextStore = exports.CONTEXT_TYPES = void 0;
exports.generateContextId = generateContextId;
exports.getContextBridgeService = getContextBridgeService;
exports.resetContextBridgeService = resetContextBridgeService;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../logger");
const data_hygiene_1 = require("./data-hygiene");
const logger = (0, logger_1.createLogger)('a2a-context-bridge');
// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------
/**
 * The kinds of context that can be stored for a task handoff.
 */
exports.CONTEXT_TYPES = [
    'workspace_files',
    'conversation_history',
    'intermediate_results',
    'environment',
    'metadata',
];
const RETENTION_WINDOWS = (0, data_hygiene_1.getA2ARetentionWindowConfig)();
const DEFAULT_CONFIG = {
    ttl_ms: RETENTION_WINDOWS.contextTtlMs,
    max_size_bytes: Number(process.env.RECODER_A2A_CONTEXT_MAX_SIZE_BYTES || 10 * 1024 * 1024),
    sweep_interval_ms: Number(process.env.RECODER_A2A_CONTEXT_SWEEP_MS || 60 * 1000),
    redis_url: process.env.REDIS_URL || undefined,
    redis_key_prefix: process.env.RECODER_A2A_CONTEXT_KEY_PREFIX || 'recoder:a2a:context',
};
// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
let _idCounter = 0;
/** Generate a unique ID with the given prefix. */
function generateContextId(prefix) {
    const ts = Date.now().toString(36);
    const counter = (_idCounter++).toString(36).padStart(4, '0');
    const rand = crypto.randomUUID().slice(0, 4);
    return `${prefix}_${ts}${counter}${rand}`;
}
/**
 * In-memory context store with TTL enforcement via periodic sweep.
 */
class InMemoryContextStore {
    /** Map from taskId -> Map<entryId, InMemoryEntry> */
    store = new Map();
    sweepTimer = null;
    ttl_ms;
    constructor(ttl_ms, sweep_interval_ms) {
        this.ttl_ms = ttl_ms;
        if (sweep_interval_ms > 0) {
            this.sweepTimer = setInterval(() => this.sweep(), sweep_interval_ms);
            // Allow the process to exit even if the timer is active
            if (this.sweepTimer.unref) {
                this.sweepTimer.unref();
            }
        }
    }
    async getAll(taskId) {
        const taskMap = this.store.get(taskId);
        if (!taskMap)
            return [];
        const now = Date.now();
        const results = [];
        for (const [id, item] of taskMap) {
            if (item.expires_at <= now) {
                taskMap.delete(id);
                continue;
            }
            results.push(item.entry);
        }
        if (taskMap.size === 0)
            this.store.delete(taskId);
        return results;
    }
    async getByType(taskId, type) {
        const all = await this.getAll(taskId);
        return all.filter((e) => e.type === type);
    }
    async set(taskId, entry) {
        let taskMap = this.store.get(taskId);
        if (!taskMap) {
            taskMap = new Map();
            this.store.set(taskId, taskMap);
        }
        taskMap.set(entry.id, {
            entry,
            expires_at: Date.now() + this.ttl_ms,
        });
    }
    async deleteAll(taskId) {
        return this.store.delete(taskId);
    }
    async getTotalSize(taskId) {
        const entries = await this.getAll(taskId);
        return entries.reduce((sum, e) => sum + e.size_bytes, 0);
    }
    /** Remove expired entries. */
    sweep() {
        const now = Date.now();
        let swept = 0;
        for (const [taskId, taskMap] of this.store) {
            for (const [id, item] of taskMap) {
                if (item.expires_at <= now) {
                    taskMap.delete(id);
                    swept++;
                }
            }
            if (taskMap.size === 0)
                this.store.delete(taskId);
        }
        if (swept > 0) {
            logger.debug({ swept }, 'context store sweep completed');
        }
    }
    dispose() {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    }
    /** Visible for testing. */
    clear() {
        this.store.clear();
    }
    /** Visible for testing. */
    get taskCount() {
        return this.store.size;
    }
}
exports.InMemoryContextStore = InMemoryContextStore;
// ---------------------------------------------------------------------------
// RedisContextStore
// ---------------------------------------------------------------------------
/**
 * Redis-backed context store. Uses hash sets keyed by task ID.
 * Each context entry is a field in the hash, keyed by entry ID.
 * TTL is managed per-task via Redis EXPIRE.
 */
class RedisContextStore {
    redis;
    prefix;
    ttl_s;
    constructor(redisUrl, prefix, ttl_ms) {
        this.prefix = prefix;
        this.ttl_s = Math.ceil(ttl_ms / 1000);
        this.redis = new ioredis_1.default(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 3)
                    return null;
                return Math.min(times * 100, 3000);
            },
            lazyConnect: true,
        });
        this.redis.connect().catch((err) => {
            logger.warn({ err: err?.message }, 'Redis context store connection failed, will retry');
        });
    }
    taskKey(taskId) {
        return `${this.prefix}:${taskId}`;
    }
    async getAll(taskId) {
        const key = this.taskKey(taskId);
        const data = await this.redis.hgetall(key);
        if (!data || Object.keys(data).length === 0)
            return [];
        const entries = [];
        for (const val of Object.values(data)) {
            try {
                entries.push(JSON.parse(val));
            }
            catch {
                // Skip corrupted entries
            }
        }
        return entries;
    }
    async getByType(taskId, type) {
        const all = await this.getAll(taskId);
        return all.filter((e) => e.type === type);
    }
    async set(taskId, entry) {
        const key = this.taskKey(taskId);
        await this.redis.hset(key, entry.id, JSON.stringify(entry));
        // Refresh TTL on every write
        await this.redis.expire(key, this.ttl_s);
    }
    async deleteAll(taskId) {
        const key = this.taskKey(taskId);
        const deleted = await this.redis.del(key);
        return deleted > 0;
    }
    async getTotalSize(taskId) {
        const entries = await this.getAll(taskId);
        return entries.reduce((sum, e) => sum + e.size_bytes, 0);
    }
    dispose() {
        this.redis.disconnect();
    }
}
exports.RedisContextStore = RedisContextStore;
// ---------------------------------------------------------------------------
// ContextBridgeService
// ---------------------------------------------------------------------------
class ContextBridgeService {
    store;
    config;
    constructor(config, store) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        if (store) {
            this.store = store;
        }
        else if (this.config.redis_url) {
            logger.info('Context bridge using Redis backend');
            this.store = new RedisContextStore(this.config.redis_url, this.config.redis_key_prefix, this.config.ttl_ms);
        }
        else {
            logger.info('Context bridge using in-memory backend');
            this.store = new InMemoryContextStore(this.config.ttl_ms, this.config.sweep_interval_ms);
        }
    }
    // -----------------------------------------------------------------------
    // Create context
    // -----------------------------------------------------------------------
    /**
     * Store a new context entry for the given task.
     */
    async createContext(taskId, type, data) {
        // Validate type
        if (!exports.CONTEXT_TYPES.includes(type)) {
            return {
                ok: false,
                httpStatus: 400,
                error: `Invalid context type '${type}'. Must be one of: ${exports.CONTEXT_TYPES.join(', ')}`,
            };
        }
        const redactedData = (0, data_hygiene_1.redactSensitiveData)(data);
        // Compute size
        const serialized = JSON.stringify(redactedData);
        const size_bytes = Buffer.byteLength(serialized, 'utf-8');
        // Check size limit
        const currentSize = await this.store.getTotalSize(taskId);
        if (currentSize + size_bytes > this.config.max_size_bytes) {
            return {
                ok: false,
                httpStatus: 413,
                error: `Context size limit exceeded. Current: ${currentSize} bytes, new entry: ${size_bytes} bytes, limit: ${this.config.max_size_bytes} bytes`,
            };
        }
        const now = new Date().toISOString();
        const entry = {
            id: generateContextId('ctx'),
            task_id: taskId,
            type,
            data: redactedData,
            size_bytes,
            created_at: now,
            updated_at: now,
        };
        await this.store.set(taskId, entry);
        logger.info({ task_id: taskId, type, entry_id: entry.id, size_bytes }, 'context entry created');
        return { ok: true, data: entry };
    }
    // -----------------------------------------------------------------------
    // Get context
    // -----------------------------------------------------------------------
    /**
     * Retrieve all context entries for a task.
     */
    async getContext(taskId) {
        const entries = await this.store.getAll(taskId);
        if (entries.length === 0) {
            return {
                ok: false,
                httpStatus: 404,
                error: `No context found for task: ${taskId}`,
            };
        }
        const totalSize = entries.reduce((sum, e) => sum + e.size_bytes, 0);
        const timestamps = entries.map((e) => e.created_at).sort();
        const snapshot = {
            task_id: taskId,
            entries,
            total_size_bytes: totalSize,
            created_at: timestamps[0],
            updated_at: timestamps[timestamps.length - 1],
        };
        return { ok: true, data: snapshot };
    }
    // -----------------------------------------------------------------------
    // Get context by type
    // -----------------------------------------------------------------------
    /**
     * Retrieve context entries of a specific type for a task.
     */
    async getContextByType(taskId, type) {
        if (!exports.CONTEXT_TYPES.includes(type)) {
            return {
                ok: false,
                httpStatus: 400,
                error: `Invalid context type '${type}'. Must be one of: ${exports.CONTEXT_TYPES.join(', ')}`,
            };
        }
        const entries = await this.store.getByType(taskId, type);
        if (entries.length === 0) {
            return {
                ok: false,
                httpStatus: 404,
                error: `No context of type '${type}' found for task: ${taskId}`,
            };
        }
        return { ok: true, data: entries };
    }
    // -----------------------------------------------------------------------
    // Append context
    // -----------------------------------------------------------------------
    /**
     * Append additional data to existing context for a task.
     * This creates a new entry (does not overwrite existing entries of the
     * same type). Use this to incrementally build up context, e.g. appending
     * conversation messages as they arrive.
     */
    async appendContext(taskId, type, data) {
        // Delegate to createContext -- append is additive
        return this.createContext(taskId, type, data);
    }
    // -----------------------------------------------------------------------
    // Transfer context
    // -----------------------------------------------------------------------
    /**
     * Copy all context from one task to another (for handoffs).
     * The source context remains intact. New entries are created in the
     * destination task with fresh IDs and timestamps.
     */
    async transferContext(fromTaskId, toTaskId) {
        if (fromTaskId === toTaskId) {
            return {
                ok: false,
                httpStatus: 400,
                error: 'Source and destination task IDs must be different',
            };
        }
        const sourceEntries = await this.store.getAll(fromTaskId);
        if (sourceEntries.length === 0) {
            return {
                ok: false,
                httpStatus: 404,
                error: `No context found for source task: ${fromTaskId}`,
            };
        }
        // Check if the destination would exceed size limits
        const sourceSize = sourceEntries.reduce((sum, e) => sum + e.size_bytes, 0);
        const destCurrentSize = await this.store.getTotalSize(toTaskId);
        if (destCurrentSize + sourceSize > this.config.max_size_bytes) {
            return {
                ok: false,
                httpStatus: 413,
                error: `Transfer would exceed context size limit for destination task. Source size: ${sourceSize} bytes, destination current: ${destCurrentSize} bytes, limit: ${this.config.max_size_bytes} bytes`,
            };
        }
        const now = new Date().toISOString();
        let totalTransferred = 0;
        for (const sourceEntry of sourceEntries) {
            const newEntry = {
                id: generateContextId('ctx'),
                task_id: toTaskId,
                type: sourceEntry.type,
                data: sourceEntry.data,
                size_bytes: sourceEntry.size_bytes,
                created_at: now,
                updated_at: now,
            };
            await this.store.set(toTaskId, newEntry);
            totalTransferred += sourceEntry.size_bytes;
        }
        const result = {
            from_task_id: fromTaskId,
            to_task_id: toTaskId,
            entries_transferred: sourceEntries.length,
            total_size_bytes: totalTransferred,
            transferred_at: now,
        };
        logger.info({
            from_task_id: fromTaskId,
            to_task_id: toTaskId,
            entries: sourceEntries.length,
            size_bytes: totalTransferred,
        }, 'context transferred');
        return { ok: true, data: result };
    }
    // -----------------------------------------------------------------------
    // Delete context
    // -----------------------------------------------------------------------
    /**
     * Delete all context entries for a task.
     */
    async deleteContext(taskId) {
        const deleted = await this.store.deleteAll(taskId);
        if (!deleted) {
            return {
                ok: false,
                httpStatus: 404,
                error: `No context found for task: ${taskId}`,
            };
        }
        logger.info({ task_id: taskId }, 'context deleted');
        return { ok: true, data: { task_id: taskId, deleted: true } };
    }
    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    /** Get the underlying store for testing / advanced use. */
    getStore() {
        return this.store;
    }
    /** Get current configuration (read-only). */
    getConfig() {
        return this.config;
    }
    /** Clean up resources (timers, connections). */
    dispose() {
        this.store.dispose();
    }
}
exports.ContextBridgeService = ContextBridgeService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _defaultService = null;
/** Get or create the default singleton instance. */
function getContextBridgeService() {
    if (!_defaultService) {
        _defaultService = new ContextBridgeService();
    }
    return _defaultService;
}
/** Reset the singleton (for testing). */
function resetContextBridgeService() {
    if (_defaultService) {
        _defaultService.dispose();
    }
    _defaultService = null;
}
