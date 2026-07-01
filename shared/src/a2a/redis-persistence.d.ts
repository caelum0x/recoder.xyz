import { A2AControlPlane, InMemoryAgentRegistry, UnifiedPolicyPlane } from './control-plane';
import { type A2APersistenceAdapter } from './persistent-services';
export interface RedisKvClient {
    get(key: string): Promise<string | null | {
        toString: (encoding?: string) => string;
    }>;
    set(key: string, value: string): Promise<unknown>;
    connect?(): Promise<unknown>;
    quit?(): Promise<unknown>;
}
/**
 * Called when a best-effort write-through to Redis fails. The local cache
 * remains authoritative, so the failure is non-fatal; this hook exists so
 * callers can surface truthful health (metrics/logging) instead of silently
 * dropping the durability failure.
 */
export type RedisWriteThroughErrorHandler = (input: {
    key: string;
    error: unknown;
}) => void;
export declare class RedisBackedPersistenceAdapter implements A2APersistenceAdapter {
    private readonly redis;
    private readonly keyPrefix;
    private readonly cache;
    private readonly onWriteThroughError;
    constructor(redis: RedisKvClient, keyPrefix?: string, onWriteThroughError?: RedisWriteThroughErrorHandler);
    static fromClient(input: {
        redis: RedisKvClient;
        keyPrefix?: string;
        preloadKeys?: readonly string[];
        onWriteThroughError?: RedisWriteThroughErrorHandler;
    }): Promise<RedisBackedPersistenceAdapter>;
    static fromUrl(input: {
        url: string;
        keyPrefix?: string;
        preloadKeys?: readonly string[];
        onWriteThroughError?: RedisWriteThroughErrorHandler;
    }): Promise<RedisBackedPersistenceAdapter>;
    read(key: string): string | null;
    write(key: string, value: string): void;
    flush(keys?: readonly string[]): Promise<void>;
    private prefixed;
    private static normalizeReadValue;
}
export declare function createProductionA2AControlPlaneFromRedis(input: {
    redisUrl: string;
    keyPrefix?: string;
    preloadKeys?: readonly string[];
    registry?: InMemoryAgentRegistry;
    policy?: UnifiedPolicyPlane;
}): Promise<{
    controlPlane: A2AControlPlane;
    adapter: RedisBackedPersistenceAdapter;
}>;
