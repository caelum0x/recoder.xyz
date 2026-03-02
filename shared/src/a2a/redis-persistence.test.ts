import { describe, expect, it } from 'vitest';
import {
  DEFAULT_A2A_TASK_STORE_KEY,
  PersistentTaskStore,
} from './persistent-services';
import {
  RedisBackedPersistenceAdapter,
  createProductionA2AControlPlaneFromRedis,
  type RedisKvClient,
} from './redis-persistence';

class MockRedisClient implements RedisKvClient {
  readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async connect(): Promise<void> {}

  async quit(): Promise<void> {}
}

describe('RedisBackedPersistenceAdapter', () => {
  it('preloads keys and writes through to redis', async () => {
    const redis = new MockRedisClient();
    redis.store.set('a2a:persist:test-key', '{"hello":"world"}');

    const adapter = await RedisBackedPersistenceAdapter.fromClient({
      redis,
      preloadKeys: ['test-key'],
    });

    expect(adapter.read('test-key')).toBe('{"hello":"world"}');
    adapter.write('another-key', 'value-2');
    expect(redis.store.get('a2a:persist:another-key')).toBe('value-2');
  });

  it('flushes cached keys explicitly', async () => {
    const redis = new MockRedisClient();
    const adapter = await RedisBackedPersistenceAdapter.fromClient({ redis });

    adapter.write('k1', 'v1');
    await adapter.flush(['k1']);
    expect(redis.store.get('a2a:persist:k1')).toBe('v1');
  });
});

describe('createProductionA2AControlPlaneFromRedis', () => {
  it('builds control plane with persistent services via adapter', async () => {
    const redis = new MockRedisClient();
    const seeded = JSON.stringify({
      tasks: [],
      events: [],
    });
    redis.store.set(`a2a:persist:${DEFAULT_A2A_TASK_STORE_KEY}`, seeded);

    const adapter = await RedisBackedPersistenceAdapter.fromClient({ redis });
    const taskStore = new PersistentTaskStore(adapter);
    taskStore.create({
      id: 't1',
      threadId: 'th1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      requester: { id: 'a1', name: 'A1', platform: 'codex' },
      assignee: { id: 'a2', name: 'A2', platform: 'claude_code' },
      state: 'submitted',
      prompt: 'hello',
    });

    expect(adapter.read(DEFAULT_A2A_TASK_STORE_KEY)).toContain('"id":"t1"');
  });

  it('exposes async factory symbol', async () => {
    // This asserts the factory is callable and typed; URL path is not executed in tests.
    expect(typeof createProductionA2AControlPlaneFromRedis).toBe('function');
  });
});
