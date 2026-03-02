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

export class RedisBackedPersistenceAdapter implements A2APersistenceAdapter {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly redis: RedisKvClient,
    private readonly keyPrefix = 'a2a:persist:'
  ) {}

  static async fromClient(input: {
    redis: RedisKvClient;
    keyPrefix?: string;
    preloadKeys?: readonly string[];
  }): Promise<RedisBackedPersistenceAdapter> {
    const adapter = new RedisBackedPersistenceAdapter(input.redis, input.keyPrefix ?? 'a2a:persist:');
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
  }): Promise<RedisBackedPersistenceAdapter> {
    const redisModule = await import('redis');
    const client = redisModule.createClient({ url: input.url });
    await client.connect();
    return RedisBackedPersistenceAdapter.fromClient({
      redis: client,
      keyPrefix: input.keyPrefix,
      preloadKeys: input.preloadKeys,
    });
  }

  read(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  write(key: string, value: string): void {
    this.cache.set(key, value);
    // Best-effort write-through; local cache remains source for sync reads.
    void this.redis.set(this.prefixed(key), value);
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
