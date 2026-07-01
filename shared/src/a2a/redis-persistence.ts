import {
  A2AControlPlane,
  InMemoryAgentRegistry,
  UnifiedPolicyPlane,
} from './control-plane';
import {
  DEFAULT_A2A_PERSISTENCE_KEYS,
  type A2APersistenceAdapter,
  PersistentAuditLogService,
  PersistentCollaborationService,
  PersistentTaskStore,
} from './persistent-services';

export interface RedisKvClient {
  get(key: string): Promise<string | null | { toString: (encoding?: string) => string }>;
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
export type RedisWriteThroughErrorHandler = (
  input: { key: string; error: unknown }
) => void;

export class RedisBackedPersistenceAdapter implements A2APersistenceAdapter {
  private readonly cache = new Map<string, string>();
  private readonly onWriteThroughError: RedisWriteThroughErrorHandler;

  constructor(
    private readonly redis: RedisKvClient,
    private readonly keyPrefix = 'a2a:persist:',
    onWriteThroughError?: RedisWriteThroughErrorHandler
  ) {
    this.onWriteThroughError =
      onWriteThroughError ??
      (({ key, error }) => {
        // Degrade safely: durability of the write-through is best-effort and the
        // in-memory cache remains the source for synchronous reads. Never let a
        // rejected Redis promise become an unhandled rejection that can crash the host.
        console.warn(
          `[a2a] redis write-through failed for key "${key}"; local cache retained`,
          error
        );
      });
  }

  static async fromClient(input: {
    redis: RedisKvClient;
    keyPrefix?: string;
    preloadKeys?: readonly string[];
    onWriteThroughError?: RedisWriteThroughErrorHandler;
  }): Promise<RedisBackedPersistenceAdapter> {
    const adapter = new RedisBackedPersistenceAdapter(
      input.redis,
      input.keyPrefix ?? 'a2a:persist:',
      input.onWriteThroughError
    );
    const preload = input.preloadKeys ?? DEFAULT_A2A_PERSISTENCE_KEYS;
    for (const key of preload) {
      const raw = await input.redis.get(adapter.prefixed(key));
      if (raw !== null) {
        adapter.cache.set(key, RedisBackedPersistenceAdapter.normalizeReadValue(raw));
      }
    }
    return adapter;
  }

  static async fromUrl(input: {
    url: string;
    keyPrefix?: string;
    preloadKeys?: readonly string[];
    onWriteThroughError?: RedisWriteThroughErrorHandler;
  }): Promise<RedisBackedPersistenceAdapter> {
    const redisModule = await import('redis');
    const client = redisModule.createClient({ url: input.url });
    await client.connect();
    return RedisBackedPersistenceAdapter.fromClient({
      redis: client,
      keyPrefix: input.keyPrefix,
      preloadKeys: input.preloadKeys,
      onWriteThroughError: input.onWriteThroughError,
    });
  }

  read(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  write(key: string, value: string): void {
    this.cache.set(key, value);
    // Best-effort write-through; local cache remains source for sync reads.
    // A rejected promise (or a synchronous throw from the client) here must be
    // caught so a transient Redis failure degrades safely instead of surfacing
    // as an unhandled rejection that can crash the host process.
    try {
      Promise.resolve(this.redis.set(this.prefixed(key), value)).catch((error) => {
        this.onWriteThroughError({ key, error });
      });
    } catch (error) {
      this.onWriteThroughError({ key, error });
    }
  }

  async flush(keys: readonly string[] = DEFAULT_A2A_PERSISTENCE_KEYS): Promise<void> {
    for (const key of keys) {
      const value = this.cache.get(key);
      if (value !== undefined) {
        await this.redis.set(this.prefixed(key), value);
      }
    }
  }

  private prefixed(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private static normalizeReadValue(value: string | { toString: (encoding?: string) => string }): string {
    return typeof value === 'string' ? value : value.toString('utf8');
  }
}

export async function createProductionA2AControlPlaneFromRedis(input: {
  redisUrl: string;
  keyPrefix?: string;
  preloadKeys?: readonly string[];
  registry?: InMemoryAgentRegistry;
  policy?: UnifiedPolicyPlane;
}): Promise<{
  controlPlane: A2AControlPlane;
  adapter: RedisBackedPersistenceAdapter;
}> {
  const registry = input.registry ?? new InMemoryAgentRegistry();
  const policy = input.policy ?? new UnifiedPolicyPlane();
  const adapter = await RedisBackedPersistenceAdapter.fromUrl({
    url: input.redisUrl,
    keyPrefix: input.keyPrefix,
    preloadKeys: input.preloadKeys,
  });
  const taskStore = new PersistentTaskStore(adapter);
  const auditLog = new PersistentAuditLogService(adapter);
  const collaboration = new PersistentCollaborationService(adapter);
  const controlPlane = new A2AControlPlane(registry, taskStore, policy, auditLog, collaboration);
  return { controlPlane, adapter };
}
