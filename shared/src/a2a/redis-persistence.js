"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisBackedPersistenceAdapter = void 0;
exports.createProductionA2AControlPlaneFromRedis = createProductionA2AControlPlaneFromRedis;
const control_plane_1 = require("./control-plane");
const persistent_services_1 = require("./persistent-services");
class RedisBackedPersistenceAdapter {
    redis;
    keyPrefix;
    cache = new Map();
    onWriteThroughError;
    constructor(redis, keyPrefix = 'a2a:persist:', onWriteThroughError) {
        this.redis = redis;
        this.keyPrefix = keyPrefix;
        this.onWriteThroughError =
            onWriteThroughError ??
                (({ key, error }) => {
                    // Degrade safely: durability of the write-through is best-effort and the
                    // in-memory cache remains the source for synchronous reads. Never let a
                    // rejected Redis promise become an unhandled rejection that can crash the host.
                    console.warn(`[a2a] redis write-through failed for key "${key}"; local cache retained`, error);
                });
    }
    static async fromClient(input) {
        const adapter = new RedisBackedPersistenceAdapter(input.redis, input.keyPrefix ?? 'a2a:persist:', input.onWriteThroughError);
        const preload = input.preloadKeys ?? persistent_services_1.DEFAULT_A2A_PERSISTENCE_KEYS;
        for (const key of preload) {
            const raw = await input.redis.get(adapter.prefixed(key));
            if (raw !== null) {
                adapter.cache.set(key, RedisBackedPersistenceAdapter.normalizeReadValue(raw));
            }
        }
        return adapter;
    }
    static async fromUrl(input) {
        const redisModule = await Promise.resolve().then(() => __importStar(require('redis')));
        const client = redisModule.createClient({ url: input.url });
        await client.connect();
        return RedisBackedPersistenceAdapter.fromClient({
            redis: client,
            keyPrefix: input.keyPrefix,
            preloadKeys: input.preloadKeys,
            onWriteThroughError: input.onWriteThroughError,
        });
    }
    read(key) {
        return this.cache.get(key) ?? null;
    }
    write(key, value) {
        this.cache.set(key, value);
        // Best-effort write-through; local cache remains source for sync reads.
        // A rejected promise (or a synchronous throw from the client) here must be
        // caught so a transient Redis failure degrades safely instead of surfacing
        // as an unhandled rejection that can crash the host process.
        try {
            Promise.resolve(this.redis.set(this.prefixed(key), value)).catch((error) => {
                this.onWriteThroughError({ key, error });
            });
        }
        catch (error) {
            this.onWriteThroughError({ key, error });
        }
    }
    async flush(keys = persistent_services_1.DEFAULT_A2A_PERSISTENCE_KEYS) {
        for (const key of keys) {
            const value = this.cache.get(key);
            if (value !== undefined) {
                await this.redis.set(this.prefixed(key), value);
            }
        }
    }
    prefixed(key) {
        return `${this.keyPrefix}${key}`;
    }
    static normalizeReadValue(value) {
        return typeof value === 'string' ? value : value.toString('utf8');
    }
}
exports.RedisBackedPersistenceAdapter = RedisBackedPersistenceAdapter;
async function createProductionA2AControlPlaneFromRedis(input) {
    const registry = input.registry ?? new control_plane_1.InMemoryAgentRegistry();
    const policy = input.policy ?? new control_plane_1.UnifiedPolicyPlane();
    const adapter = await RedisBackedPersistenceAdapter.fromUrl({
        url: input.redisUrl,
        keyPrefix: input.keyPrefix,
        preloadKeys: input.preloadKeys,
    });
    const taskStore = new persistent_services_1.PersistentTaskStore(adapter);
    const auditLog = new persistent_services_1.PersistentAuditLogService(adapter);
    const collaboration = new persistent_services_1.PersistentCollaborationService(adapter);
    const controlPlane = new control_plane_1.A2AControlPlane(registry, taskStore, policy, auditLog, collaboration);
    return { controlPlane, adapter };
}
